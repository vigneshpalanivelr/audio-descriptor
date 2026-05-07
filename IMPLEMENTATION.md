# QuillCast — Implementation Reference

> Living document. Update whenever a version changes, a service is added, or an architectural decision is made.
> Last updated: 7 May 2026

---

## 0. App Name

Single source of truth:

```
src/config/app.ts  →  APP_CONFIG.name = "QuillCast"
```

To rename: change only that file. Never hardcode `"QuillCast"` anywhere else.

---

## 1. High-Level Architecture

```mermaid
graph TB
    subgraph Browser["Browser (React 19 + Tailwind 4)"]
        UI[Landing / Notes UI]
        REC[Recorder Component\nMediaRecorder + Web Audio API]
        FFMPEG[ffmpeg-wasm\nChunk split > 25MB]
    end

    subgraph NextJS["Next.js 16 Server (Vercel)"]
        MW[Proxy (proxy.ts)\nAuth guard + Rate limit]
        SSR[Server Components\nSSR / RSC]
        API[Route Handlers\n/api/*]
    end

    subgraph Supabase["Supabase (managed Postgres 17)"]
        AUTH[Auth\nGoogle OAuth + Magic Link]
        DB[(Postgres\nprofiles · notes · usage · payment_events)]
        STORE[Storage\naudio bucket — private]
        RT[Realtime\nnote status events]
    end

    subgraph Jobs["Background Jobs — Inngest"]
        TRANSCRIBE[transcribe.ts\naudio.uploaded event]
        CLEANUP[cleanup.ts\nnote.transcribed event]
        COST[cost-digest.ts\ndaily cron]
    end

    subgraph STT["Speech-to-Text"]
        OAI_STT[OpenAI\ngpt-4o-mini-transcribe\ndefault]
        SARVAM[Sarvam Saaras v3\nIndic languages\nENABLE_SARVAM]
        ELEVEN[ElevenLabs Scribe v2\npremium\nENABLE_ELEVENLABS]
    end

    subgraph LLM["LLM Cleanup"]
        HAIKU[Claude Haiku 4.5\nall tiers · default]
        SONNET[Claude Sonnet 4.6\nPro tier · non-Indic]
        GEMINI[Gemini 2.5 Flash\nfallback · long context]
    end

    subgraph Payments["Payments"]
        RAZOR[Razorpay\nIndia · INR]
        LEMON[Lemon Squeezy\nGlobal · MoR · VAT/GST]
    end

    subgraph Observability["Observability"]
        SENTRY[Sentry\nerror tracking]
        POSTHOG[PostHog\nanalytics]
        PINO[Pino Logger\nrotating files + stdout]
    end

    UI -->|HTTPS| MW
    REC --> FFMPEG --> API
    MW --> SSR & API
    SSR --> AUTH & DB
    API --> AUTH & DB & STORE
    API -->|audio.uploaded event| Jobs
    TRANSCRIBE --> STT
    CLEANUP --> LLM
    CLEANUP --> DB
    TRANSCRIBE --> DB
    DB --> RT -->|WebSocket| UI
    API --> RAZOR & LEMON
    RAZOR & LEMON -->|webhooks| API
    API --> SENTRY
    SSR --> POSTHOG
    NextJS --> PINO
```

---

## 2. Request & Auth Flow

```mermaid
sequenceDiagram
    actor User
    participant Browser
    participant Middleware
    participant RouteHandler as Route Handler
    participant Supabase

    User->>Browser: navigate to /notes
    Browser->>Middleware: GET /notes (with cookies)
    Middleware->>Supabase: auth.getUser() [re-validates JWT]
    alt no session
        Supabase-->>Middleware: user = null
        Middleware-->>Browser: 302 → /auth/sign-in
    else valid session
        Supabase-->>Middleware: user = { id, email }
        Middleware-->>Browser: 200 (pass-through)
        Browser->>RouteHandler: renders /notes page
        RouteHandler->>Supabase: query notes WHERE user_id = $1 [RLS enforced]
        Supabase-->>RouteHandler: rows for this user only
        RouteHandler-->>Browser: SSR HTML
    end

    Note over Middleware,RouteHandler: Defence-in-depth: auth checked in both layers
```

---

## 3. Note Processing Pipeline

```mermaid
sequenceDiagram
    actor User
    participant App as Next.js App
    participant Supabase
    participant Inngest
    participant STT as STT API
    participant LLM as LLM API

    User->>App: Record audio (MediaRecorder)
    App->>App: ffmpeg-wasm splits > 25MB
    App->>Supabase: upload chunk → audio/ bucket
    App->>App: POST /api/upload (validate + usage check)
    App->>Supabase: INSERT notes {status: pending}
    App->>Inngest: send audio.uploaded event
    Inngest-->>App: 202 queued
    Supabase-->>App: Realtime: status=pending

    Inngest->>STT: transcribeWithOpenAI / Sarvam / ElevenLabs
    STT-->>Inngest: { transcript, language, durationSeconds }
    Inngest->>Supabase: UPDATE notes {transcript_raw, status: cleaning}
    Supabase-->>App: Realtime: status=cleaning

    Inngest->>LLM: runCleanup(transcript, intensity, tier)
    LLM-->>Inngest: { summary, model, costUsd }
    Inngest->>Supabase: UPDATE notes {summary, status: ready}
    Inngest->>Supabase: UPSERT usage {minutes_used += N}
    Supabase-->>App: Realtime: status=ready

    App-->>User: Note ready — transcript + summary shown
```

> **Inngest fallback:** When neither `INNGEST_EVENT_KEY` nor `INNGEST_DEV=1` is set, the upload route calls `processNoteDirectly()` — synchronous in-process transcription with no queue. `manage.sh` auto-sets `INNGEST_DEV=1` when the dev server is detected on `:8288`.

---

## 4. STT Routing Decision Tree

```mermaid
flowchart TD
    START([audio.uploaded event]) --> ELEVEN_PREM{ENABLE_ELEVENLABS\nAND\nELEVENLABS_PREMIUM?}
    ELEVEN_PREM -->|yes| ELEVEN[ElevenLabs Scribe v2\nall languages]
    ELEVEN_PREM -->|no| SARVAM_FLAG{ENABLE_SARVAM?}
    SARVAM_FLAG -->|no| OPENAI[OpenAI\ngpt-4o-mini-transcribe]
    SARVAM_FLAG -->|yes| INDIC{isIndianLanguage\nlanguage?}
    INDIC -->|yes| SARVAM[Sarvam Saaras v3]
    INDIC -->|no| OPENAI

    ELEVEN --> RESULT([TranscribeResult])
    SARVAM --> RESULT
    OPENAI --> RESULT
```

---

## 5. LLM Routing & Cleanup

```mermaid
flowchart TD
    START([note.transcribed event]) --> TIER{User tier?}
    TIER -->|free / starter| HAIKU[Claude Haiku 4.5]
    TIER -->|pro / pro_plus_local| LANG{isIndianLanguage\noutputLanguage?}
    LANG -->|yes| HAIKU
    LANG -->|no| SONNET[Claude Sonnet 4.6]

    HAIKU --> INTENSITY
    SONNET --> INTENSITY

    INTENSITY{intensity?} -->|verbatim| VP[buildVerbatimPrompt]
    INTENSITY -->|light| LP[buildLightCleanupPrompt]
    INTENSITY -->|full| FP[buildFullRewritePrompt]

    VP & LP & FP --> API[Anthropic messages.create]
    API --> RESULT([summary · model · costUsd])
```

> **LLM provider priority:** Anthropic → OpenAI → Gemini (first available key wins).  
> Override with `LLM_PROVIDER=anthropic|openai|gemini` in `.env.local`.

---

## 6. Security Architecture

```mermaid
graph TB
    subgraph Internet["Internet (untrusted)"]
        ATTACKER[Attacker]
        USER[User Browser]
    end

    subgraph Edge["Edge / CDN (Vercel)"]
        HEADERS[HTTP Security Headers\nCSP · HSTS · X-Frame-Options\nX-Content-Type-Options\nPermissions-Policy · Referrer-Policy]
    end

    subgraph Middleware["Next.js Middleware"]
        RL_UPLOAD[Rate limit\n/api/upload · /api/transcribe\n10 req/min/IP]
        RL_SIGNIN[Rate limit\nPOST /auth/sign-in\n5 req/min/IP]
        AUTH_CHECK[Auth guard\nsupabase.auth.getUser\nre-validates JWT]
    end

    subgraph RouteLayer["Route Handlers"]
        AUTH2[Auth + admin check\ndefence-in-depth]
        ZOD[Zod validation\nall inputs at boundary]
        UUID[UUID schema\npath param guard]
        MIME[MIME allowlist\naudio only]
        AUDIO_URL[validateAudioUrl\nSSRF prevention]
        REDIRECT[isSafeRedirectPath\nopen redirect prevention]
        CSRF[Origin check\nCSRF on sign-out]
        HMAC[HMAC-SHA256\ntiming-safe compare\nRazorpay + LemonSqueezy]
        BIDI[sanitizeText\nBiDi override strip\nnull byte strip]
    end

    subgraph DB["Supabase / DB Layer"]
        RLS[Row Level Security\nall tables\nusers see only own rows]
        PARAM[Parameterised queries\nno raw SQL]
        MAP[Map accumulator\nno object injection]
    end

    ATTACKER -->|SSRF attempt| AUDIO_URL
    ATTACKER -->|Open redirect| REDIRECT
    ATTACKER -->|Webhook spoof| HMAC
    ATTACKER -->|CSRF sign-out| CSRF
    ATTACKER -->|BiDi trojan source| BIDI
    ATTACKER -->|Rate abuse| RL_UPLOAD & RL_SIGNIN
    ATTACKER -->|No session| AUTH_CHECK
    ATTACKER -->|Non-admin| AUTH2
    ATTACKER -->|SQL injection| ZOD & PARAM
    ATTACKER -->|IDOR| UUID & RLS

    USER --> HEADERS --> Middleware --> RouteLayer --> DB
```

---

## 7. Database Schema

```mermaid
erDiagram
    profiles {
        uuid id PK "auth.users FK"
        text display_name
        text default_language
        text default_intensity
        text default_stt_engine
        text default_llm_model
        text ui_locale
        text tier "free|starter|pro|pro_plus_local"
        text subscription_status
        text subscription_provider
        text subscription_ref
        boolean is_admin
        int login_count
        timestamptz last_seen_at
        timestamptz created_at
    }

    notes {
        uuid id PK
        uuid user_id FK
        text title
        text transcript_raw
        text summary
        text custom_prompt "migration 20260502"
        text audio_storage_path
        numeric audio_duration_sec
        text language_detected
        text language_output
        text intensity "verbatim|light|full"
        text stt_engine
        text llm_model
        text status "pending|transcribing|cleaning|ready|failed"
        text error
        numeric cost_usd
        text[] tags
        boolean is_starred
        boolean is_archived
        boolean is_pinned "migration 20260503"
        timestamptz created_at
        timestamptz ready_at
    }

    note_versions {
        uuid id PK
        uuid note_id FK
        uuid user_id FK
        text intensity "verbatim|light|full|custom"
        text custom_prompt
        text summary
        text llm_model
        numeric cost_usd
        timestamptz created_at
    }

    usage {
        uuid id PK
        uuid user_id FK
        text month "YYYY-MM"
        numeric minutes_used
        int notes_count
        numeric cost_usd
        timestamptz updated_at
    }

    payment_events {
        uuid id PK
        uuid user_id FK
        text provider "razorpay|lemonsqueezy"
        text event_type
        text external_event_id "idempotency key"
        jsonb payload
        timestamptz created_at
    }

    audit_logs {
        uuid id PK
        uuid user_id
        text event_type
        text resource_type
        text resource_id
        text ip_address
        text user_agent
        jsonb metadata
        timestamptz created_at
    }

    user_sessions {
        uuid id PK
        uuid user_id FK
        timestamptz logged_in_at
        timestamptz logged_out_at
        boolean is_active
        text ip_address
    }

    profiles ||--o{ notes : "owns"
    notes ||--o{ note_versions : "archives to"
    profiles ||--o{ usage : "tracks"
    profiles ||--o{ payment_events : "triggers"
    profiles ||--o{ audit_logs : "generates"
    profiles ||--o{ user_sessions : "creates"
```

---

## 8. CI Pipeline

```mermaid
graph LR
    PUSH[git push] --> QUALITY

    subgraph Stage1["Stage 1 — parallel"]
        QUALITY[Lint + Format\n+ Typecheck]
        AUDIT[Dependency\nAudit\npnpm audit --high]
    end

    QUALITY --> SHELL[Shell Tests\nmanage.test.sh\n70 tests]
    QUALITY --> UNIT[Unit + Integration\n+ Coverage\n100% threshold]
    QUALITY --> SEC[Security Tests\n65 scenarios]

    SHELL & UNIT & SEC --> E2E[E2E Tests\nPlaywright chromium\ngolden path smoke]
    AUDIT --> GREEN

    E2E --> GREEN[all-green ✓\nPR can merge]

    style GREEN fill:#16a34a,color:#fff
    style QUALITY fill:#2563eb,color:#fff
    style AUDIT fill:#2563eb,color:#fff
```

---

## 9. Tech Stack — Exact Versions

| Layer                   | Library / Service               | Version                             | Notes                       |
| ----------------------- | ------------------------------- | ----------------------------------- | --------------------------- |
| **Runtime**             | Node.js                         | 22.x (`.nvmrc`)                     |                             |
| **Package manager**     | pnpm                            | 10.x                                | Never `npm install`         |
| **Frontend framework**  | Next.js                         | **16.2.4** (App Router)             |                             |
| **UI library**          | React                           | 19.2.4                              |                             |
| **Language**            | TypeScript                      | 5.x strict                          | No `any`                    |
| **Styling**             | Tailwind CSS                    | 4.x                                 |                             |
| **DB / Auth / Storage** | Supabase                        | `@supabase/supabase-js` 2.x         | Postgres 17 + RLS           |
| **Auth SSR**            | `@supabase/ssr`                 | 0.6.x                               | Cookie-based sessions       |
| **Background jobs**     | Inngest                         | 3.x                                 | transcribe + cleanup + cron |
| **STT — default**       | OpenAI `gpt-4o-mini-transcribe` | `openai` 5.x                        |                             |
| **STT — Indic**         | Sarvam Saaras v3                | REST                                | `ENABLE_SARVAM` flag        |
| **STT — premium**       | ElevenLabs Scribe v2            | REST                                | `ENABLE_ELEVENLABS` flag    |
| **LLM — default**       | Claude Haiku 4.5                | `@anthropic-ai/sdk` 0.52.x          | `claude-haiku-4-5-20251001` |
| **LLM — Pro**           | Claude Sonnet 4.6               | (same)                              | `claude-sonnet-4-6`         |
| **LLM — fallback**      | Gemini 2.5 Flash                | `@google/generative-ai` 0.24.x      | Long context                |
| **Payments (India)**    | Razorpay                        | `razorpay` 2.x                      | UPI AutoPay, INR            |
| **Payments (global)**   | Lemon Squeezy                   | `@lemonsqueezy/lemonsqueezy.js` 4.x | MoR — handles VAT/GST       |
| **Error monitoring**    | Sentry                          | `@sentry/nextjs` 9.x                |                             |
| **Analytics**           | PostHog                         | `posthog-js` 1.x                    | Replay off on `/notes`      |
| **Logging**             | Pino                            | 10.x + rotating-file-stream         | PII redacted in 34 fields   |
| **Audio codec**         | ffmpeg-wasm                     | `@ffmpeg/ffmpeg` 0.12.x             | Browser-side chunk split    |
| **Unit tests**          | Vitest                          | 3.x                                 | Native ESM, workers         |
| **Component tests**     | React Testing Library           | 16.x                                |                             |
| **E2E**                 | Playwright                      | 1.x                                 | Chromium only in CI         |
| **Coverage**            | `@vitest/coverage-v8`           | 3.x                                 | 100% threshold enforced     |
| **Linter**              | ESLint                          | 9.x flat config                     |                             |
| **Security lint**       | `eslint-plugin-security`        | 3.x                                 | Flags dangerous patterns    |
| **Code quality lint**   | `eslint-plugin-sonarjs`         | 4.x                                 | Cognitive complexity        |
| **Formatter**           | Prettier                        | 3.x                                 |                             |
| **Pre-commit hooks**    | Husky + lint-staged             | 9.x / 15.x                          |                             |

---

## 10. Folder Structure (current state)

```
src/
├── app/
│   ├── (admin)/
│   │   └── admin/page.tsx              ✅ Admin dashboard — double auth guard
│   ├── (app)/
│   │   ├── layout.tsx                  ✅ Auth guard + UserMenu with display_name
│   │   ├── notes/page.tsx              ✅ Notes list (50 cards + status badges)
│   │   ├── notes/new/page.tsx          ✅ Recorder page
│   │   └── notes/[id]/
│   │       ├── page.tsx                ✅ Note detail shell (server)
│   │       └── NoteDetailClient.tsx    ✅ Full-featured note detail (client):
│   │                                      title edit (debounced) · transcript/summary
│   │                                      side-by-side · inline summary edit · delete
│   │                                      (2-step confirm) · audio countdown timer ·
│   │                                      download audio · regenerate (3 intensities +
│   │                                      custom prompt) · version history expand
│   ├── api/
│   │   ├── admin/
│   │   │   ├── stats/route.ts          ✅ Admin stats
│   │   │   └── users/route.ts          ✅ Paginated users
│   │   ├── inngest/route.ts            ✅ Inngest webhook handler
│   │   ├── notes/
│   │   │   └── [id]/
│   │   │       ├── route.ts            ✅ GET (error.code check) · PATCH · DELETE
│   │   │       ├── audio/route.ts      ✅ GET signed URL; 410 + lazy cleanup on expiry
│   │   │       └── regenerate/route.ts ✅ POST — re-run LLM; saves version history
│   │   ├── payments/
│   │   │   ├── razorpay/               ✅ checkout + webhook (HMAC, idempotent)
│   │   │   └── lemonsqueezy/           ✅ checkout + webhook (sha256=, idempotent)
│   │   └── upload/route.ts             ✅ Audio upload + Inngest/direct fallback
│   ├── auth/
│   │   ├── callback/route.ts           ✅ PKCE + safe redirect
│   │   ├── sign-in/page.tsx            ✅ Google OAuth + magic link
│   │   └── sign-out/route.ts           ✅ POST + CSRF origin check
│   ├── error.tsx                       ✅ Error boundary
│   ├── global-error.tsx                ✅ Root error boundary
│   ├── layout.tsx                      ✅ Root layout
│   └── page.tsx                        ✅ Landing page — auth-aware nav
├── components/
│   ├── UserMenu.tsx                    ✅ Username + ▾ dropdown, closes on outside click
│   ├── recording/Recorder.tsx          ✅ MediaRecorder (default intensity: verbatim)
│   └── providers/                      ✅ PostHog + Sentry providers
├── config/
│   └── app.ts                          ✅ APP_CONFIG single source of truth
├── lib/
│   ├── api/error.ts                    ✅ Typed API errors + Zod formatter
│   ├── cost/cap.ts                     ✅ Daily spend cap ($20)
│   ├── llm/
│   │   ├── route.ts                    ✅ 3 providers; customPrompt? param
│   │   └── prompts/                    ✅ verbatim · light · full · title · write-like-me
│   ├── logger/
│   │   ├── index.ts                    ✅ Pino + PII redaction (34 fields)
│   │   │                                  dev: multistream (pino-pretty + file)
│   │   │                                  prod: multistream (stdout + rotating file)
│   │   └── audit.ts                    ✅ 31 event types incl. note.updated
│   ├── note-processor/
│   │   └── index.ts                    ✅ Direct (sync) transcription fallback
│   ├── payments/
│   │   ├── razorpay.ts                 ✅ Order create + plan lookup
│   │   └── lemonsqueezy.ts             ✅ Checkout URL + plan lookup
│   ├── security/
│   │   ├── ratelimit.ts                ✅ In-memory; upload·regen·checkout·signIn limits
│   │   ├── sanitize.ts                 ✅ UUID/MIME/text/audioUrl/redirect + BiDi strip
│   │   └── webhook.ts                  ✅ HMAC-SHA256 timing-safe + sha256= prefix
│   ├── stt/
│   │   ├── route.ts                    ✅ STT routing decision tree
│   │   ├── languages.ts                ✅ INDIAN_LANGUAGES
│   │   ├── openai.ts · sarvam.ts · elevenlabs.ts · gemini.ts
│   │   └── types.ts
│   ├── inngest/
│   │   ├── client.ts                   ✅ typed EventSchemas
│   │   ├── transcribe.ts               ✅ audio.uploaded → STT
│   │   ├── cleanup.ts                  ✅ note.transcribed → LLM + usage
│   │   └── cost-digest.ts              ✅ daily cron → Resend email
│   ├── supabase/
│   │   ├── client.ts · server.ts · service.ts
│   └── usage/limits.ts                 ✅ Tier caps · canRecord · duration limit
├── proxy.ts                            ✅ Auth guard + rate limit (Next.js 16 proxy)
│                                          3 s timeout on supabase.auth.getUser()
└── types/index.ts                      ✅ UserTier · NoteIntensity · NoteVersionIntensity

supabase/migrations/
├── 20260501000000_init.sql             ✅ profiles · notes · usage · payment_events + RLS
├── 20260501000001_audit_and_admin.sql  ✅ audit_logs · user_sessions · admin SQL functions
├── 20260501000002_storage_bucket.sql   ✅ private audio bucket + RLS policies
├── 20260502000000_note_versions.sql    ✅ note_versions table · notes.custom_prompt column
└── 20260503000000_pinned.sql           ✅ notes.is_pinned column + composite index

tests/
├── unit/
│   ├── app/api/
│   │   ├── notes/
│   │   │   ├── get.test.ts             ✅  8 tests (incl. 500 for non-PGRST116 errors)
│   │   │   ├── patch.test.ts           ✅ 16 tests
│   │   │   ├── delete.test.ts          ✅  8 tests
│   │   │   └── regenerate.test.ts      ✅ 13 tests
│   │   └── upload/route.test.ts        ✅  6 tests (incl. INNGEST_DEV=1 path)
│   ├── components/
│   │   └── UserMenu.test.tsx           ✅  7 tests (RTL)
│   └── lib/
│       ├── api/error.test.ts           ✅ 20 tests
│       ├── cost/cap.test.ts            ✅ 11 tests
│       ├── llm/route.test.ts           ✅ 47 tests (3 providers + custom prompt)
│       ├── llm/prompts.test.ts         ✅ 14 tests
│       ├── logger/audit.test.ts        ✅ 17 tests
│       ├── logger/index.test.ts        ✅ 11 tests
│       ├── note-processor/index.test.ts ✅  8 tests
│       ├── payments/razorpay.test.ts   ✅  9 tests
│       ├── payments/lemonsqueezy.test.ts ✅ 13 tests
│       ├── security/ratelimit.test.ts  ✅  4 tests
│       ├── security/sanitize.test.ts   ✅ 40 tests
│       ├── security/webhook.test.ts    ✅ 13 tests
│       ├── stt/route.test.ts           ✅ 12 tests
│       ├── stt/languages.test.ts       ✅  5 tests
│       └── usage/limits.test.ts        ✅ 25 tests
├── security/
│   ├── attack-scenarios.test.ts        ✅ 55 attack scenarios
│   └── admin-access-control.test.ts    ✅ 10 scenarios
├── shell/
│   └── manage.test.sh                  ✅ 70 bash unit tests
└── e2e/
    └── smoke.test.ts                   ✅ Landing page + auth smoke

Total vitest tests: 372 — 100% coverage (lines/functions/branches/statements)
```

---

## 11. What We Own vs. Outsource

| Concern                      | Outsourced to                              | What we build                                 |
| ---------------------------- | ------------------------------------------ | --------------------------------------------- |
| **Authentication**           | Supabase Auth (Google OAuth + magic links) | Sign-in UI + callback route                   |
| **Database**                 | Supabase (managed Postgres)                | Schema migrations + RLS policies              |
| **File storage**             | Supabase Storage                           | Upload logic + signed URL generation          |
| **Realtime (live status)**   | Supabase Realtime                          | Client subscription hook                      |
| **Background jobs / queues** | Inngest                                    | Job function code (transcribe, cleanup, cron) |
| **Speech-to-Text**           | OpenAI / Sarvam / ElevenLabs / Gemini      | Routing logic + adapter wrappers              |
| **LLM cleanup**              | Anthropic / OpenAI / Gemini                | Prompt templates + routing logic              |
| **Audio codec**              | ffmpeg-wasm (browser-side)                 | Chunk-split logic for files > 25 MB           |
| **Email delivery**           | Resend                                     | Email template + API call                     |
| **Payments — India**         | Razorpay                                   | Checkout initiation + webhook handler         |
| **Payments — Global**        | Lemon Squeezy (MoR, handles GST/VAT)       | Checkout link + webhook handler               |
| **Frontend hosting**         | Vercel                                     | Zero-config (push to deploy)                  |
| **Error monitoring**         | Sentry                                     | Error boundary wrapper + DSN config           |
| **Product analytics**        | PostHog                                    | Event calls + session replay setup            |

**What we fully own:**
Recording UI · STT routing · LLM routing + prompts · Notes list + detail UI · Usage tracking + enforcement · Payment webhook handlers · Cost-tracking cron + daily cap guard · Admin dashboard · Landing page

---

## 12. Security Hardening — Implemented

| ID  | Severity | Vulnerability                    | File fixed                 | Test file                                       |
| --- | -------- | -------------------------------- | -------------------------- | ----------------------------------------------- |
| V1  | CRITICAL | Open redirect via `?next=` param | `auth/callback/route.ts`   | `sanitize.test.ts`                              |
| V2  | CRITICAL | SSRF via unvalidated `audioUrl`  | `lib/security/sanitize.ts` | `sanitize.test.ts` · `attack-scenarios.test.ts` |
| V3  | HIGH     | No HTTP security headers         | `next.config.ts`           | — (verified by curl)                            |
| V4  | HIGH     | CSRF on POST `/auth/sign-out`    | `auth/sign-out/route.ts`   | —                                               |
| V5  | HIGH     | LemonSqueezy webhook bypass      | `lib/security/webhook.ts`  | `webhook.test.ts`                               |
| V6  | MEDIUM   | BiDi trojan-source injection     | `lib/security/sanitize.ts` | `sanitize.test.ts` · `attack-scenarios.test.ts` |
| V7  | MEDIUM   | Auth routes not rate-limited     | `proxy.ts`                 | `attack-scenarios.test.ts`                      |
| V8  | MEDIUM   | `getSession()` in admin page     | `(admin)/admin/page.tsx`   | `admin-access-control.test.ts`                  |

---

## 13. Implementation Progress

### Sessions 1–5 — MVP ✅ Complete

All Phase 1 deliverables shipped: project scaffold, landing page, auth, recorder UI, Inngest pipeline, notes CRUD, payments, observability.

### Session 6 — UX polish, note CRUD, verbatim default ✅ Complete

| Deliverable                                          | Status | Notes                                                                                 |
| ---------------------------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| Fix "Note not found" bug                             | ✅     | Removed `custom_prompt` from fetchNote SELECT; PGRST116 vs other errors distinguished |
| QuillCast logo → clickable `<Link href="/">`         | ✅     | Landing page + app layout                                                             |
| `UserMenu` component — username + ▾ dropdown         | ✅     | Closes on outside click; 7 RTL unit tests                                             |
| App layout fetches `display_name`                    | ✅     | Username visible on every authenticated page                                          |
| `DELETE /api/notes/[id]`                             | ✅     | Removes audio from Storage, then deletes note row                                     |
| `PATCH /api/notes/[id]`                              | ✅     | Updates summary and/or title; audit logged                                            |
| `GET /api/notes/[id]/audio`                          | ✅     | 5-min signed URL; 410 + lazy cleanup on 24 h expiry                                   |
| Audio expiry countdown timer                         | ✅     | 24 h from `ready_at`; amber < 1 h; updates every second                               |
| Download audio button                                | ✅     | Calls audio API; triggers `<a>.click()`                                               |
| Two-step delete confirmation                         | ✅     | "Delete this note?" → "Yes, delete" / "Cancel"                                        |
| Inline summary editing                               | ✅     | Edit / Save / Cancel toggle; calls PATCH route                                        |
| Default intensity → `"verbatim"` everywhere          | ✅     | Recorder initial state + upload route default                                         |
| `note.updated` audit event                           | ✅     | `src/lib/logger/audit.ts`                                                             |
| `NoteReadyContent` sub-component extracted           | ✅     | Reduces cognitive complexity below sonarjs limit                                      |
| `middleware.ts` → `proxy.ts`                         | ✅     | Next.js 16 breaking change; deprecation warning gone                                  |
| 3-second timeout on `supabase.auth.getUser()`        | ✅     | Prevents 26-second hang when Supabase unreachable                                     |
| `manage.sh`: `timeout 5 docker info`                 | ✅     | Fails fast when Docker Desktop is closed                                              |
| `manage.sh`: `supabase start` streams live via `tee` | ✅     | Progress visible during container startup                                             |

### Session 7 — Bug fixes, logging, remote Supabase, setup guide ✅ Complete

| Deliverable                       | Status | Notes                                                                                                         |
| --------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| Fix Inngest dev mode skip         | ✅     | Upload route now checks `INNGEST_DEV=1` alongside `INNGEST_EVENT_KEY`                                         |
| Fix GET 404 masking DB errors     | ✅     | `error.code === "PGRST116"` checked before `!data`; other errors → 500                                        |
| Fix logger double timestamp       | ✅     | Removed `{time}` from `messageFormat`; pino-pretty prefix is sufficient                                       |
| Logger file output in dev mode    | ✅     | `buildTransports()` uses `pino.multistream` in both dev and prod; logs always written to `logs/quillcast.log` |
| `manage.sh`: auto `supabase link` | ✅     | `maybe_supabase_link()` runs `supabase link --project-ref $SUPABASE_PROJECT_REF` on start/stop/restart        |
| `SUPABASE_PROJECT_REF` env var    | ✅     | Added to `.env.example`, shown in `./manage.sh config`                                                        |
| Remote Supabase documentation     | ✅     | `CLAUDE.md` updated with remote workflow, Google OAuth steps, auto-link behaviour                             |
| New upload route tests            | ✅     | 6 tests covering Inngest dev mode, event key, and direct fallback paths                                       |
| New GET notes tests               | ✅     | 8 tests including 500 for non-PGRST116 DB errors                                                              |
| `setup.md` created                | ✅     | End-to-end setup guide (prerequisites → DB → OAuth → LLM → deploy)                                            |

### Phase 2 — Competitive Parity (Weeks 5–10)

- Expo native iOS + Android apps (reusing TS lib code)
- Folders, tags, full-text search (`tsvector` + `pg_search`)
- Custom user prompts (saved per profile)
- Style library (blog post, LinkedIn, email, journal, meeting notes, SOAP note)
- "Write Like Me" — Sonnet 4.6, 3–5 writing samples as in-prompt examples
- "SuperSummary" across notes (Gemini 2.5 Pro, 1M context)
- Auto language detection pill on recorder
- UI localisation for 5 languages (next-intl)
- Native Notion + Obsidian + Apple Notes integrations (no Zapier)
- Public API + webhooks (Pro tier)
- Affiliate program (Lemon Squeezy built-in, 30% recurring)
- Share-as-image generator (canvas, branded watermark on Free)

### Phase 3 — Differentiation (Weeks 11–24)

- WhatsApp bot: voice capture → QuillCast → notes saved to account
- "Ask your notes" RAG (pgvector, `text-embedding-3-small`)
- Smart reminders (LLM extracts action items → push)
- Mac dictation app (Tauri + system-wide hotkey)
- On-device Whisper mode (`whisper.cpp` WASM, Pro+ Local tier)
- Team plan ($49/mo flat, shared prompts, admin privacy guarantee)
- Vertical landing pages: `/for-doctors`, `/for-lawyers`, `/for-students`
- Chrome extension
- HIPAA/BAA pathway (after vendor BAAs are signed)

---

## 14. Production Deployment Checklist

### Required — app will not work without these

| Item                                | Status | Action                                                                                   |
| ----------------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| Vercel project created              | ⏳     | [vercel.com](https://vercel.com) → New Project → import GitHub repo                      |
| `NEXT_PUBLIC_APP_URL`               | ⏳     | Set to `https://<your-app>.vercel.app` (or custom domain) on Vercel                      |
| Supabase remote credentials         | ✅     | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Remote DB migrations applied        | ⏳     | `supabase link --project-ref <ref>` → `./manage.sh db remote`                            |
| Google OAuth — Supabase Dashboard   | ⏳     | **Authentication → Providers → Google → enable** → paste Client ID + Secret              |
| Google OAuth — Google Cloud Console | ⏳     | Add `https://<your-app>.vercel.app/auth/callback` to Authorised Redirect URIs            |
| At least one LLM key                | ✅     | `ANTHROPIC_API_KEY` (recommended) or `OPENAI_API_KEY` or `GOOGLE_GEMINI_API_KEY`         |
| At least one STT key                | ✅     | `OPENAI_API_KEY` (Whisper) or `GOOGLE_GEMINI_API_KEY` (Gemini STT)                       |
| `DAILY_COST_CAP_USD`                | ⏳     | Set to a safe limit on Vercel (default 20)                                               |

### Optional — enhances production but not blocking

| Item                            | Status | Action                                                                                                                                                             |
| ------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Custom domain                   | ⏳     | Vercel → Settings → Domains; update `NEXT_PUBLIC_APP_URL` + Google OAuth redirect URI                                                                              |
| Inngest production keys         | ⏳     | `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`; register serve URL in Inngest dashboard; **without these, notes are processed synchronously (slower but functional)** |
| Razorpay (India payments)       | ⏳     | `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET/PLAN_*`; see `setup.md §8`                                                                                                  |
| Lemon Squeezy (global payments) | ⏳     | `LEMONSQUEEZY_API_KEY/STORE_ID/WEBHOOK_SECRET/VARIANT_*`; see `setup.md §8`                                                                                        |
| Sentry error tracking           | ⏳     | `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_DSN` + `SENTRY_AUTH_TOKEN`                                                                                                      |
| PostHog analytics               | ⏳     | `NEXT_PUBLIC_POSTHOG_KEY`                                                                                                                                          |
| Resend email (cost digest)      | ⏳     | `RESEND_API_KEY` + `FROM_EMAIL` + `DIGEST_EMAIL`                                                                                                                   |

### Vercel environment variables — full list

Copy all from your `.env.local` into Vercel → Settings → Environment Variables. Key overrides for production:

```
NEXT_PUBLIC_APP_URL=https://<your-app>.vercel.app
NODE_ENV=production
```

> **Tip:** Use the [Supabase Vercel integration](https://vercel.com/integrations/supabase) to auto-sync `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

### Post-deploy smoke test

After deploying, run through this sequence to verify end-to-end:

1. `pnpm lint && pnpm typecheck` — zero errors
2. `https://<your-app>.vercel.app` → landing page renders with pricing table
3. Click **Sign in → Continue with Google** → OAuth completes → redirected to `/notes`
4. Click **New Note** → recorder loads → record 10 seconds → submit
5. Note status moves: `pending → transcribing → cleaning → ready` in real time
6. Notes list shows new card; click it → side-by-side transcript + summary
7. Click **Regenerate** → choose Full intensity → summary updates
8. Supabase Dashboard: `notes` table has a row; `audio` bucket has the file; `usage` table has `minutes_used > 0`
9. Inngest dashboard (if configured): `transcribe` + `cleanup` functions succeeded
10. Sentry (if configured): no unhandled errors in the session

---

## 15. Local Development Setup

> **Full step-by-step instructions** (prerequisites → DB → OAuth → LLM → start) are in **`setup.md`**.

### Quick start

```bash
./manage.sh start dev    # shows config, starts Supabase if local, starts Next.js dev
./manage.sh stop         # graceful shutdown
./manage.sh restart dev  # stop + start
./manage.sh logs         # tail logs/quillcast.log with colour
./manage.sh status       # PID, URL, admin link
./manage.sh config       # print all env vars (secrets redacted)
./manage.sh admin        # admin URL + grant-access SQL
./manage.sh help         # full command reference
```

### Database commands

```bash
./manage.sh db start    # start local Docker stack + apply migrations
./manage.sh db stop     # stop local stack (data preserved in volume)
./manage.sh db push     # apply pending migrations to local DB
./manage.sh db remote   # apply pending migrations to linked remote project
./manage.sh db reset    # drop + recreate local DB (destructive)
./manage.sh db status   # check if local stack is running
```

### Local Supabase URLs

| Service         | URL                                                       |
| --------------- | --------------------------------------------------------- |
| API / Auth      | `http://127.0.0.1:54321`                                  |
| Supabase Studio | `http://localhost:54323`                                  |
| DB (psql)       | `postgresql://postgres:postgres@localhost:54322/postgres` |
| Inbucket        | `http://localhost:54324`                                  |
| Inngest UI      | `http://localhost:8288` (when dev server is running)      |

### Running tests

```bash
pnpm test              # unit + coverage (must stay 100%)
pnpm test:coverage     # explicit coverage report
pnpm test:security     # attack simulation suite
pnpm test:e2e          # Playwright (requires server running)
bash tests/shell/manage.test.sh   # shell unit tests (70 cases)
```

---

## 16. Coding Standards

### TypeScript

- `strict: true` — no exceptions, no `any`
- `unknown` + type guards at all external boundaries
- Zod for all API inputs, webhook payloads, env validation
- All route handlers must have explicit `Promise<Response>` return types

### React / Next.js

> Read `node_modules/next/dist/docs/` before writing Next.js code — this version (16.x) has breaking changes.

- Server components by default; `"use client"` only for state/refs/effects/browser APIs
- DB access only in server components, server actions, or route handlers
- `getUser()` for auth-sensitive operations (not `getSession()` — cached, stale)

### Security (mandatory for every new feature)

- [ ] Zod validation at every API boundary
- [ ] Auth checked in middleware AND route handler (defence-in-depth)
- [ ] RLS policy for every new Supabase table
- [ ] Webhook signature verified (HMAC timing-safe) before processing
- [ ] Rate limiting applied to the route
- [ ] No API keys in client-side code
- [ ] No PII in Sentry/PostHog/logs (`REDACTED_PATHS` in `logger/index.ts`)
- [ ] `pnpm audit --audit-level=high` passing
- [ ] Security test written for the new attack surface
- [ ] `pnpm lint && pnpm typecheck` clean

### Commits

- Format: `type(scope): short description` (Conventional Commits)
- Types: `feat` `fix` `chore` `test` `docs` `security` `refactor`
- Commit after every meaningful unit — never batch unrelated changes
- Always push immediately: `git push -u origin claude/review-project-setup-dapqK`
- Run `pnpm lint && pnpm typecheck` before every commit

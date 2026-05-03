# QuillCast — Implementation Reference

> Living document. Update whenever a version changes, a service is added, or an architectural decision is made.
> Last updated: 2 May 2026

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
        MW[Middleware\nAuth guard + Rate limit]
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
        GEMINI[Gemini 3 Flash\nfallback · long context]
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
        RLS[Row Level Security\nall 4 tables\nusers see only own rows]
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
        timestamptz created_at
        timestamptz ready_at
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
    QUALITY --> SEC[Security Tests\n51 attack scenarios]

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
| **LLM — fallback**      | Gemini 3 Flash                  | `@google/generative-ai` 0.24.x      | Long context                |
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
│   │   └── admin/page.tsx          ✅ Admin dashboard — double auth guard
│   ├── (app)/
│   │   ├── layout.tsx              ✅ Auth guard layout (server component)
│   │   ├── notes/page.tsx          ✅ Empty state + "New Note" stub
│   │   ├── notes/new/page.tsx      ✅ Recorder page
│   │   └── notes/[id]/page.tsx     ✅ Note detail — title edit + status polling
│   ├── api/
│   │   ├── admin/
│   │   │   ├── stats/route.ts      ✅ Admin stats (auth + admin check)
│   │   │   └── users/route.ts      ✅ Paginated users (Zod-validated params)
│   │   ├── inngest/route.ts        ✅ Inngest webhook (GET/POST/PUT serve handler)
│   │   └── upload/route.ts         ✅ Audio upload + Inngest event dispatch
│   ├── auth/
│   │   ├── callback/route.ts       ✅ PKCE code exchange + safe redirect
│   │   ├── sign-in/
│   │   │   ├── page.tsx            ✅ Server component with redirect guard
│   │   │   └── SignInForm.tsx      ✅ Google OAuth + magic link (client)
│   │   └── sign-out/route.ts       ✅ POST handler + CSRF origin check
│   ├── error.tsx                   ✅ Error boundary
│   ├── global-error.tsx            ✅ Root error boundary
│   ├── layout.tsx                  ✅ Root layout (Geist font + metadata)
│   └── page.tsx                    ✅ Landing page (hero, pricing, FAQ)
├── config/
│   └── app.ts                      ✅ APP_CONFIG — single source of name
├── lib/
│   ├── api/error.ts                ✅ Typed API errors + Zod formatter
│   ├── llm/
│   │   ├── route.ts                ✅ Model selection + runCleanup + generateTitle
│   │   └── prompts/                ✅ verbatim · light · full · title · write-like-me
│   ├── logger/
│   │   ├── index.ts                ✅ Pino + PII redaction (34 fields) + child loggers
│   │   └── audit.ts                ✅ 30+ event types · DB persistence · user masking
│   ├── security/
│   │   ├── ratelimit.ts            ✅ In-memory rate limiter + RATE_LIMITS config
│   │   ├── sanitize.ts             ✅ UUID/MIME/text/audioUrl/redirect validators + BiDi strip
│   │   └── webhook.ts              ✅ HMAC-SHA256 timing-safe + LemonSqueezy sha256= prefix
│   ├── stt/
│   │   ├── route.ts                ✅ Routing decision tree
│   │   ├── languages.ts            ✅ INDIAN_LANGUAGES constant
│   │   ├── types.ts                ✅ TranscribeRequest / TranscribeResult
│   │   ├── openai.ts               ✅ gpt-4o-mini-transcribe adapter
│   │   ├── sarvam.ts               ✅ Saaras v3 adapter (feature-flagged)
│   │   └── elevenlabs.ts           ✅ Scribe v2 adapter (feature-flagged)
│   ├── inngest/
│   │   ├── client.ts               ✅ Inngest client + typed EventSchemas
│   │   ├── transcribe.ts           ✅ transcribeNote function (audio.uploaded)
│   │   └── cleanup.ts              ✅ cleanupNote function (note.transcribed)
│   ├── supabase/
│   │   ├── client.ts               ✅ Browser client
│   │   ├── server.ts               ✅ Server client (SSR cookies)
│   │   └── service.ts              ✅ Service-role (Inngest jobs only)
│   └── usage/limits.ts             ✅ Tier caps · canRecord · getNoteDurationLimit
├── middleware.ts                   ✅ Auth guard + rate limit (upload + sign-in routes)
└── types/index.ts                  ✅ Shared types (UserTier, Note, Profile, etc.)

tests/
├── unit/lib/
│   ├── api/error.test.ts           ✅ 20 tests
│   ├── llm/route.test.ts           ✅ 14 tests
│   ├── llm/prompts.test.ts         ✅ 14 tests
│   ├── logger/audit.test.ts        ✅ 17 tests
│   ├── logger/index.test.ts        ✅ 10 tests
│   ├── security/ratelimit.test.ts  ✅ 4 tests
│   ├── security/sanitize.test.ts   ✅ 40 tests (incl. SSRF + open redirect + BiDi)
│   ├── security/webhook.test.ts    ✅ 13 tests (incl. sha256= prefix)
│   ├── stt/route.test.ts           ✅ 9 tests
│   ├── stt/languages.test.ts       ✅ 5 tests
│   └── usage/limits.test.ts        ✅ 25 tests
├── security/
│   ├── attack-scenarios.test.ts    ✅ 42 attack scenarios
│   └── admin-access-control.test.ts ✅ 10 scenarios
├── shell/
│   └── manage.test.sh              ✅ 70 bash unit tests
└── e2e/
    └── smoke.test.ts               ✅ Landing page + auth smoke
```

---

## 11. Security Hardening — Implemented

```mermaid
graph LR
    subgraph Fixed["Vulnerabilities Fixed"]
        V1["CRITICAL: Open Redirect\n?next= param validated\nisSafeRedirectPath()"]
        V2["CRITICAL: SSRF\naudioUrl origin allowlist\nvalidateAudioUrl()"]
        V3["HIGH: Missing HTTP Headers\nCSP · HSTS · X-Frame-Options\nnext.config.ts headers()"]
        V4["HIGH: CSRF on sign-out\nOrigin header check\n403 on cross-origin POST"]
        V5["HIGH: LemonSqueezy sig bug\nsha256= prefix stripped\nbefore HMAC compare"]
        V6["MEDIUM: BiDi smuggling\nU+202A–202E U+2066–2069\nstripped from user text"]
        V7["MEDIUM: Auth brute-force\nPOST /auth/sign-in rate limited\n5 req/min/IP"]
        V8["MEDIUM: Stale JWT\ngetUser() replaces getSession()\nin admin page"]
    end
```

| ID  | Severity | Vulnerability                    | File fixed                 | Test file                                       |
| --- | -------- | -------------------------------- | -------------------------- | ----------------------------------------------- |
| V1  | CRITICAL | Open redirect via `?next=` param | `auth/callback/route.ts`   | `sanitize.test.ts`                              |
| V2  | CRITICAL | SSRF via unvalidated `audioUrl`  | `lib/security/sanitize.ts` | `sanitize.test.ts` · `attack-scenarios.test.ts` |
| V3  | HIGH     | No HTTP security headers         | `next.config.ts`           | — (verified by curl)                            |
| V4  | HIGH     | CSRF on POST `/auth/sign-out`    | `auth/sign-out/route.ts`   | —                                               |
| V5  | HIGH     | LemonSqueezy webhook bypass      | `lib/security/webhook.ts`  | `webhook.test.ts`                               |
| V6  | MEDIUM   | BiDi trojan-source injection     | `lib/security/sanitize.ts` | `sanitize.test.ts` · `attack-scenarios.test.ts` |
| V7  | MEDIUM   | Auth routes not rate-limited     | `middleware.ts`            | `attack-scenarios.test.ts`                      |
| V8  | MEDIUM   | `getSession()` in admin page     | `(admin)/admin/page.tsx`   | `admin-access-control.test.ts`                  |

---

## 12. Implementation Progress

### Session 1 — Project Scaffold ✅ Complete

| Deliverable                                                                    | Status | Notes                                         |
| ------------------------------------------------------------------------------ | ------ | --------------------------------------------- |
| Next.js 16 + TypeScript + Tailwind 4 + pnpm                                    | ✅     | `package.json` — exact versions locked        |
| Folder structure per plan                                                      | ✅     | Matches §10 above                             |
| `.env.example` with all keys                                                   | ✅     | All 20+ variables documented                  |
| Supabase clients (browser · server · service-role)                             | ✅     | `src/lib/supabase/`                           |
| DB migration — 4 tables + RLS + indexes + triggers                             | ✅     | `supabase/migrations/20260501000000_init.sql` |
| STT adapters (OpenAI · Sarvam · ElevenLabs)                                    | ✅     | Feature-flagged; stubs ready                  |
| LLM routing + 5 prompts                                                        | ✅     | `src/lib/llm/`                                |
| Security lib (webhook · ratelimit · sanitize)                                  | ✅     | All attack vectors covered                    |
| Usage limits + Zod enforcement                                                 | ✅     | Tier caps + 90-min sanity cap                 |
| Middleware (auth guard + rate limiting)                                        | ✅     | Upload + sign-in routes limited               |
| ESLint flat config (security + sonarjs)                                        | ✅     | 0 errors/warnings                             |
| Husky + lint-staged + pre-push test hook                                       | ✅     |                                               |
| GitHub Actions CI pipeline                                                     | ✅     | 6 jobs → all-green gate                       |
| Structured logging + PII redaction                                             | ✅     | 34 fields redacted                            |
| Audit event system (30+ types)                                                 | ✅     | DB-persisted + console                        |
| Admin dashboard + admin API routes                                             | ✅     | Double auth guard                             |
| API error standard + Zod error formatter                                       | ✅     |                                               |
| Error boundaries (error.tsx + global-error.tsx)                                | ✅     |                                               |
| `manage.sh` — start · stop · restart · install · config · stats · admin · logs | ✅     | Spinner + coloured output                     |
| Shell unit tests (manage.test.sh)                                              | ✅     | 70 tests                                      |
| Unit tests — 100% coverage across all 4 metrics                                | ✅     | 223 tests                                     |
| Security attack tests                                                          | ✅     | 51 scenarios across 2 suites                  |
| **Red-team security audit + 8 CVE fixes**                                      | ✅     | See §11                                       |

### Session 2 — Landing Page + Auth ✅ Complete

| Deliverable                                           | Status | Notes                            |
| ----------------------------------------------------- | ------ | -------------------------------- |
| Landing page (`/`) — hero, pricing table, FAQ, footer | ✅     | `src/app/page.tsx`               |
| Root layout metadata from `APP_CONFIG`                | ✅     | `src/app/layout.tsx`             |
| Sign-in page — Google OAuth + magic link              | ✅     | `src/app/auth/sign-in/`          |
| OAuth callback route (PKCE + safe redirect)           | ✅     | `src/app/auth/callback/route.ts` |
| Sign-out route (POST + CSRF guard)                    | ✅     | `src/app/auth/sign-out/route.ts` |
| Authenticated `(app)` layout (server auth guard)      | ✅     | `src/app/(app)/layout.tsx`       |
| `/notes` empty state + "New Note" stub                | ✅     | `src/app/(app)/notes/page.tsx`   |
| Hindi landing page (`/hi`)                            | ⏳     | Deferred to Session 2b           |
| Onboarding language selector                          | ⏳     | Deferred to Session 3            |

### Session 3 — Recorder UI + Upload ✅ Complete

| Deliverable                                                 | Status | Notes                                                     |
| ----------------------------------------------------------- | ------ | --------------------------------------------------------- |
| `MediaRecorder` component (webm/opus + Safari mp4 fallback) | ✅     | `src/components/recording/Recorder.tsx`                   |
| Live waveform (`AnalyserNode`) + timer + pause/resume       | ✅     | `Waveform.tsx` + split useEffect timer fix                |
| Verbatim / Light / Full intensity radio selector            | ✅     | INTENSITY_LABELS Map + aria-pressed buttons               |
| Language pill with auto-detect + manual override            | ✅     | LANGUAGES array + select element                          |
| Hard server-side cap enforcement before upload              | ✅     | `canRecord` + `getNoteDurationLimit` in upload route      |
| `ffmpeg-wasm` re-encode for blobs > 25MB                    | ✅     | `compressIfNeeded()` lazy-loads @ffmpeg/core at 48kbps    |
| `/api/upload` route handler                                 | ✅     | Zod validation + storage upload + Inngest event           |
| Inngest client + `audio/note.uploaded` event firing         | ✅     | `src/lib/inngest/client.ts` + upload route                |
| `transcribeNote` Inngest function                           | ✅     | `src/lib/inngest/transcribe.ts` (signed URL → STT)        |
| `cleanupNote` Inngest function                              | ✅     | `src/lib/inngest/cleanup.ts` (LLM routing + usage UPSERT) |
| `/api/inngest` webhook handler                              | ✅     | `src/app/api/inngest/route.ts`                            |
| Note detail page with live status polling                   | ✅     | `src/app/(app)/notes/[id]/page.tsx` (3 s poll)            |

### Session 4 — Inngest Pipeline ⏳ Pending

| Deliverable                                      | Status |
| ------------------------------------------------ | ------ |
| Inngest client + `transcribe.ts` function        | ⏳     |
| `cleanup.ts` function (LLM routing)              | ⏳     |
| `/api/inngest` webhook handler                   | ⏳     |
| Supabase Realtime → live status on client        | ⏳     |
| Cost guard: check daily spend cap before queuing | ⏳     |

### Session 5 — Notes + Payments + Observability ⏳ Pending

| Deliverable                                                 | Status |
| ----------------------------------------------------------- | ------ |
| Notes list view (cards + status badges)                     | ⏳     |
| Single note view (side-by-side transcript ↔ summary)        | ⏳     |
| Edit summary in-place + regenerate with different intensity | ⏳     |
| Razorpay checkout + webhook handler                         | ⏳     |
| Lemon Squeezy checkout + webhook handler                    | ⏳     |
| Idempotent `payment_events` inserts                         | ⏳     |
| PostHog wiring (session replay off on `/notes`)             | ⏳     |
| Sentry error boundary + DSN                                 | ⏳     |
| `cost-digest.ts` cron — daily email via Resend              | ⏳     |
| Daily company spend cap ($20) pre-flight check              | ⏳     |

### Phase 2 — Competitive Parity (Weeks 5–10)

_(Detailed breakdown added when Phase 1 ships)_

Key items: iOS/Android via Expo, folders/tags, full-text search, style library, "Write Like Me", native Notion/Obsidian integrations, public API.

### Phase 3 — Differentiation (Weeks 11–24)

_(Detailed breakdown added when Phase 2 ships)_

Key items: WhatsApp bot, RAG "ask your notes", Mac dictation app, on-device Whisper, team plan, Chrome extension.

---

## 13. Local Development Setup

### Quick start (use `manage.sh`)

```bash
./manage.sh install   # checks prereqs, pnpm install, creates .env.local
./manage.sh start     # shows config (redacted) then starts dev server
./manage.sh stop      # kills the dev server
./manage.sh restart   # stop + config + start
./manage.sh config    # show current config (all secrets redacted)
./manage.sh status    # is the server running?
./manage.sh logs      # tail dev logs
./manage.sh admin     # show admin console URLs + SQL snippet
./manage.sh help      # list all commands
```

### Manual setup

```bash
pnpm install
cp .env.example .env.local        # fill in keys
supabase start                    # Docker required
supabase db push                  # apply migrations
pnpm dev                          # http://localhost:3000
```

### Supabase local URLs

| Service  | URL                                                     |
| -------- | ------------------------------------------------------- |
| API      | http://localhost:54321                                  |
| Studio   | http://localhost:54323                                  |
| Postgres | postgresql://postgres:postgres@localhost:54322/postgres |
| Storage  | http://localhost:54321/storage/v1                       |

---

## 14. Coding Standards

### TypeScript

- `strict: true` — no exceptions, no `any`
- `unknown` + type guards at all external boundaries
- Zod for all API inputs, webhook payloads, env validation
- All route handlers must have explicit `Promise<Response>` return types

### React / Next.js (read `node_modules/next/dist/docs/` before writing Next.js code)

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
- Always push immediately: `git push -u origin claude/plan-mvp-naming-Y7eZq`

---

## 15. How to Start the Application (full detail)

```bash
# ── Prerequisites (one-time) ───────────────────────────────────────
nvm install 22 && nvm use 22       # Node 22 LTS
npm i -g pnpm                      # pnpm 10
# Docker Desktop must be running for Supabase local

# ── Install and configure ─────────────────────────────────────────
./manage.sh install                # or: pnpm install && cp .env.example .env.local

# ── Supabase (Docker required) ────────────────────────────────────
supabase start                     # prints keys → copy to .env.local
supabase db push                   # apply migrations

# ── Run ──────────────────────────────────────────────────────────
./manage.sh start                  # or: pnpm dev

# ── Test ─────────────────────────────────────────────────────────
pnpm test              # unit + security
pnpm test:coverage     # must stay at 100%
pnpm test:security     # attack simulations only
bash tests/shell/manage.test.sh    # shell unit tests
pnpm test:e2e          # Playwright (requires server running)

# ── Stop ─────────────────────────────────────────────────────────
./manage.sh stop
supabase stop          # keeps data
```

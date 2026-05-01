# QuillCast — Implementation Reference

> Living document. Update this file whenever a version changes, a new service is added, or an architectural decision is made.
> Last updated: May 2026

---

## 0. App Name

The application name is centralised in one file:

```
src/config/app.ts  →  APP_CONFIG.name = "QuillCast"
```

To rename the app, change only that file. Nothing else should hardcode the name.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  BROWSER                                                    │
│  Next.js 15 App Router (React 19) + Tailwind 4 + shadcn/ui │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼────────────────────────────────────┐
│  NEXT.JS SERVER  (Vercel / local dev)                       │
│  Route Handlers + Server Actions + Middleware               │
└────────┬───────────────┬───────────────┬────────────────────┘
         │               │               │
         ▼               ▼               ▼
   ┌──────────┐    ┌──────────┐    ┌──────────────┐
   │ Supabase │    │ Inngest  │    │   Payments   │
   │ Postgres │    │  Queue   │    │  Razorpay /  │
   │ Auth     │    └────┬─────┘    │ LemonSqueezy │
   │ Storage  │         │          └──────────────┘
   │ Realtime │    ┌────▼──────────────────────┐
   └──────────┘    │  Background Jobs           │
                   │  transcribe → STT API      │
                   │  cleanup    → LLM API      │
                   │  cost-digest → Resend      │
                   └───┬───────────────┬────────┘
                       ▼               ▼
                 ┌──────────┐   ┌────────────┐
                 │ STT APIs │   │  LLM APIs  │
                 │ OpenAI   │   │ Anthropic  │
                 │ Sarvam   │   │ Gemini     │
                 │ElevenLabs│   └────────────┘
                 └──────────┘
```

**Why not FastAPI?**
FastAPI is considered for Phase 3 only (on-device Whisper, complex audio DSP). For Phases 1–2, Next.js API routes keep the stack to one language, one deployment, and one CI pipeline.

---

## 2. Tech Stack — Exact Versions

| Layer                      | Library / Service               | Version                         | Notes                                                                |
| -------------------------- | ------------------------------- | ------------------------------- | -------------------------------------------------------------------- |
| **Runtime**                | Node.js                         | 22.x (`.nvmrc`)                 | CLAUDE.md said 20 LTS but 22 LTS is current; Next.js 15 supports 18+ |
| **Package manager**        | pnpm                            | 10.x                            | Never use `npm install` directly                                     |
| **Frontend framework**     | Next.js                         | 15.x (App Router)               |                                                                      |
| **UI library**             | React                           | 19.x                            |                                                                      |
| **Language**               | TypeScript                      | 5.x                             | Strict mode. No `any`.                                               |
| **Styling**                | Tailwind CSS                    | 4.x                             |                                                                      |
| **Component library**      | shadcn/ui                       | latest                          | Primitives only; we customise                                        |
| **Database**               | Supabase (Postgres 17)          | `@supabase/supabase-js` 2.x     |                                                                      |
| **Auth**                   | Supabase Auth                   | `@supabase/ssr` 0.x             | Cookie-based sessions                                                |
| **Storage**                | Supabase Storage                | (same client)                   | Private bucket, signed URLs                                          |
| **Realtime**               | Supabase Realtime               | (same client)                   | Note status updates                                                  |
| **Background jobs**        | Inngest                         | `inngest` 3.x                   | Transcribe + cleanup pipeline                                        |
| **STT — default**          | OpenAI `gpt-4o-mini-transcribe` | `openai` 5.x                    |                                                                      |
| **STT — Indian languages** | Sarvam Saaras v3                | REST API                        | Feature-flagged; `ENABLE_SARVAM`                                     |
| **STT — premium**          | ElevenLabs Scribe v2            | `elevenlabs` SDK                | Feature-flagged; `ENABLE_ELEVENLABS`                                 |
| **LLM cleanup**            | Anthropic Claude Haiku 4.5      | `@anthropic-ai/sdk` 0.x         | Default for all users                                                |
| **LLM cleanup (Pro)**      | Anthropic Claude Sonnet 4.6     | (same SDK)                      | Pro tier only                                                        |
| **LLM fallback**           | Google Gemini 3 Flash           | `@google/generative-ai`         | Indian languages + long context                                      |
| **Email**                  | Resend                          | `resend` 4.x                    |                                                                      |
| **Payments (India)**       | Razorpay                        | `razorpay` 2.x                  | UPI AutoPay, INR                                                     |
| **Payments (global)**      | Lemon Squeezy                   | `@lemonsqueezy/lemonsqueezy.js` | MoR, handles VAT/GST                                                 |
| **Hosting**                | Vercel                          | —                               | Zero-config                                                          |
| **Error monitoring**       | Sentry                          | `@sentry/nextjs` 9.x            |                                                                      |
| **Analytics**              | PostHog                         | `posthog-js` 1.x                | Session replay off on `/notes`                                       |
| **Audio codec**            | ffmpeg-wasm                     | `@ffmpeg/ffmpeg` 0.12.x         | Browser-side; splits >25MB chunks                                    |
| **Unit tests**             | Vitest                          | 3.x                             | Faster than Jest; native ESM                                         |
| **Component tests**        | React Testing Library           | 16.x                            |                                                                      |
| **E2E / Functional tests** | Playwright                      | 1.x                             |                                                                      |
| **Coverage**               | `@vitest/coverage-v8`           | (same version)                  | 100% threshold enforced                                              |
| **Linter**                 | ESLint                          | 9.x (flat config)               |                                                                      |
| **Security lint**          | `eslint-plugin-security`        | 3.x                             | Flags dangerous patterns                                             |
| **Code quality lint**      | `eslint-plugin-sonarjs`         | 2.x                             | Cognitive complexity, duplication                                    |
| **Formatter**              | Prettier                        | 3.x                             |                                                                      |
| **Pre-commit hooks**       | Husky + lint-staged             | 9.x / 15.x                      | Blocks bad commits                                                   |
| **Dependency audit**       | `pnpm audit`                    | —                               | Run in CI                                                            |

---

## 3. Local Development Setup

### Prerequisites

- Node.js 22 (`nvm use` or `fnm use`)
- pnpm 10 (`npm i -g pnpm`)
- Docker Desktop (for local Supabase)
- Supabase CLI (`brew install supabase/tap/supabase` or `scoop install supabase`)

### First-time setup

```bash
pnpm install
cp .env.example .env.local          # fill in keys
supabase start                       # starts Postgres + Auth + Storage + Realtime locally
supabase db push                     # applies migrations
pnpm dev                             # starts Next.js on :3000
```

### Supabase local URLs (after `supabase start`)

| Service          | URL                                                     |
| ---------------- | ------------------------------------------------------- |
| API              | http://localhost:54321                                  |
| Studio dashboard | http://localhost:54323                                  |
| DB (Postgres)    | postgresql://postgres:postgres@localhost:54322/postgres |
| Storage          | http://localhost:54321/storage/v1                       |
| Auth             | http://localhost:54321/auth/v1                          |

### Useful scripts

```bash
pnpm dev              # Next.js dev server
pnpm build            # production build
pnpm lint             # ESLint
pnpm typecheck        # tsc --noEmit
pnpm format           # Prettier write
pnpm format:check     # Prettier check (used in CI)
pnpm test             # Vitest unit tests
pnpm test:watch       # Vitest watch mode
pnpm test:coverage    # Vitest with coverage report
pnpm test:e2e         # Playwright E2E
pnpm test:e2e:ui      # Playwright with UI mode
pnpm test:security    # Security-focused test suite
```

---

## 4. Folder Structure

```
src/
├── app/
│   ├── (marketing)/          # Public pages (SSR for SEO)
│   │   ├── page.tsx          # Landing page
│   │   ├── pricing/page.tsx
│   │   └── hi/page.tsx       # Hindi landing
│   ├── (app)/                # Authenticated app
│   │   ├── layout.tsx        # Auth guard
│   │   └── notes/
│   │       ├── page.tsx      # Notes list
│   │       ├── new/page.tsx  # Recorder
│   │       └── [id]/page.tsx # Single note
│   ├── api/
│   │   ├── upload/route.ts
│   │   ├── inngest/route.ts
│   │   └── webhooks/
│   │       ├── razorpay/route.ts
│   │       └── lemonsqueezy/route.ts
│   └── auth/
│       ├── callback/route.ts
│       └── sign-in/page.tsx
├── components/
│   ├── ui/                   # shadcn primitives
│   ├── recording/            # Recorder, Waveform, Timer
│   ├── notes/                # NoteCard, NoteView, IntensitySelect
│   └── marketing/
├── config/
│   └── app.ts                # APP_CONFIG — single source of app name + metadata
├── lib/
│   ├── supabase/
│   │   ├── client.ts         # browser client
│   │   ├── server.ts         # server client (cookies)
│   │   └── service.ts        # service-role (Inngest only)
│   ├── stt/
│   │   ├── types.ts
│   │   ├── openai.ts
│   │   ├── sarvam.ts
│   │   ├── elevenlabs.ts
│   │   ├── languages.ts      # INDIAN_LANGUAGES
│   │   └── route.ts          # routing decision tree
│   ├── llm/
│   │   ├── anthropic.ts
│   │   ├── gemini.ts
│   │   ├── route.ts
│   │   └── prompts/
│   │       ├── verbatim.ts
│   │       ├── light-cleanup.ts
│   │       ├── full-rewrite.ts
│   │       ├── title.ts
│   │       └── write-like-me.ts
│   ├── payments/
│   │   ├── razorpay.ts
│   │   └── lemonsqueezy.ts
│   ├── usage/
│   │   └── limits.ts
│   └── security/
│       ├── webhook.ts        # signature verification (Razorpay + LemonSqueezy)
│       ├── ratelimit.ts      # per-IP and per-user rate limiting
│       └── sanitize.ts       # input sanitisation helpers
├── inngest/
│   ├── client.ts
│   └── functions/
│       ├── transcribe.ts
│       ├── cleanup.ts
│       └── cost-digest.ts
├── middleware.ts              # auth guard + rate limit headers
└── types/
    └── index.ts
tests/
├── unit/                     # Vitest unit tests (mirror src/ structure)
├── integration/              # Vitest API route tests
├── security/                 # Vitest security scenario tests
├── e2e/                      # Playwright functional tests
└── fixtures/                 # shared test data and mocks
```

---

## 5. App Name Config

```typescript
// src/config/app.ts
export const APP_CONFIG = {
  name: "QuillCast",
  tagline: "Speak your thoughts. QuillCast writes them.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  supportEmail: "hello@quillcast.app",
  social: {
    twitter: "https://x.com/quillcast",
  },
} as const

export type AppConfig = typeof APP_CONFIG
```

Usage everywhere: `import { APP_CONFIG } from "@/config/app"` — never hardcode `"QuillCast"`.

---

## 6. Coding Standards

### TypeScript

- `strict: true` — no exceptions
- No `any`. Use `unknown` + type guards at boundaries.
- Prefer `type` over `interface` for object shapes.
- All API route handlers must define explicit return types.
- Zod for all external input validation (API bodies, webhook payloads, env vars).

### React / Next.js

- Server components by default. `"use client"` only when you need state, refs, effects, or browser APIs.
- DB access only in server components, server actions, or route handlers — never in client components.
- No prop drilling beyond 2 levels — use server component composition instead.

### File naming

- Components: `PascalCase.tsx`
- Utilities / lib: `kebab-case.ts`
- Tests: `*.test.ts` (unit/integration), `*.spec.ts` (e2e)

### Commits

- Imperative mood, ≤72 chars.
- Prefix: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `security:`.

---

## 7. Linting & Formatting Configuration

### ESLint (flat config — `eslint.config.mjs`)

```
Plugins used:
  @typescript-eslint/recommended   — TS best practices
  eslint-plugin-security           — flags eval, dangerouslySetInnerHTML, ReDoS patterns
  eslint-plugin-sonarjs            — cognitive complexity, duplicate code
  @next/eslint-plugin-next         — Next.js specific rules
  eslint-plugin-react-hooks        — rules of hooks
  eslint-plugin-playwright         — Playwright best practices (test files only)
```

### Prettier (`.prettierrc`)

```json
{
  "semi": false,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

### Husky + lint-staged

Pre-commit hook runs on every `git commit`:

```
*.{ts,tsx}  →  eslint --fix  →  prettier --write  →  tsc --noEmit (affected files)
*.{json,md} →  prettier --write
```

Pre-push hook runs:

```
pnpm test (unit + integration, not e2e — too slow for pre-push)
```

---

## 8. Testing Strategy

### Philosophy: Test as an attacker would

Every test suite has a `security/` group. We assume the application **will be attacked** and write tests that simulate real attack patterns. A passing security test means the attack was **blocked**, not that it succeeded.

### Test layers

| Layer            | Tool                 | What it tests                                                 | Coverage target              |
| ---------------- | -------------------- | ------------------------------------------------------------- | ---------------------------- |
| Unit             | Vitest               | Pure functions, lib utilities, prompt builders, routing logic | 100%                         |
| Component        | Vitest + RTL         | React components in isolation                                 | 100% meaningful paths        |
| Integration      | Vitest + `next/test` | API route handlers (mocked Supabase + external APIs)          | 100%                         |
| E2E / Functional | Playwright           | Full user journeys in a real browser against local Supabase   | Golden path + key edge cases |
| Security         | Vitest + Playwright  | Attack simulations (see §9)                                   | All scenarios listed in §9   |

### Coverage enforcement

```typescript
// vitest.config.ts
coverage: {
  provider: "v8",
  thresholds: {
    lines: 100,
    functions: 100,
    branches: 100,
    statements: 100,
  },
  exclude: [
    "src/app/**/*.tsx",   // Next.js pages — covered by Playwright
    "src/components/ui/", // shadcn primitives — not our code
    "**/*.d.ts",
    "**/types/**",
  ],
}
```

### Mocking rules

- External API calls (OpenAI, Anthropic, Sarvam) are **always mocked** in unit/integration tests — never hit real APIs in CI.
- Supabase is mocked via `supabase-mock` or manual stubs in unit tests; local Supabase instance is used for E2E.
- Inngest functions are tested by calling the handler function directly, not through the queue.

---

## 9. Security Test Scenarios

Every scenario below has a corresponding test. Tests are in `tests/security/`.

### Authentication & Authorization

| Scenario                                           | Attack type            | Expected result                       |
| -------------------------------------------------- | ---------------------- | ------------------------------------- |
| Access `/notes` without session cookie             | Unauthenticated access | Redirect to sign-in (middleware)      |
| Forge a session cookie with random JWT             | JWT tampering          | 401 from Supabase; middleware rejects |
| Access another user's note by ID                   | IDOR                   | 404 (RLS returns no rows)             |
| Call `/api/upload` without auth header             | Unauthenticated API    | 401                                   |
| Replay a valid expired JWT                         | Token replay           | 401 (Supabase validates expiry)       |
| Access service-role key route without service role | Privilege escalation   | 403                                   |

### Input Validation & Injection

| Scenario                                          | Attack type           | Expected result                                      |
| ------------------------------------------------- | --------------------- | ---------------------------------------------------- |
| POST `title: "<script>alert(1)</script>"` to note | XSS                   | Stored as escaped string; React never executes it    |
| POST `user_id: "'; DROP TABLE notes;--"`          | SQL injection         | Rejected by Zod; Supabase uses parameterized queries |
| Upload `.exe` file renamed to `.webm`             | Malicious file upload | Rejected by MIME type check before storage           |
| Upload 200MB audio file on Free tier              | Oversized upload      | 413 before reaching storage                          |
| Note ID with path traversal `../../etc/passwd`    | Path traversal        | Rejected by UUID validation (Zod)                    |
| POST body with 10MB JSON payload                  | JSON bomb             | 413 from Next.js body size limit                     |

### Webhooks

| Scenario                                                  | Attack type          | Expected result                                             |
| --------------------------------------------------------- | -------------------- | ----------------------------------------------------------- |
| POST to `/api/webhooks/razorpay` without signature header | Webhook spoofing     | 401 — signature missing                                     |
| POST with a forged HMAC signature                         | Signature bypass     | 401 — HMAC mismatch                                         |
| Replay a valid webhook payload                            | Replay attack        | Idempotency check on `external_event_id`; no double-upgrade |
| POST valid payload but wrong event type                   | Event type confusion | Ignored — unhandled event type logged, 200 returned         |

### Rate Limiting

| Scenario                                                 | Attack type             | Expected result                  |
| -------------------------------------------------------- | ----------------------- | -------------------------------- |
| 100 requests to `/api/upload` in 10 seconds from same IP | Brute force / DoS       | 429 after threshold              |
| 50 sign-in attempts from same IP in 1 minute             | Credential stuffing     | 429 from middleware rate limiter |
| Concurrent uploads exceeding per-user minute cap         | Quota abuse             | 402 — limit enforced server-side |
| 10 account signups from same IP in 1 hour                | Burner account creation | 429 from IP rate limiter         |

### Data Privacy

| Scenario                                                | Attack type          | Expected result                                |
| ------------------------------------------------------- | -------------------- | ---------------------------------------------- |
| `GET /api/upload` leaks signed URL without auth         | Signed URL exposure  | 401 before URL is generated                    |
| Audio storage path accessed directly without signed URL | Direct bucket access | 403 — bucket is private                        |
| PII appears in Sentry breadcrumbs                       | Telemetry data leak  | Sentry payload scrubbed — no transcripts       |
| `console.log(transcript)` in production                 | Log data leak        | ESLint `no-console` rule blocks this at commit |

### Business Logic

| Scenario                                                       | Attack type         | Expected result                                   |
| -------------------------------------------------------------- | ------------------- | ------------------------------------------------- |
| Free user submits 31-minute audio                              | Usage cap bypass    | 402 before Inngest job is queued                  |
| Concurrent uploads to exceed minute cap in race                | Race condition      | Atomic DB check prevents double-spend             |
| Modify `intensity` field after note is ready to trigger re-run | Parameter tampering | Re-run requires explicit user action + auth check |

---

## 10. GitHub Actions CI Pipeline

File: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main, "feat/**", "fix/**", "security/**"]
  pull_request:
    branches: [main]

jobs:
  quality:
    name: Lint + Typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm typecheck

  unit-tests:
    name: Unit + Integration Tests
    runs-on: ubuntu-latest
    needs: quality
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/

  security-tests:
    name: Security Test Suite
    runs-on: ubuntu-latest
    needs: quality
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:security

  dependency-audit:
    name: Dependency Audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - run: pnpm audit --audit-level=high

  e2e:
    name: E2E Tests (Playwright)
    runs-on: ubuntu-latest
    needs: [unit-tests, security-tests]
    services:
      supabase:
        image: supabase/postgres:17
        env:
          POSTGRES_PASSWORD: postgres
        ports: ["5432:5432"]
    env:
      NEXT_PUBLIC_SUPABASE_URL: http://localhost:54321
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.CI_SUPABASE_ANON_KEY }}
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm build
      - run: pnpm test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/

  all-green:
    name: All checks passed
    runs-on: ubuntu-latest
    needs: [quality, unit-tests, security-tests, dependency-audit, e2e]
    steps:
      - run: echo "All CI checks passed"
```

---

## 11. Implementation Progress

### Phase 1 — MVP

| Session | Deliverable                                                                 | Status   | Notes                                              |
| ------- | --------------------------------------------------------------------------- | -------- | -------------------------------------------------- |
| 1       | Project scaffold (Next.js 16, folder structure, Supabase local, migrations) | **Done** | Next.js 16.2.4, React 19, pnpm                     |
| 1       | `.env.example`, `.nvmrc`, ESLint, Prettier, Husky                           | **Done** | ESLint 9 flat config + security + sonarjs plugins  |
| 1       | `src/config/app.ts` (APP_CONFIG)                                            | **Done** | Name = "QuillCast" — single file to rename         |
| 1       | Vitest 100% coverage config + Playwright config                             | **Done** | 100 tests passing; security project configured     |
| 1       | GitHub Actions CI pipeline                                                  | **Done** | quality → unit + security → e2e → all-green        |
| 1       | STT adapters (openai, sarvam stub, elevenlabs stub)                         | **Done** | Feature-flagged; ENABLE_SARVAM/ENABLE_ELEVENLABS   |
| 1       | LLM routing + all 5 prompts                                                 | **Done** | `src/lib/llm/prompts/` — named TS exports          |
| 1       | Security lib (webhook, ratelimit, sanitize)                                 | **Done** | HMAC verify, IP rate limiter, UUID/MIME validation |
| 1       | Usage limits + Zod enforcement                                              | **Done** | Tier caps, note duration limits, schema validation |
| 1       | Supabase schema migration                                                   | **Done** | 4 tables + RLS + indexes + auto-profile trigger    |
| 1       | Middleware (auth guard + rate limiting)                                     | **Done** | Defence-in-depth; never trusts middleware alone    |
| 1       | Security attack simulation tests (100 tests)                                | **Done** | 26 attack scenarios; 1 real bug found and fixed    |
| 2       | Landing page (English) + `/hi` (Hindi)                                      | Pending  |                                                    |
| 2       | Google OAuth + magic link auth                                              | Pending  |                                                    |
| 2       | `/notes` placeholder + onboarding language selector                         | Pending  |                                                    |
| 3       | Recorder UI (MediaRecorder, waveform, chunked upload)                       | Pending  |                                                    |
| 3       | Verbatim / Light / Full intensity selector                                  | Pending  |                                                    |
| 3       | Audio file drag-drop upload + ffmpeg-wasm split                             | Pending  |                                                    |
| 4       | Inngest pipeline (transcribe → cleanup)                                     | Pending  |                                                    |
| 4       | Supabase Realtime status updates                                            | Pending  |                                                    |
| 5       | Notes list + single note side-by-side view                                  | Pending  |                                                    |
| 5       | Razorpay + Lemon Squeezy webhooks                                           | Pending  |                                                    |
| 5       | PostHog + Sentry wiring                                                     | Pending  |                                                    |
| 5       | Cost-tracking cron + daily spend cap                                        | Pending  |                                                    |

### Phase 2 — Competitive parity (Weeks 5–10)

_(detailed breakdown added when Phase 1 ships)_

### Phase 3 — Differentiation (Weeks 11–24)

_(detailed breakdown added when Phase 2 ships)_

---

## 12. How to Start the Application

### Prerequisites (one-time)

```bash
# 1. Install Node 22
nvm install 22 && nvm use 22      # or: fnm use 22

# 2. Install pnpm (if not already)
npm i -g pnpm

# 3. Install Supabase CLI (one-time)
# On Linux — binary is already installed at /usr/local/bin/supabase
# On Mac: brew install supabase/tap/supabase

# 4. Install dependencies
pnpm install

# 5. Copy env file and fill in keys
cp .env.example .env.local
# Edit .env.local — at minimum fill: ANTHROPIC_API_KEY
# Supabase keys will be printed by `supabase start` in step 6
```

### Start local Supabase (Docker required — runs once per machine restart)

```bash
supabase start
# Prints local URLs and keys — copy them into .env.local:
#   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=<printed anon key>
#   SUPABASE_SERVICE_ROLE_KEY=<printed service role key>

# Apply the schema migration
supabase db push

# Optional: open Supabase Studio (visual DB browser)
# Visit http://localhost:54323
```

### Start the Next.js dev server

```bash
pnpm dev
# App is live at http://localhost:3000
```

### Run tests

```bash
pnpm test              # all unit + integration + security tests
pnpm test:coverage     # same + coverage report (must hit 100%)
pnpm test:security     # security attack simulations only
pnpm test:e2e          # Playwright E2E (requires `pnpm dev` or `pnpm build && pnpm start`)
```

### Stop local Supabase

```bash
supabase stop          # stops Docker containers but keeps data
supabase stop --backup # stops and backs up the local DB
```

---

## 13. Security Checklist — Per Feature

Before marking any feature as complete, verify:

- [ ] All inputs validated with Zod at the API boundary
- [ ] Auth checked in both middleware AND the route handler (defence in depth)
- [ ] RLS policy exists for any new Supabase table
- [ ] No API keys or secrets in client-side code
- [ ] Webhook signature verified before processing
- [ ] Rate limiting applied to the route
- [ ] No PII in Sentry/PostHog payloads
- [ ] `pnpm audit` shows no high/critical vulnerabilities
- [ ] Corresponding security test written and passing
- [ ] `pnpm lint && pnpm typecheck` passes

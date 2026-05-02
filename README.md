# QuillCast

**Speak your thoughts. QuillCast writes them.**

A multilingual voice-to-text web app — a direct upgrade over AudioPen.ai, built for Indian and global audiences. Record in Hindi, Tamil, English, Hinglish (or any language); get back a clean, structured note in seconds.

---

## Tech Stack

| Layer             | Technology                                                                |
| ----------------- | ------------------------------------------------------------------------- |
| Framework         | Next.js 16 (App Router) + React 19 + TypeScript 5                         |
| Styling           | Tailwind CSS 4 + shadcn/ui                                                |
| Database          | Supabase (Postgres 17 + Auth + Storage + Realtime)                        |
| Background jobs   | Inngest                                                                   |
| STT               | OpenAI `gpt-4o-mini-transcribe` / Sarvam Saaras v3 / ElevenLabs Scribe v2 |
| LLM cleanup       | Claude Haiku 4.5 (default) / Claude Sonnet 4.6 / Gemini 3 Pro             |
| Payments (India)  | Razorpay                                                                  |
| Payments (Global) | Lemon Squeezy (Merchant of Record)                                        |
| Observability     | Sentry + PostHog                                                          |
| Email             | Resend                                                                    |
| Hosting           | Vercel                                                                    |

---

## Quick Start

### Prerequisites

- Node 22 LTS (`node -v` → should show `v22.x`)
- pnpm 10 (`pnpm -v`)
- A Supabase project (or local Supabase CLI)

### 1. Clone and install

```bash
git clone https://github.com/vigneshpalanivelr/audio-descriptor.git
cd audio-descriptor
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
# Edit .env.local and fill in your keys (see Environment Variables below)
```

### 3. Run the database migration

```bash
# If using Supabase CLI (local):
supabase start
supabase db push

# If using a hosted Supabase project:
# Paste contents of supabase/migrations/20260501000000_init.sql into the SQL editor
```

### 4. Use the management script

```bash
chmod +x manage.sh
./manage.sh          # shows the interactive menu
./manage.sh start    # start dev server
./manage.sh stop     # stop running server
./manage.sh restart  # restart (shows config first)
./manage.sh stats    # show usage stats
./manage.sh config   # show current config (redacted)
./manage.sh help     # list all commands
```

---

## Development Commands

```bash
pnpm dev              # start dev server on http://localhost:3000
pnpm build            # production build
pnpm start            # serve production build
pnpm lint             # ESLint
pnpm lint:fix         # ESLint with auto-fix
pnpm format           # Prettier write
pnpm format:check     # Prettier check (CI)
pnpm typecheck        # tsc --noEmit
pnpm test             # run all unit tests
pnpm test:watch       # watch mode
pnpm test:coverage    # with v8 coverage (must hit 100%)
pnpm test:security    # security test suite
pnpm test:e2e         # Playwright E2E (chromium + Mobile Chrome)
pnpm test:e2e:ui      # Playwright interactive UI
```

---

## Environment Variables

All variables are documented in `.env.example`. Minimum set to run locally:

| Variable                        | Required     | Description                                 |
| ------------------------------- | ------------ | ------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Yes          | Supabase project URL                        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes          | Supabase anon key                           |
| `SUPABASE_SERVICE_ROLE_KEY`     | Yes          | Supabase service-role key (server only)     |
| `ANTHROPIC_API_KEY`             | Yes          | Claude models (LLM cleanup)                 |
| `OPENAI_API_KEY`                | Yes          | Whisper transcription                       |
| `INNGEST_EVENT_KEY`             | Dev optional | Leave blank in dev (Inngest dev server)     |
| `INNGEST_SIGNING_KEY`           | Dev optional | Leave blank in dev                          |
| `SARVAM_API_KEY`                | Optional     | Required only when `ENABLE_SARVAM=true`     |
| `ELEVENLABS_API_KEY`            | Optional     | Required only when `ENABLE_ELEVENLABS=true` |
| `RAZORPAY_KEY_ID` + `_SECRET`   | Optional     | India payments                              |
| `LEMONSQUEEZY_API_KEY` etc.     | Optional     | Global payments                             |
| `RESEND_API_KEY`                | Optional     | Email (cost digest cron)                    |
| `SENTRY_DSN`                    | Optional     | Error tracking                              |
| `NEXT_PUBLIC_POSTHOG_KEY`       | Optional     | Product analytics                           |
| `DAILY_COST_CAP_USD`            | Optional     | Default: `20` — hard spend cap              |

---

## Feature Flags

Controlled via environment variables, default **off**:

| Flag                 | Default | Effect                                          |
| -------------------- | ------- | ----------------------------------------------- |
| `ENABLE_SARVAM`      | `false` | Route Indian-language audio to Sarvam Saaras v3 |
| `ENABLE_ELEVENLABS`  | `false` | Enable ElevenLabs Scribe v2 adapter             |
| `ELEVENLABS_PREMIUM` | `false` | Override all STT routing → ElevenLabs           |

---

## Pricing Tiers

| Tier        | Minutes/month | Notes/month                   | Price        |
| ----------- | ------------- | ----------------------------- | ------------ |
| Free        | 30 min        | 10 notes                      | ₹0 / $0      |
| Starter     | 5 hours       | Unlimited                     | ₹499 / $7    |
| Pro         | 30 hours      | Unlimited                     | ₹999 / $12   |
| Pro + Local | Unlimited     | Unlimited (on-device Whisper) | ₹1,999 / $24 |

---

## Admin Console

The admin dashboard is available at `/admin` (server-side protected — requires `profiles.tier = 'admin'` in the database).

It shows:

- Real-time user count and tier breakdown
- Recent audit log events (auth, payments, security alerts)
- Per-user usage stats

To grant yourself admin access locally:

```sql
-- Run in Supabase SQL editor or psql
update public.profiles set tier = 'admin' where id = '<your-user-uuid>';
```

---

## Database Schema

Four tables created by `supabase/migrations/20260501000000_init.sql`:

- **`profiles`** — user settings, tier, subscription metadata
- **`notes`** — transcripts, summaries, audio metadata, processing status
- **`usage`** — per-user per-month minute / cost tracking
- **`payment_events`** — immutable payment audit log

All tables have Row Level Security (RLS) policies: users can only read/write their own rows.

---

## Project Structure

```
src/
├── app/
│   ├── (admin)/admin/      Admin dashboard (server component)
│   ├── (marketing)/        Landing pages (English + Hindi)
│   ├── (app)/notes/        Authenticated note views
│   ├── api/                API routes (upload, inngest, webhooks, admin)
│   └── auth/               Sign-in, callback
├── components/
│   ├── recording/          MediaRecorder, Waveform, intensity selector
│   └── ui/                 shadcn/ui base components
├── config/
│   └── app.ts              Single source of truth for app name/URL
├── inngest/
│   └── functions/          transcribe, cleanup, cost-digest jobs
├── lib/
│   ├── api/                Standardised API error responses
│   ├── llm/                LLM routing, prompt templates
│   ├── logger/             pino structured logger + audit events
│   ├── payments/           Razorpay + Lemon Squeezy adapters
│   ├── security/           Rate limiting, webhook HMAC, input sanitization
│   ├── stt/                STT routing, language constants, adapters
│   ├── supabase/           Browser, server, and service-role clients
│   └── usage/              Tier limits enforcement
supabase/
└── migrations/             SQL migration files
tests/
├── e2e/                    Playwright smoke tests
├── security/               Attack scenario tests
└── unit/                   Vitest unit tests (100% coverage)
```

---

## CI / CD

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `main`, `feat/**`, `fix/**`, `security/**`, `chore/**`:

1. **Lint + Format + Typecheck** — ESLint, Prettier, tsc
2. **Unit + Integration Tests** — Vitest with 100% v8 coverage gate
3. **Security Tests** — dedicated attack-scenario suite
4. **Dependency Audit** — `pnpm audit --audit-level=high`
5. **E2E Tests** — Playwright (Chromium + Mobile Chrome)

All jobs must pass before `all-green` is reported.

---

## Contributing

1. Branch from `main` using the convention: `feat/`, `fix/`, `security/`, `chore/`
2. Run `pnpm test:coverage` — must stay at 100%
3. Run `pnpm lint && pnpm format:check && pnpm typecheck`
4. The pre-commit hook (Husky + lint-staged) runs lint + format automatically
5. The pre-push hook runs the full test suite

---

## Roadmap

See `IMPLEMENTATION.md` for the full phased plan. High-level:

- **Phase 1 (MVP)** — recorder UI, STT pipeline, note views, payments, observability
- **Phase 2** — iOS/Android apps, folders/tags, "Write Like Me", style library, Notion/Obsidian integrations
- **Phase 3** — WhatsApp bot, RAG "ask your notes", Mac dictation app, on-device Whisper, team plan

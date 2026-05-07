# QuillCast — Setup Guide

> **All server operations go through `manage.sh`.**  
> Run `./manage.sh help` at any time to see every available command.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Clone & Install](#2-clone--install)
3. [Environment file](#3-environment-file)
4. [Database setup](#4-database-setup)
   - [4a. Remote Supabase (recommended)](#4a-remote-supabase-recommended)
   - [4b. Local Supabase (Docker)](#4b-local-supabase-docker)
   - [4c. Link local CLI to remote project](#4c-link-local-cli-to-remote-project)
5. [Google OAuth](#5-google-oauth)
6. [LLM / STT API keys](#6-llm--stt-api-keys)
7. [Background jobs — Inngest](#7-background-jobs--inngest)
8. [Payments](#8-payments)
9. [Observability (optional)](#9-observability-optional)
10. [Admin access](#10-admin-access)
11. [Start the app](#11-start-the-app)
12. [Quick reference — manage.sh commands](#12-quick-reference--managesh-commands)

---

## 1. Prerequisites

| Tool               | Version  | Install                                                                                                                   |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Node.js**        | 22 (LTS) | `nvm install 22` or [nodejs.org](https://nodejs.org)                                                                      |
| **pnpm**           | ≥ 9      | `npm install -g pnpm`                                                                                                     |
| **Git**            | any      | [git-scm.com](https://git-scm.com)                                                                                        |
| **Docker Desktop** | latest   | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop) — **only needed for local Supabase** |
| **Supabase CLI**   | latest   | `brew install supabase/tap/supabase` (macOS) or [docs.supabase.com/guides/cli](https://supabase.com/docs/guides/cli)      |

Verify:

```bash
node -v          # v22.x.x
pnpm -v          # 9.x.x
supabase --version
docker --version  # only if using local DB
```

---

## 2. Clone & Install

```bash
git clone <repo-url> quillcast
cd quillcast
pnpm install
```

---

## 3. Environment file

Copy the template and fill in values as you work through each section below:

```bash
cp .env.example .env.local
```

`.env.local` is git-ignored — never commit secrets.

---

## 4. Database setup

QuillCast uses **Supabase** (Postgres + Auth + Storage). You can run it remotely (persistent, recommended for real use) or locally via Docker (ephemeral, good for pure development).

### 4a. Remote Supabase (recommended)

#### Step 1 — Create a project

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Choose an organisation, name the project (e.g. `quillcast`), set a database password, and select a region close to your users
3. Wait ~2 minutes for the project to provision

#### Step 2 — Collect credentials

In your project dashboard go to **Settings → API**:

| Value              | Where to find it                                                             |
| ------------------ | ---------------------------------------------------------------------------- |
| Project URL        | "Project URL" field — looks like `https://xxxxxxxxxxxx.supabase.co`          |
| `anon` key         | "Project API keys → anon public"                                             |
| `service_role` key | "Project API keys → service_role" (**keep secret**)                          |
| Project ref        | The 20-character ID in the project URL: `https://supabase.com/project/<ref>` |

#### Step 3 — Update `.env.local`

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_PROJECT_REF=<ref>
```

#### Step 4 — Apply all database migrations

With the Supabase CLI installed:

```bash
# Link CLI to your remote project (one-time; manage.sh auto-runs this on start/stop/restart when SUPABASE_PROJECT_REF is set)
supabase link --project-ref <ref>

# Apply all migrations to the remote database
./manage.sh db remote
```

This runs `supabase migration up`, which applies every file under `supabase/migrations/` in order:

| Migration file                       | What it creates                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| `20260501000000_init.sql`            | `profiles`, `notes`, `usage`, `payment_events` tables, RLS policies, auto-profile trigger |
| `20260501000001_audit_and_admin.sql` | `audit_logs`, `user_sessions` tables, admin SQL functions                                 |
| `20260501000002_storage_bucket.sql`  | Private `audio` storage bucket + RLS policies                                             |
| `20260502000000_note_versions.sql`   | `note_versions` table, `custom_prompt` column on `notes`                                  |
| `20260503000000_pinned.sql`          | `is_pinned` column on `notes`                                                             |

#### Step 5 — Verify in Supabase Studio

Open **Table Editor** in your project dashboard and confirm these tables exist:
`profiles`, `notes`, `note_versions`, `usage`, `payment_events`, `audit_logs`, `user_sessions`

Under **Storage → Buckets**, confirm the `audio` bucket exists (private, 100 MB limit).

---

### 4b. Local Supabase (Docker)

> **Warning — data is ephemeral.** Everything stored locally lives in Docker volumes. Restarting Docker Desktop or running `docker system prune -v` permanently destroys all data. Use remote Supabase for anything you care about keeping.

#### Step 1 — Ensure Docker Desktop is running

```bash
docker info   # should print engine info without errors
```

#### Step 2 — Start the local stack

`manage.sh` handles everything:

```bash
./manage.sh db start
```

This:

1. Installs the Supabase CLI if missing (macOS only via Homebrew)
2. Starts the local Docker stack
3. Runs all migrations (`supabase db push`)
4. Auto-fills `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`

Local service URLs after start:

| Service          | URL                                                       |
| ---------------- | --------------------------------------------------------- |
| API / Auth       | `http://127.0.0.1:54321`                                  |
| Supabase Studio  | `http://localhost:54323`                                  |
| DB (psql)        | `postgresql://postgres:postgres@localhost:54322/postgres` |
| Inbucket (email) | `http://localhost:54324`                                  |

#### Step 3 — Verify

```bash
./manage.sh db status
```

#### Common local DB commands

```bash
./manage.sh db start    # start stack + apply pending migrations
./manage.sh db stop     # stop stack (data preserved in volume)
./manage.sh db push     # apply new migrations without restarting
./manage.sh db reset    # DROP everything and re-apply all migrations (destructive)
./manage.sh db status   # check if stack is running
```

---

### 4c. Link local CLI to remote project

If you are using a remote Supabase URL but also have the CLI for running `supabase migration up`, link them once:

```bash
supabase link --project-ref <ref>
```

After that, `./manage.sh db remote` applies pending migrations. You can also set `SUPABASE_PROJECT_REF=<ref>` in `.env.local` and `manage.sh` will auto-run the link command on every start/stop/restart.

#### Applying individual migrations manually (SQL Editor)

If you prefer not to use the CLI you can paste each migration into **Supabase Dashboard → SQL Editor** and run it. Apply them in this exact order:

```
supabase/migrations/20260501000000_init.sql
supabase/migrations/20260501000001_audit_and_admin.sql
supabase/migrations/20260501000002_storage_bucket.sql
supabase/migrations/20260502000000_note_versions.sql
supabase/migrations/20260503000000_pinned.sql
```

---

## 5. Google OAuth

Google OAuth is configured in two places: the **Google Cloud Console** (to create credentials) and the **Supabase Dashboard** (to enable the provider). The `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` values in `.env.local` are **not used by the app** — they only serve as a reminder; the real wiring happens in Supabase.

### Step 1 — Create OAuth credentials in Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create or select a project
3. Navigate to **APIs & Services → Credentials**
4. Click **+ Create Credentials → OAuth client ID**
5. Application type: **Web application**
6. Name: e.g. `QuillCast`
7. Under **Authorised JavaScript origins** add:
   - `https://<ref>.supabase.co` (for remote)
   - `http://localhost:3000` (for local dev if needed)
8. Under **Authorised redirect URIs** add:
   - `https://<ref>.supabase.co/auth/v1/callback` ← **remote (required)**
   - `http://127.0.0.1:54321/auth/v1/callback` ← local Supabase (for local dev)
9. Click **Create** — copy the **Client ID** and **Client Secret**

> **Tip:** If you see `"Unsupported provider: provider is not enabled"` when clicking "Continue with Google", the Supabase Dashboard step (Step 2 below) has not been completed.

### Step 2 — Enable Google provider in Supabase Dashboard

1. Open your Supabase project → **Authentication → Providers**
2. Find **Google** and toggle it on
3. Paste the **Client ID** and **Client Secret** from Step 1
4. Click **Save**

### Step 3 — Update `.env.local` (documentation only)

These are not read by the app, but useful as a local record:

```dotenv
GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-client-secret>
```

### Step 4 — Set the app callback URL

In `.env.local`, ensure `NEXT_PUBLIC_APP_URL` matches where your app runs (the value used in the OAuth redirect):

```dotenv
# Local dev
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Production
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

The sign-in form redirects to `$NEXT_PUBLIC_APP_URL/auth/callback` after OAuth.

---

## 6. LLM / STT API keys

QuillCast supports multiple providers. **Set at least one LLM key and at least one STT key** for transcription to work.

### LLM providers (pick at least one)

| Provider         | Env var                 | Priority | Notes                      |
| ---------------- | ----------------------- | -------- | -------------------------- |
| Anthropic Claude | `ANTHROPIC_API_KEY`     | 1st      | Recommended — best quality |
| OpenAI GPT       | `OPENAI_API_KEY`        | 2nd      | Also used for Whisper STT  |
| Google Gemini    | `GOOGLE_GEMINI_API_KEY` | 3rd      | Free tier available        |

```dotenv
# In .env.local — set at least one:
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_GEMINI_API_KEY=AI...
```

**Override the automatic priority:**

```dotenv
# Force a specific provider regardless of which keys are present:
LLM_PROVIDER=anthropic   # or: openai | gemini
```

**Gemini model overrides** (defaults to `gemini-2.5-flash`):

```dotenv
GEMINI_STT_MODEL=gemini-2.5-flash    # model used for speech-to-text
GEMINI_LLM_MODEL=gemini-2.5-flash    # model used for cleanup / title generation
```

To list Gemini models available to your key:

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GOOGLE_GEMINI_API_KEY"
```

Pick any model that supports `generateContent` and audio input.

### STT providers

| Provider       | Env var                                         | Feature flag | Notes                           |
| -------------- | ----------------------------------------------- | ------------ | ------------------------------- |
| OpenAI Whisper | `OPENAI_API_KEY`                                | always on    | Default when OpenAI key present |
| Google Gemini  | `GOOGLE_GEMINI_API_KEY`                         | always on    | Used when OpenAI key absent     |
| Sarvam AI      | `SARVAM_API_KEY` + `ENABLE_SARVAM=true`         | opt-in       | Indian languages                |
| ElevenLabs     | `ELEVENLABS_API_KEY` + `ENABLE_ELEVENLABS=true` | opt-in       | High accuracy                   |

```dotenv
# Optional STT providers:
SARVAM_API_KEY=
ELEVENLABS_API_KEY=
ENABLE_SARVAM=false       # set true to enable
ENABLE_ELEVENLABS=false   # set true to enable
ELEVENLABS_PREMIUM=false  # set true for premium ElevenLabs model
```

### Cost guardrail

```dotenv
DAILY_COST_CAP_USD=20   # app stops processing new notes when daily spend exceeds this
```

---

## 7. Background jobs — Inngest

Inngest handles async note processing (transcription queue). Without it the app falls back to synchronous in-process transcription.

### Local development (no key required)

```bash
# In a separate terminal:
npx inngest-cli@latest dev
```

`manage.sh` auto-detects the Inngest dev server on port 8288 and sets `INNGEST_DEV=1`. No `INNGEST_EVENT_KEY` is needed in this mode.

```dotenv
# .env.local — for local dev the default value works:
INNGEST_EVENT_KEY=local
```

Visit the Inngest UI at `http://localhost:8288` to inspect events and function runs.

### Production

1. Create an account at [inngest.com](https://www.inngest.com)
2. Create an app and copy the **Event Key** and **Signing Key**

```dotenv
INNGEST_EVENT_KEY=event_...
INNGEST_SIGNING_KEY=signkey-...
```

Register your app's serve endpoint in the Inngest dashboard: `https://your-domain.com/api/inngest`

---

## 8. Payments

Both payment providers are optional. Configure the one(s) you want to offer.

### Razorpay (India / INR)

1. Create an account at [razorpay.com](https://razorpay.com)
2. **Settings → API Keys** — generate a key pair
3. Create three subscription plans (Starter / Pro / Pro Plus Local) and note their Plan IDs
4. Set up a webhook pointing to `https://your-domain.com/api/webhooks/razorpay`
5. Copy the webhook secret

```dotenv
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=<secret>
RAZORPAY_WEBHOOK_SECRET=<webhook-secret>
RAZORPAY_PLAN_STARTER=plan_...
RAZORPAY_PLAN_PRO=plan_...
RAZORPAY_PLAN_PRO_PLUS_LOCAL=plan_...
```

### Lemon Squeezy (Global / USD)

1. Create an account at [lemonsqueezy.com](https://lemonsqueezy.com)
2. **Settings → API** — generate an API key
3. Note your **Store ID** from the dashboard
4. Create three product variants (Starter / Pro / Pro Plus Local) and note their Variant IDs
5. Set up a webhook pointing to `https://your-domain.com/api/webhooks/lemonsqueezy`
6. Copy the webhook secret (shown once on creation)

```dotenv
LEMONSQUEEZY_API_KEY=eyJ...
LEMONSQUEEZY_STORE_ID=12345
LEMONSQUEEZY_WEBHOOK_SECRET=<webhook-secret>
LEMONSQUEEZY_VARIANT_STARTER=111111
LEMONSQUEEZY_VARIANT_PRO=222222
LEMONSQUEEZY_VARIANT_PRO_PLUS_LOCAL=333333
```

---

## 9. Observability (optional)

All observability integrations are optional. Leave them empty to disable.

### Sentry (error tracking)

1. Create a project at [sentry.io](https://sentry.io) (framework: **Next.js**)
2. Copy the DSN from **Settings → Client Keys**
3. Generate an auth token from **Settings → Auth Tokens** (for source maps upload)

```dotenv
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
SENTRY_DSN=https://...@sentry.io/...
SENTRY_AUTH_TOKEN=sntrys_...
```

### PostHog (analytics)

1. Create a project at [posthog.com](https://posthog.com) or self-host
2. Copy the **Project API key** from **Project Settings**

```dotenv
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com   # or your self-hosted URL
```

### Resend (email — daily cost digest)

1. Create an account at [resend.com](https://resend.com)
2. Add and verify your sending domain
3. Generate an API key

```dotenv
RESEND_API_KEY=re_...
FROM_EMAIL=hello@your-domain.com
DIGEST_EMAIL=you@your-domain.com   # where the daily cost digest is sent
```

---

## 10. Admin access

The admin dashboard is at `<APP_URL>/admin`. Access is gated by the `is_admin` flag on the user's profile row.

### Grant admin access to a user

After the user has signed in at least once (so their profile row exists), run this SQL in the **Supabase Dashboard → SQL Editor** (or via psql):

```sql
update public.profiles
  set is_admin = true
  where id = '<user-uuid>';
```

Find the user UUID in **Authentication → Users** in the Supabase Dashboard.

You can also get it from the admin info helper:

```bash
./manage.sh admin
```

### What the admin dashboard shows

- User count and tier breakdown (free / starter / pro / pro_plus_local)
- Audit log events (auth · payments · security)
- Per-user usage stats with IST timestamps
- Live users (active in the last 5 minutes)
- Per-user API cost breakdown (30-day window)

---

## 11. Start the app

### Development

```bash
./manage.sh start dev    # or just: pnpm dev
```

This:

1. Displays all config values (secrets redacted)
2. Starts or skips local Supabase (skipped when a remote URL is detected)
3. Auto-links the Supabase CLI if `SUPABASE_PROJECT_REF` is set
4. Detects an Inngest dev server on :8288 and sets `INNGEST_DEV=1`
5. Starts Next.js dev server in the background
6. Tails the log until the app is reachable at `http://localhost:3000`

```bash
# Other useful commands while running:
./manage.sh logs         # tail logs/server.log with colour
./manage.sh status       # check PID and URLs
./manage.sh restart dev  # stop + start
./manage.sh stop         # graceful shutdown
```

### Production

```bash
# Build first:
./manage.sh build

# Then start (serves from .next/, writes logs to logs/server.log):
./manage.sh start prod
```

---

## 12. Quick reference — manage.sh commands

```
./manage.sh start [dev|prod]   Start the server (default: dev)
./manage.sh stop               Stop the server
./manage.sh restart [dev|prod] Stop then start
./manage.sh status             PID, URL, admin link
./manage.sh logs               Tail logs/server.log
./manage.sh build              Production build
./manage.sh config             Print all config values (redacted)
./manage.sh stats              Node/pnpm version, build ID, server state
./manage.sh admin              Admin URL + grant-access SQL
./manage.sh help               Full command reference

./manage.sh db start           Start local Supabase stack + apply migrations
./manage.sh db stop            Stop local Supabase stack
./manage.sh db push            Apply pending migrations to local DB
./manage.sh db remote          Apply pending migrations to linked remote project
./manage.sh db reset           Drop + recreate local DB (destructive)
./manage.sh db status          Check whether local stack is running

./manage.sh test               Run all test suites
./manage.sh test unit          Unit tests only
./manage.sh test coverage      Unit tests with coverage report
./manage.sh test security      Security test suite
./manage.sh test e2e           End-to-end tests (Playwright / Chromium)
```

---

## Complete `.env.local` template

```dotenv
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_PROJECT_REF=<ref>          # enables auto-link on manage.sh start/stop

# Google OAuth (documentation only — configured in Supabase Dashboard)
GOOGLE_CLIENT_ID=<client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<client-secret>

# LLMs — set at least one
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
SARVAM_API_KEY=
ELEVENLABS_API_KEY=
GOOGLE_GEMINI_API_KEY=
GEMINI_STT_MODEL=                   # default: gemini-2.5-flash
GEMINI_LLM_MODEL=                   # default: gemini-2.5-flash
LLM_PROVIDER=                       # override: anthropic | openai | gemini

# Payments — Razorpay (India / INR)
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
RAZORPAY_PLAN_STARTER=
RAZORPAY_PLAN_PRO=
RAZORPAY_PLAN_PRO_PLUS_LOCAL=

# Payments — Lemon Squeezy (global / USD)
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_WEBHOOK_SECRET=
LEMONSQUEEZY_VARIANT_STARTER=
LEMONSQUEEZY_VARIANT_PRO=
LEMONSQUEEZY_VARIANT_PRO_PLUS_LOCAL=

# Background jobs — Inngest
INNGEST_EVENT_KEY=local             # "local" works with the local Inngest dev server
INNGEST_SIGNING_KEY=

# Observability
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_DSN=
SENTRY_AUTH_TOKEN=

# Email (Resend — daily cost digest)
RESEND_API_KEY=
FROM_EMAIL=hello@quillcast.app
DIGEST_EMAIL=

# Feature flags / cost guardrails
DAILY_COST_CAP_USD=20
ENABLE_SARVAM=false
ENABLE_ELEVENLABS=false
ELEVENLABS_PREMIUM=false
```

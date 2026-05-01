# AudioNotes — Full Plan: Naming + MVP + Phased Roadmap

## Context

Solo founder in Bengaluru building a multilingual voice-to-text web app as a direct improvement over AudioPen.ai. The repo at `/home/user/audio-descriptor` is a clean slate (only CLAUDE.md + README.md exist). Tech stack is fully locked in CLAUDE.md. This plan covers naming, MVP scope, and the big-picture phased build-out.

---

## 1. App Name Recommendation

**The brief:** Same spirit as "AudioPen" — one word for voice input, one for written output. Original, not taken by major competitors. Must work globally and feel Bharat-friendly.

### Top candidates (AudioPen-style, original)

| Name | Meaning | Domain options | Notes |
|---|---|---|---|
| **VoxPad** | vox (Latin: voice) + pad (notepad) | voxpad.app, getvoxpad.com | Short, global, clean. "Vox" is widely understood internationally. |
| **Narrato** | narrate + "-o" Italian/modern suffix | narrato.app, narrato.io | Feels like a modern SaaS product, memorable, implies storytelling. |
| **Inkcast** | ink (writing) + cast (to project/broadcast voice) | inkcast.app, inkcast.io | Creative metaphor — you "cast" your voice, it becomes ink. |
| **QuillCast** | quill (writing instrument) + cast | quillcast.app | More poetic. Quill evokes handwriting craft. |
| **Dictato** | from Latin dictare (to dictate) + "-o" suffix | dictato.app, dictato.io | Very literal meaning, easy to remember, sounds modern. |

### Recommendation: **Narrato**

- Narrate → written narrative. Exact same structural meaning as AudioPen (action → artifact).
- The "-o" suffix makes it feel like a modern product (similar to Figma, Notion, Canva).
- Works globally, no language barrier.
- "Narrato" as a concept works for ALL languages: you narrate in Hindi, Tamil, English, Hinglish — Narrato writes it for you.
- Tagline: *"Speak your thoughts. Narrato writes them."*
- Domain: `narrato.app` (check availability — high confidence it's not taken by a direct competitor; there is a content marketing SaaS called "Narrato Workspace" but it targets a completely different space — content teams, not voice notes).

**If "Narrato" domain conflicts:** fall back to **VoxPad** (no conflicts found with voice-note apps).

---

## 2. Repository & Branch

- Repo: `vigneshpalanivelr/audio-descriptor`
- Active dev branch: `claude/plan-mvp-naming-Y7eZq`
- All Phase 1 code goes on this branch; PR to `main` after MVP is verified.

---

## 3. MVP Scope — Phase 1 (Weeks 1–4)

Exactly as defined in CLAUDE.md §13. 11 deliverables, executed across ~5 coding sessions.

### Session 1 — Project scaffold (Day 1)
1. Initialize Next.js 15 project with TypeScript, Tailwind, shadcn/ui, pnpm in current repo root.
2. Create folder structure per CLAUDE.md §11.
3. Commit `.env.example` per §21 (all keys empty, gitignored `.env.local`).
4. Wire Supabase clients: `src/lib/supabase/client.ts`, `server.ts`, `service.ts` using `@supabase/ssr`.
5. Create DB migration: `supabase/migrations/<timestamp>_init.sql` — all 4 tables + RLS policies + indexes + audio storage bucket per §12.
6. Add `.nvmrc` pinned to Node 20 LTS.

**Critical files:** `package.json`, `src/lib/supabase/*.ts`, `supabase/migrations/`, `.env.example`

### Session 2 — Landing page + Auth (Day 1–2)
1. Landing page at `src/app/(marketing)/page.tsx`: hero, 30-sec demo video placeholder, 3-tier pricing table (§9), FAQ, footer. English only. Mark copy sections `TODO: copy v2`.
2. Hindi landing clone at `src/app/(marketing)/hi/page.tsx` — same structure, placeholder Hindi copy.
3. Google OAuth + email magic link via Supabase Auth.
4. Auth callback at `src/app/auth/callback/route.ts`.
5. Sign-in page at `src/app/auth/sign-in/page.tsx`.
6. Onboarding: after first sign-in, ask for default language (single dropdown, persists to `profiles.default_language`).
7. Authenticated layout + placeholder `/notes` page ("no notes yet" + "New Note" button stub).

**Critical files:** `src/app/(marketing)/page.tsx`, `src/app/auth/`, `src/app/(app)/notes/page.tsx`

### Session 3 — Recorder UI + Audio upload (Day 2–3)
1. `MediaRecorder` component with `audio/webm;codecs=opus` + Safari fallback `audio/mp4`, `timeslice=5000ms`, chunked upload to Supabase Storage via signed URLs.
2. Live waveform (Web Audio API `AnalyserNode`), timer, pause/resume.
3. Three intensity radio buttons as first-class UI: Verbatim | Light | Full.
4. Language pill showing auto-detected language with manual override.
5. Hard server-side cap enforcement: 5 min (Free), 30 min (Starter), unlimited (Pro).
6. Audio file upload path: drag-drop, `ffmpeg-wasm` splits >25MB before sending.
7. `Blob.slice()` fix for Chrome Android large-chunk bug.

**Critical files:** `src/components/recording/Recorder.tsx`, `src/components/recording/Waveform.tsx`, `src/app/api/upload/route.ts`

### Session 4 — Inngest pipeline (Day 3–4)
1. Inngest client + `src/inngest/functions/transcribe.ts`:
   - `audio.uploaded` event → STT routing (§8 decision tree) → writes `notes.transcript_raw`.
   - For now: only OpenAI `gpt-4o-mini-transcribe` implemented (Anthropic key is ready; Sarvam/ElevenLabs stubbed behind feature flags).
2. `src/inngest/functions/cleanup.ts`:
   - Triggered after transcribe → LLM cleanup routing → writes `notes.summary`.
   - Default: Claude Haiku 4.5 (Anthropic key available).
3. `src/app/api/inngest/route.ts` webhook handler.
4. Supabase Realtime events from pipeline → live status updates on client (`pending → transcribing → cleaning → ready`).
5. STT routing in `src/lib/stt/route.ts` with `INDIAN_LANGUAGES` constant.
6. LLM routing in `src/lib/llm/route.ts` with fallback logic.
7. All 5 prompts as named TS exports in `src/lib/llm/prompts/` (verbatim, light-cleanup, full-rewrite, title, write-like-me stub).

**Critical files:** `src/inngest/functions/transcribe.ts`, `src/inngest/functions/cleanup.ts`, `src/lib/stt/`, `src/lib/llm/`, `src/lib/llm/prompts/`

### Session 5 — Note views + Usage + Payments + Observability (Day 4–5)
1. Notes list view: cards with title, snippet, language flag, date, status badge.
2. Single note view: side-by-side `transcript_raw` ↔ `summary`, edit summary in-place, copy, delete, regenerate-with-different-intensity button.
3. Usage tracking: per-user per-month, middleware enforces limits BEFORE queuing transcription.
4. Razorpay checkout (India): `src/lib/payments/razorpay.ts` + webhook at `src/app/api/webhooks/razorpay/route.ts`.
5. Lemon Squeezy checkout (global): `src/lib/payments/lemonsqueezy.ts` + webhook at `src/app/api/webhooks/lemonsqueezy/route.ts`.
6. Idempotent `payment_events` inserts keyed on `external_event_id`.
7. PostHog: `NEXT_PUBLIC_POSTHOG_KEY` wired in layout; session replay disabled on `/notes` routes.
8. Sentry: error boundary in root layout, `SENTRY_DSN` env var.
9. Cost-tracking Inngest cron `src/inngest/functions/cost-digest.ts`: daily sum of `cost_usd` → email via Resend.
10. Daily company-wide spend cap ($20) checked before transcription job runs.

**Critical files:** `src/app/(app)/notes/`, `src/lib/usage/limits.ts`, `src/lib/payments/`, `src/app/api/webhooks/`

---

## 4. Big Picture — All Phases

### Phase 2 (Weeks 5–10) — Competitive parity
- Expo native iOS + Android apps (reusing TS lib code).
- Folders, tags, full-text search (`tsvector`).
- Custom user prompts (saved per profile).
- Style library (blog post, LinkedIn, email, journal, meeting notes, SOAP note).
- "Write Like Me" — Sonnet 4.6, 3–5 writing samples as in-prompt examples.
- "SuperSummary" across notes (Gemini 3 Pro, 1M context).
- Auto language detection pill on recorder.
- UI localization for 5 languages (next-intl).
- Native Notion + Obsidian + Apple Notes integrations (no Zapier).
- Public API + webhooks (Pro tier).
- Affiliate program (Lemon Squeezy built-in, 30% recurring).
- Share-as-image generator (canvas, branded watermark on Free).

### Phase 3 (Weeks 11–24) — Differentiation / moat
- WhatsApp bot voice capture → Narrato → notes saved to account.
- "Ask your notes" RAG (pgvector, `text-embedding-3-small`).
- Smart reminders (LLM extracts action items → push).
- Mac dictation app (Tauri + system-wide hotkey).
- On-device Whisper mode (`whisper.cpp` WASM, Pro+ Local tier).
- Team plan ($49/mo flat, shared prompts, admin privacy guarantee).
- Vertical landing pages: `/for-doctors`, `/for-lawyers`, `/for-students`, etc.
- Chrome extension.
- HIPAA/BAA pathway (only after vendor BAAs are signed).

---

## 5. STT & LLM Engine Rollout Order

Phase 1 uses only what's available and provisioned:
- **STT:** OpenAI `gpt-4o-mini-transcribe` (once OpenAI key is added). Until then, stub with a mock that returns a fixed transcript.
- **LLM cleanup:** Claude Haiku 4.5 via Anthropic SDK (key is ready).
- **Sarvam, ElevenLabs:** feature-flagged off via `ENABLE_SARVAM=false`, `ENABLE_ELEVENLABS=false` in `.env.example`. Their adapters are written but not called.

---

## 6. Accounts Still Needed (Non-Blocking for Session 1)

| Service | Needed by | Blocking? |
|---|---|---|
| Supabase (project URL + keys) | Session 1 | YES — needed to run DB migration |
| OpenAI API key | Session 4 | No — stub until then |
| Sarvam API key | Phase 1 (optional) | No — feature-flagged |
| Inngest (event + signing keys) | Session 4 | No — dev server works without |
| Razorpay keys | Session 5 | No — stub webhook logic |
| Lemon Squeezy keys | Session 5 | No — stub webhook logic |
| Resend API key | Session 5 | No — log email instead |
| PostHog key | Session 5 | No — skip in dev |

---

## 7. Pre-Session Checklist (Before Coding Starts)

- [ ] Pick final app name (Narrato or alternative) — update CLAUDE.md §1, README.md
- [ ] Create Supabase project and copy URL + anon key + service role key to `.env.local`
- [ ] Confirm Node 20 is installed: `node -v`
- [ ] Confirm pnpm is installed: `pnpm -v`
- [ ] Rename repo from `audio-descriptor` to chosen app name (optional, can defer)

---

## 8. What We Outsource — Full Map

Everything we **don't build ourselves** and the service handling it:

| Concern | Outsourced to | What we build |
|---|---|---|
| **Authentication** | Supabase Auth (Google OAuth + magic links) | Just the sign-in UI page + callback route handler |
| **Database** | Supabase (managed Postgres) | Schema migrations + RLS policies |
| **File storage** | Supabase Storage | Upload logic + signed URL generation |
| **Realtime (live status)** | Supabase Realtime | Client subscription hook |
| **Background jobs / queues** | Inngest | Job function code (transcribe, cleanup, cron) |
| **Speech-to-Text (STT)** | OpenAI API (`gpt-4o-mini-transcribe`) / Sarvam / ElevenLabs | Routing logic + adapter wrappers per engine |
| **LLM cleanup** | Anthropic API (Claude Haiku 4.5 / Sonnet 4.6) / Google Gemini | Prompt templates + routing logic |
| **Title generation** | OpenAI API (GPT-5 nano) | One-line prompt call |
| **Audio codec conversion** | `ffmpeg-wasm` (runs in browser) | Chunk-split logic for files >25MB |
| **Email delivery** | Resend | Email template + API call |
| **Payments — India** | Razorpay | Checkout initiation + webhook handler |
| **Payments — Global** | Lemon Squeezy (Merchant of Record, handles all GST/VAT) | Checkout link + webhook handler |
| **Frontend hosting** | Vercel | Zero-config (push to deploy) |
| **Error monitoring** | Sentry | Error boundary wrapper + DSN config |
| **Product analytics** | PostHog | Event calls + session replay setup |
| **UI component library** | shadcn/ui + Tailwind | Customization + layout |
| **UI localization** | next-intl (Phase 2) | Translation JSON files + locale routing |
| **Affiliate program** | Lemon Squeezy (built-in, 30% recurring) | Nothing extra |
| **On-device transcription (Phase 3)** | whisper.cpp / WASM | Integration + streaming UI |

**What we fully own (build ourselves):**
- Recording UI (MediaRecorder, waveform, pause/resume, chunk upload)
- STT routing decision tree
- LLM cleanup routing + prompt templates
- Notes list + single-note side-by-side view
- Usage tracking + free-tier enforcement middleware
- Payment webhook handlers + profile tier updates
- Cost-tracking cron + daily spend cap guard
- Landing pages (English + Hindi)

---

## 9. Verification (end-to-end test after Phase 1)

1. `pnpm lint && pnpm typecheck` — must pass with zero errors.
2. Visit `http://localhost:3000` → landing page renders with pricing table.
3. Click "Sign in" → Google OAuth flow completes → redirected to `/notes`.
4. Click "New Note" → recorder loads → record 10 seconds → submit.
5. Note status moves: `pending → transcribing → cleaning → ready` in real time.
6. Notes list shows new card. Click it → side-by-side transcript + summary.
7. Click "Regenerate" → choose Full intensity → summary updates.
8. Supabase dashboard: `notes` table has 1 row; `audio` bucket has chunk file; `usage` table has minutes_used > 0.
9. Check Inngest dashboard: `transcribe` + `cleanup` functions both succeeded.
10. Check Sentry: no unhandled errors in the session.

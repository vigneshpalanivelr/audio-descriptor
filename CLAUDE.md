# CLAUDE.md — AudioNotes Project Bible

> This file is the persistent context for the project. Claude Code reads it at the start of every session. Keep it updated as decisions change.
> Last updated: May 2026.

---

## 0. Quick orientation for any AI assistant reading this

- **What we're building:** A multilingual voice-to-text web app inspired by [AudioPen.ai](https://audiopen.ai), with a Bharat-first wedge and several deliberate improvements over AudioPen's known weaknesses.
- **Who's building it:** Solo founder in Bengaluru, India. Vibe-coding via Claude Code. Has a Claude Pro subscription. Limited prior coding experience — explain non-trivial decisions briefly before implementing them.
- **Stage:** Pre-MVP. Repo is empty. Accounts are being provisioned in parallel.
- **North star:** $10K MRR within 12 months by being meaningfully better than AudioPen for non-English speakers, code-switchers, and privacy-sensitive professionals.
- **Working style:** Small reviewable changes. Ask before guessing on schema, pricing logic, or API choices. Run `pnpm lint && pnpm typecheck` before claiming done.

---

## 1. Project mission & elevator pitch

**One-liner:** *"Speak naturally in any language. Get clean writing, your way."*

**Three-line pitch:** AudioNotes turns rambling voice memos into polished writing in 100+ languages — including native Hindi, Tamil, Telugu, Bengali, Marathi, and even Hinglish/Tanglish code-mixed speech. Unlike AudioPen, you can choose verbatim transcription or AI rewriting, the output stays in your language, your audio is auto-deleted, and there's a Pro+ Local mode where transcription happens entirely on-device. Built for thinkers, students, professionals, doctors, and lawyers who think out loud.

**Working name:** AudioNotes (placeholder — finalize after MVP). Domain shortlist: audionotes.ai, voicethink.ai, vakta.ai, bolo.notes, dhwani.app.

---

## 2. Founder context

- Solo, based in Bengaluru, India.
- Building part-time / full-time depending on traction.
- Time zone: IST (UTC+5:30) — favorable for ProductHunt mornings (US PT noon = 12:30 AM IST) and dual reach into both India and global markets.
- Coding via **Claude Code** as the primary IDE/agent, with VS Code as text editor and terminal.
- Will start with Razorpay (India payments) since Stripe India is invite-only.

---

## 3. The inspiration — AudioPen.ai deep analysis

### What AudioPen is
A web app (now also iOS, Android, Chrome extension, and Mac M1+ app) that records voice notes, transcribes them with OpenAI Whisper, then rewrites the transcript via an LLM into clean prose. Three "rewriting intensities" (Low / Medium / High). Adds folders, tags, "Write Like Me" style training, "SuperSummary" merging, share-images, and Zapier.

### How it's built (inferred + confirmed)
- Frontend: Bubble.io (originally — partial migration likely).
- Backend: Xano.
- STT: OpenAI Whisper API.
- LLM: GPT-4 / GPT-4o.
- Auth: Google OAuth.
- Payments: **Lemon Squeezy** (Merchant of Record — handles VAT/GST globally).

### Founder & business
- Louis Pereira, Goa, India. Built v1 in 12 hours during a hackathon (March 2023).
- Self-reported: ~35K registered users, ~3K paying users, **~$15–20K MRR**, bootstrapped, no employees.
- Two-month launch revenue: ~$73K (boosted by one viral X thread from a 200K-follower account).

### AudioPen pricing history & current state
- $29 → $39 → $60 → **$99/year** (one-year non-recurring). $159/2 years.
- Free tier: 10 notes, 3-min cap, **English-only summary output** (this is the single biggest weakness).
- Prime: 15-min recording cap (yes, even paying), 100 audio file uploads / 4 weeks, max 100MB each.

### The eight weaknesses we're exploiting

1. **English-biased output.** Free tier forces English summaries regardless of input language. Code-switching (Hinglish/Tanglish) handling is whatever Whisper does — not great.
2. **Hard 15-minute recording cap, even on Prime.** Lawyers, doctors, podcasters, researchers hit it constantly.
3. **No verbatim mode.** Even "Low" intensity rewrites. Multiple ProductHunt reviewers explicitly request raw transcript output.
4. **No custom system prompts.** Just preset styles + "Write Like Me" trained on samples.
5. **Web-first UX glitches on mobile.** iOS Safari mic permission resets every session; Android Chrome chunked recording bugs.
6. **No native Notion / Obsidian / Apple Notes / WhatsApp integration.** Only Zapier (most casual users won't set it up).
7. **No "ask your notes" Q&A.** AudioPen is intentionally narrow — it captures, doesn't query.
8. **No on-device option.** All audio briefly transits OpenAI infrastructure — non-starter for healthcare/legal.

### Things AudioPen does well (we copy these)
- **Side-by-side transcript + summary view.** Users repeatedly call this out as trust-building.
- **Auto-deletes audio post-processing.** Privacy-positive default.
- **Simple, focused UI.** Resists the "bloat" feeling of Otter or Notta.
- **Low-friction onboarding.** Google OAuth → record → done in 30 seconds.
- **Build-in-public marketing on X.** We will mirror this with India-friendly hours.

---

## 4. Competitive landscape (memorize the table — informs every product decision)

| Product | Positioning | Pricing | Strength to study | Gap we exploit |
|---|---|---|---|---|
| **AudioPen.ai** | Solo voice rewriting | $99/yr | Polish, "Write Like Me" | English-bias, 15-min cap, no verbatim, expensive |
| **Voicenotes.com** | Second brain + Q&A | $99.99/yr | 100+ languages, Apple Watch, "Ask your notes" | Onboarding criticized as predatory |
| **Letterly** | Voice → comm assets | $59 LTD | iOS-first, 30+ languages | Less polished rewriting |
| **Otter.ai** | Meetings/teams | $16.99/mo | Auto-joins Zoom/Meet | Only 4 languages |
| **Notta** | Cross-platform meetings | $13.99/mo | 104 languages | Not for "rambling thoughts" |
| **Fireflies.ai** | Meeting recorder | $10–19/mo | CRM integrations | Meeting-only |
| **Rev** | Pro transcription | $0.25/min | Human-grade accuracy | Not a thought-capture tool |
| **Descript** | Audio/video editor | $19+/mo | Editor-grade | Overkill |
| **MacWhisper** | Local Whisper | $59 one-time | Privacy, offline | Mac-only |
| **Whisper Memos** | iOS → email | $9.99/mo | Apple Watch, Shortcuts | iOS-only, narrow |
| **SuperWhisper / Wispr Flow / Aqua / VoiceInk** | System-wide dictation | $8–15/mo | Replace keyboard | Not journaling |
| **Speakwise** | iOS + Notion-native | iOS LTD | AirPods, Notion sync | iOS-only |
| **Notis.ai** | WhatsApp → Notion | $20/mo or $200 LTD | WhatsApp capture | Notion-dependent |
| **Voices.ink** | Notion-native | Free + paid | Direct Notion API | New, smaller |
| **Audionotes / Speechtonote** | AudioPen clones | $5–10/mo | Cheap | Less polish |
| **Remi8** | Reminders + meetings | $4.99/mo | Cheap, second brain | New entrant |
| **Sarvam AI Voice apps** | India-centric | API only | 22 Indian languages, Hinglish | No consumer journaling product yet |

**Multilingual leaders by quantity:** Voicenotes (100+), Notta (104).
**Multilingual leaders by accuracy:** ElevenLabs Scribe v2 (best WER on FLEURS / Common Voice).
**Indian languages + code-switching:** Sarvam Saaras v3 — purpose-built, no peer.

---

## 5. Target audience & niche wedges

**Broad targeting:** general note-takers, writers, students, researchers, professionals, doctors, lawyers, podcasters, ESL speakers, content creators.

**Wedges to attack in order:**

1. **Bharat-first multilingual users** (Phase 1 marketing) — Hindi, Tamil, Telugu, Bengali, Marathi speakers who want to think in their language. Distribution: Indian Twitter/X, LinkedIn India, YouTube Hindi/Tamil tech creators.
2. **Hinglish / Tanglish code-switchers** (Phase 1) — most Indian urban professionals. Sarvam handles this; AudioPen does not.
3. **ESL professionals globally** (Phase 1.5) — non-native English speakers who want to dictate in their language and publish in English (or vice versa).
4. **Privacy-first professionals** (Phase 2) — therapists, coaches, lawyers, journalists. Ship "Pro+ Local" with on-device whisper.cpp.
5. **Doctors / radiologists** (Phase 3) — only after BAAs are signed with vendors. Don't market HIPAA until contracts are in place.
6. **Students (esp. Indian engineering/medical)** (Phase 3) — lecture capture + essay rewriting. Student pricing.

**Not targeting (yet):** enterprise teams, sales call recording, podcast editing.

---

## 6. Goals & success criteria

| Metric | Month 3 | Month 6 | Month 12 |
|---|---|---|---|
| MRR | $1K | $3K | $10K |
| Paying users | ~150 (mix INR + USD) | ~400 | ~1,200 |
| Free signups | 3K | 10K | 30K |
| Free → paid conversion | 5% | 4% | 4% |
| Per-note marginal cost | ≤ $0.05 (5-min note) | ≤ $0.04 | ≤ $0.03 |
| Gross margin | ≥ 60% | ≥ 70% | ≥ 75% |

**Reality check:** AudioPen hit $73K in 2 months largely from one viral X thread by a 200K-follower account. Without that catalyst, $1K/$3K/$10K trajectory above is realistic for a focused solo launch with content marketing, ProductHunt, and one well-placed influencer signal.

---

## 7. Tech stack — locked decisions

| Layer | Choice | Why locked |
|---|---|---|
| **Frontend framework** | Next.js 15 (App Router) + TypeScript | Best Claude/Cursor training data; SSR for SEO |
| **Styling** | Tailwind + shadcn/ui | Standard, fast iteration |
| **Hosting (web)** | Vercel | Zero-config Next.js |
| **Long-running jobs** | Inngest | Better DX than QStash; free tier generous |
| **DB / Auth / Storage** | Supabase | Postgres + RLS + Storage + Auth in one. RLS is critical for note privacy. |
| **Auth UI** | Supabase Auth + custom UI (not Clerk) | Cost; full control; magic links + Google OAuth cover 99% |
| **Mobile (Phase 2)** | Expo (React Native) | Reuses TS code |
| **Desktop dictation app (Phase 3)** | Tauri | Lighter than Electron; reuses web UI |
| **Email** | Resend | Cheap, clean DX |
| **Analytics** | PostHog | Funnels + session replay (privacy mode for sensitive routes) |
| **Errors** | Sentry | Free hobby tier |
| **Package manager** | pnpm | Faster, disk-efficient |
| **Node version** | 20 LTS | Latest stable |

### STT routing layer (multi-engine)

| Engine | Use case | Price | Note |
|---|---|---|---|
| **OpenAI `gpt-4o-mini-transcribe`** | Default global, 100+ languages | ~$0.003/min | Currently OpenAI's recommended default; lower WER than Whisper-v3 |
| **OpenAI `gpt-4o-transcribe`** | Premium English/global accuracy | ~$0.006/min | ~22% lower WER than Whisper-v3 |
| **Sarvam Saaras v3** | Indian languages + Hinglish/Tanglish | ₹30/hr (~$0.006/min) | Purpose-built; data stays in India; sub-250ms streaming |
| **ElevenLabs Scribe v2** | "Premium accuracy" toggle on Pro | $0.22/hr ($0.0037/min) | Best WER on FLEURS/Common Voice across 90+ langs |
| **AssemblyAI Universal-2** | Optional fallback / future audio-intelligence | $0.0025–0.0042/min | Built-in PII redaction, sentiment, summarization |
| **Self-hosted whisper.cpp / faster-whisper** | Phase 3 on-device "Pro+ Local" mode | Effectively free at scale | Privacy moat |

### LLM routing layer (cleanup + features)

| Model | Use case | Price (per 1M tokens) | Notes |
|---|---|---|---|
| **Claude Haiku 4.5** | Default cleanup, all languages | $1 / $5 | Best quality/cost balance for our task |
| **Claude Sonnet 4.6** | Pro "Write Like Me" + "SuperSummary" | $3 / $15 | Reserve for paying users |
| **Gemini 3 Flash** | Fallback for Indian languages; long-context | $0.50 / $3 | 1M context useful for SuperSummary |
| **Gemini 3 Pro** | "Ask your notes" RAG over 1M-token corpus | $2 / $12 | Phase 3 |
| **Sarvam-105B / 30B** | Native Indic-script reasoning | Via Sarvam API | Worth A/B-testing for Hindi/Tamil/Telugu output |
| **GPT-5 nano** | Title generation, tagging, classification | $0.05 / $0.40 | Cheap utility tasks |

### Payments

| Region | Provider | Why |
|---|---|---|
| **India** | Razorpay | UPI AutoPay, RuPay, INR pricing; HQ in Bengaluru |
| **Rest of world** | Lemon Squeezy | Merchant of Record (MoR) — handles VAT/GST globally |
| **Backup MoR (India-built)** | Dodo Payments | If Lemon Squeezy access becomes problematic |

**Two-gateway strategy:** detect user IP/locale → INR checkout via Razorpay for IN, USD/EUR/GBP via Lemon Squeezy elsewhere. Never charge ₹830 for a $10 plan — set Indian tier at ₹399 / ₹3,499 yearly.

---

## 8. Multilingual strategy — this is the moat

**Principle:** Output language defaults to detected input language. Never auto-translate to English. UI is localized to the user's language when supported.

### STT routing decision tree

```
on transcription_job:
  detected_lang = await detect_language(audio_first_5_seconds) || user.default_language

  if user.tier == "pro_plus_local":
    return whisper_local(audio)               # on-device, never leaves machine

  if user.preference == "premium_accuracy":
    return elevenlabs_scribe(audio, detected_lang)

  if detected_lang in INDIAN_LANGUAGES or detected_lang in ["hinglish", "tanglish"]:
    return sarvam_saaras_v3(audio, detected_lang)

  return openai_gpt4o_mini_transcribe(audio, detected_lang)
```

`INDIAN_LANGUAGES = { "hi", "ta", "te", "bn", "mr", "kn", "ml", "pa", "gu", "or", "as", "ur" }`

### LLM cleanup routing

```
on cleanup_job:
  output_lang = note.output_language || detected_lang

  if output_lang in INDIAN_LANGUAGES:
    primary = sarvam_105b
    fallback = gemini_3_flash
  elif output_lang in ["zh", "ja", "ko", "th", "vi", "id"]:
    primary = gemini_3_flash
    fallback = claude_haiku_4_5
  else:
    primary = claude_haiku_4_5
    fallback = gemini_3_flash

  return run_with_fallback(primary, fallback, prompt, transcript)
```

### WER benchmarks to remember

| Language | Best engine | Approx WER |
|---|---|---|
| English | Scribe / GPT-4o-transcribe | 2.5–4% |
| Spanish, French, German, Italian, Portuguese | Whisper / Scribe | 4–7% |
| Japanese, Korean, Mandarin | Scribe | 5–10% |
| Hindi (clean) | Scribe | 3.1% |
| Hindi (natural / Hinglish) | Sarvam Saaras v3 | 3–6% |
| Tamil, Telugu, Bengali, Marathi, Kannada | Sarvam | 5–10% |
| Malayalam | Scribe | 3.1% |

### UI localization priority order
English (default) → Hindi → Spanish → Brazilian Portuguese → Indonesian → French → German → Japanese → Tamil → Telugu → Bengali → Marathi → Arabic. Use `next-intl`. Pay a freelance translator (~$50/language) rather than auto-translating UI strings.

### Auto-detect UX pattern
On first record, auto-detect from first 5 seconds. Show small language pill near the record button so user can override before starting. Persist as user default after second use of same language.

---

## 9. Pricing model — final structure

| Tier | Price | Limits | Notes |
|---|---|---|---|
| **Free** | $0 | 30 min/mo total, 5-min/note, all languages, English UI only, basic styles | Forces verification + CAPTCHA |
| **Starter** | **$5/mo or $40/yr** | 600 min/mo, 30-min/note, all integrations, native output in any language | Entry-level subscription |
| **Pro** | **$10/mo or $80/yr** | Unlimited minutes, "Write Like Me," Notion/Obsidian sync, custom prompts, model picker, prompt library | The flagship |
| **Pro+ Local** | **$15/mo or $120/yr** | All Pro features + on-device transcription, BAA-eligible cloud option | Phase 3 |
| **PAYG credits** | **$3 / 60 minutes** | One-time, no subscription | For users who refuse subscriptions |
| **India tier (Razorpay)** | **₹399/mo Pro · ₹3,499/yr** | Same as Pro | PPP pricing |
| **Team** | **$49/mo flat + usage** | Unlimited seats, shared prompts, admin can't read individual notes | Phase 3, Voicenotes-inspired |

**No lifetime deals.** Voicenotes had to discontinue $50 LTD as STT costs scaled. Avoid; offer 2-year discount instead (mirrors AudioPen's $159/2yr).

---

## 10. Repository conventions

- `pnpm` for everything. Never `npm install` directly.
- TypeScript strict mode. No `any`. Prefer `unknown` + type guards.
- Server components by default. `"use client"` only when needed (state, refs, effects, browser APIs).
- DB access only in server components, server actions, or route handlers — never in client components.
- Env vars: `.env.local` (gitignored), `.env.example` committed with empty values.
- Branch naming: `feat/short-description`, `fix/short-description`, `chore/short-description`.
- Commits: imperative mood, ≤ 72 chars. e.g., `feat: add Sarvam STT engine adapter`.
- One feature per PR. PR description must include screenshot/GIF for UI changes.
- Lint + typecheck must pass before PR is "done."
- Migrations: `supabase/migrations/<timestamp>_description.sql`. Never edit schema in the Supabase dashboard for a real environment.

---

## 11. Folder structure (target)

```
audionotes/
├── src/
│   ├── app/
│   │   ├── (marketing)/                # public landing pages
│   │   │   ├── page.tsx
│   │   │   ├── pricing/page.tsx
│   │   │   ├── for-doctors/page.tsx    # vertical landing pages (Phase 3)
│   │   │   ├── hi/page.tsx             # Hindi landing
│   │   │   └── ...
│   │   ├── (app)/                      # authenticated app
│   │   │   ├── layout.tsx
│   │   │   ├── notes/
│   │   │   │   ├── page.tsx            # list view
│   │   │   │   ├── [id]/page.tsx       # single note
│   │   │   │   └── new/page.tsx        # record
│   │   │   └── settings/
│   │   ├── api/
│   │   │   ├── upload/route.ts         # signed-URL handler
│   │   │   ├── transcribe/route.ts     # Inngest trigger
│   │   │   ├── inngest/route.ts        # Inngest webhook
│   │   │   └── webhooks/
│   │   │       ├── razorpay/route.ts
│   │   │       └── lemonsqueezy/route.ts
│   │   ├── auth/
│   │   │   ├── callback/route.ts
│   │   │   └── sign-in/page.tsx
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                         # shadcn primitives
│   │   ├── recording/                  # Recorder, Waveform, Timer
│   │   ├── notes/                      # NoteCard, NoteView, IntensitySelect
│   │   └── marketing/
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts               # browser client
│   │   │   ├── server.ts               # server client
│   │   │   └── service.ts              # service-role for Inngest
│   │   ├── stt/
│   │   │   ├── types.ts                # TranscribeRequest, TranscribeResult
│   │   │   ├── openai.ts
│   │   │   ├── sarvam.ts
│   │   │   ├── elevenlabs.ts
│   │   │   ├── languages.ts            # INDIAN_LANGUAGES, etc.
│   │   │   └── route.ts                # routing decision
│   │   ├── llm/
│   │   │   ├── anthropic.ts
│   │   │   ├── gemini.ts
│   │   │   ├── sarvam.ts
│   │   │   ├── prompts/
│   │   │   │   ├── verbatim.ts
│   │   │   │   ├── light-cleanup.ts
│   │   │   │   ├── full-rewrite.ts
│   │   │   │   ├── title.ts
│   │   │   │   └── write-like-me.ts
│   │   │   └── route.ts
│   │   ├── payments/
│   │   │   ├── razorpay.ts
│   │   │   └── lemonsqueezy.ts
│   │   ├── usage/
│   │   │   └── limits.ts               # free-tier enforcement
│   │   └── i18n/
│   ├── inngest/
│   │   ├── client.ts
│   │   └── functions/
│   │       ├── transcribe.ts
│   │       ├── cleanup.ts
│   │       └── cost-digest.ts          # daily Slack/email
│   ├── hooks/
│   ├── types/
│   └── messages/                       # next-intl translations
├── supabase/
│   ├── migrations/
│   └── seed.sql
├── public/
├── .env.example
├── .nvmrc
├── CLAUDE.md
├── README.md
└── package.json
```

---

## 12. Database schema (Phase 1)

```sql
-- profiles: extends auth.users
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  default_language text default 'en',           -- e.g. 'hi', 'ta', 'en'
  default_intensity text default 'light',       -- 'verbatim' | 'light' | 'full'
  default_stt_engine text,                      -- null = auto-route
  default_llm_model text,                       -- null = auto-route
  ui_locale text default 'en',
  tier text default 'free',                     -- 'free' | 'starter' | 'pro' | 'pro_plus_local'
  subscription_status text default 'active',
  subscription_provider text,                   -- 'razorpay' | 'lemonsqueezy'
  subscription_ref text,                        -- external subscription id
  created_at timestamptz default now()
);

-- notes
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  title text,
  transcript_raw text,
  summary text,
  audio_storage_path text,
  audio_duration_sec int,
  language_detected text,
  language_output text,
  intensity text,                               -- 'verbatim' | 'light' | 'full'
  stt_engine text,                              -- 'openai' | 'sarvam' | 'elevenlabs' | 'whisper_local'
  llm_model text,
  status text default 'pending',                -- 'pending' | 'transcribing' | 'cleaning' | 'ready' | 'failed'
  error text,
  cost_usd numeric(10,6),
  tags text[] default '{}',
  is_starred boolean default false,
  is_archived boolean default false,
  created_at timestamptz default now(),
  ready_at timestamptz
);
create index on public.notes (user_id, created_at desc);
create index on public.notes using gin (tags);

-- usage: per-user per-month minute tracking
create table public.usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  month text not null,                          -- 'YYYY-MM'
  minutes_used numeric(10,2) default 0,
  notes_count int default 0,
  cost_usd numeric(10,6) default 0,
  updated_at timestamptz default now(),
  unique(user_id, month)
);

-- payments / subscription events (audit log)
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  provider text not null,
  event_type text not null,
  external_event_id text,
  payload jsonb,
  created_at timestamptz default now()
);

-- enable RLS on every table
alter table public.profiles enable row level security;
alter table public.notes enable row level security;
alter table public.usage enable row level security;
alter table public.payment_events enable row level security;

-- example policy: users can only read/write their own notes
create policy "users own notes" on public.notes
  for all using (auth.uid() = user_id);
```

**Storage bucket:** `audio` — private, signed URLs only, 7-day max retention (auto-purge job).

---

## 13. Phase 1 — MVP scope (weeks 1–4). Build only these.

1. **Auth** (Google OAuth + email magic link via Supabase). Onboarding asks for default language.
2. **Recorder UI** with `MediaRecorder`, `audio/webm;codecs=opus` (fallback `audio/mp4` for Safari), `timeslice = 5000ms`, chunked upload to Supabase Storage via signed URLs. Live waveform, timer, pause/resume. Hard server-side caps: 5 min on Free, 30 min on Starter, unlimited on Pro.
3. **Audio file upload** as second input path (drag-drop, max 100MB, ffmpeg-wasm splits >25MB into chunks before sending to OpenAI).
4. **Inngest pipeline:**
   - `audio.uploaded` → `transcribe` function → routes to STT engine → writes `transcript_raw`.
   - Then triggers `cleanup` function → routes to LLM → writes `summary`.
   - Both stages emit Supabase realtime events to client for live status.
5. **Three intensities, with verbatim as a first-class radio button on the recording screen.**
6. **Note views:**
   - List (cards with title, snippet, language flag, date).
   - Single (side-by-side `transcript_raw` ↔ `summary`, edit summary in-place, copy, delete, regenerate-with-different-intensity).
7. **Usage tracking + free-tier limits** enforced in middleware before transcription is queued.
8. **Razorpay (India) + Lemon Squeezy (global) checkout.** Webhooks update `profiles.tier`. Stripe-style idempotency on `payment_events.external_event_id`.
9. **Landing page** in English: hero, 30-second demo video, 3-tier pricing table, FAQ, footer. Hindi version cloned at `/hi` for SEO.
10. **PostHog + Sentry** wired up. PostHog session replay disabled on `/notes` for privacy.
11. **Cost-tracking digest** (daily Inngest cron) summing `cost_usd` per user → email me.

**Phase 1 explicit non-goals:** native apps, "Write Like Me," custom prompts, Notion/Obsidian, "Ask your notes," WhatsApp, on-device, team plans, share-as-image (Phase 1.5).

---

## 14. Phase 2 — competitive parity (weeks 5–10)

- Native iOS + Android via **Expo**, sharing TS code with web.
- Folders, tags, full-text search (Postgres `tsvector`).
- Custom user prompts (saved per profile).
- Style library (preset prompts: blog post, LinkedIn post, email, journal, meeting notes, SOAP note).
- "Write Like Me" — fine-tuned via 3–5 user samples passed into a prompt template.
- "SuperSummary" across multiple notes (Gemini 3 Pro, 1M context).
- Auto language detection (default on; user can override).
- UI localization for top 5 languages.
- Native Notion + Obsidian + Apple Notes integrations (no Zapier).
- Public API + webhooks (Pro tier).
- Affiliate program (Lemon Squeezy has it built-in; 30% recurring).
- Share-as-image generator (canvas-based, with branded watermark for Free, removed for Pro).

---

## 15. Phase 3 — differentiation (weeks 11–24)

- **WhatsApp bot** — record voice in any chat, get cleaned text back + saved to account. (Notis.ai-style.)
- **Apple Watch capture** via WatchKit companion.
- **"Ask your notes" RAG** — pgvector on Supabase, embeddings via `text-embedding-3-small` ($0.02 / 1M tokens), retrieval over user's full corpus.
- **Smart reminders** — LLM extracts action items, schedules push notifications.
- **Mac dictation app** (Tauri) — system-wide hotkey, replaces Wispr Flow / SuperWhisper.
- **On-device Whisper mode** (Pro+ Local tier) — `whisper.cpp` via WASM in browser, native bindings on desktop.
- **Team plan** with shared prompt library and admin dashboard (admin cannot read individual notes — privacy guarantee).
- **Vertical landing pages**: `/for-doctors`, `/for-lawyers`, `/for-students`, `/for-podcasters`, `/for-journalists`. Each with vertical-specific prompts and SEO copy.
- **Prompt marketplace** — community-contributed prompts; revenue share to top contributors.
- **Chrome extension** — record from any tab.
- **HIPAA / BAA pathway** — sign BAAs with Anthropic, AssemblyAI, ElevenLabs; market to US healthcare separately.

---

## 16. Differentiation principles — DO NOT VIOLATE

These are commandments, not preferences. Every PR is reviewed against them.

1. **Multilingual is the moat.** Output language defaults to input language. Never silently translate to English. Even error messages localize when a UI locale is set.
2. **Verbatim is first-class.** It's a top-level radio button on the recorder, not a setting buried three menus deep. Some users *want* the raw transcript with no AI touching it.
3. **Always preserve the original transcript.** The cleanup is a derivative, not a replacement. Display both side-by-side. Always allow "regenerate with different intensity."
4. **Per-user model picker on Pro.** Don't lock users to one provider; give them Claude, GPT, Gemini, Sarvam as options with clear tradeoffs (accuracy / speed / language).
5. **India pricing in INR via Razorpay.** No PPP fudging — set ₹399 (not ₹830) for the Indian Pro tier. UPI AutoPay for recurring.
6. **Audio is auto-deleted within 1 hour** of successful processing (configurable: keep for 7 days for paying users who opt in). Storage TTL is enforced by a cron, not just by trust.
7. **No dark patterns.** No "free trial that auto-charges without warning email 24h prior." Voicenotes' app-store reviews show this kills trust.
8. **Cost transparency for the user.** A user on PAYG sees their per-note minute cost in the UI. Builds trust and reduces support load.
9. **"Privacy by default" copy in marketing.** We don't train on user audio. Period.
10. **Don't ship features that aren't in the current Phase.** Scope creep is the indie founder's #1 killer. If it isn't in §13/14/15, it doesn't exist.

---

## 17. UX patterns — what to copy and what to avoid

### Copy from AudioPen
- Side-by-side transcript + summary view.
- Three-button intensity selector (verbatim / light / full).
- "Regenerate" button on every note.
- Tags + folders, but no nested folders (keeps UX simple).
- Onboarding that takes < 30 seconds before first recording.

### Copy from Voicenotes
- "Ask your notes" pattern (Phase 3) — but our take is multilingual.
- WhatsApp integration as a capture surface (Phase 3).

### Copy from Notion
- Slash-commands in the note editor (Phase 2).
- Block-based content model (Phase 2).

### Avoid (because users complained)
- AudioPen's distracting countdown timer during recording → ours is subtle, dismissable.
- AudioPen's frequent unexpected sign-outs → use Supabase persistent sessions properly.
- Voicenotes' "predatory" free-trial-to-paid conversion flow.
- Otter's meeting-bot-only model — we capture solo voice notes.
- Bubble.io / no-code stack → we're on Next.js for performance and flexibility.

---

## 18. Audio handling — implementation details

### Web (`MediaRecorder`)

```typescript
const recorder = new MediaRecorder(stream, {
  mimeType: 'audio/webm;codecs=opus',  // fallback: 'audio/mp4' on Safari
  audioBitsPerSecond: 64000             // 64 kbps mono is plenty for speech
});

recorder.ondataavailable = async (e) => {
  if (e.data.size > 0) {
    // Upload chunk to Supabase Storage via signed URL
    await uploadChunk(noteId, chunkIndex++, e.data);
  }
};

// Critical: timeslice ensures incremental uploads, survives tab close/sleep
recorder.start(5000);
```

### Known browser issues (pre-baked solutions)
- **Chrome on Android, screen lock**: can emit a single 15+MB chunk on resume. Implement `Blob.slice()` to break into ≤5MB pieces before upload (per AddPipe blog).
- **iOS Safari, PWA**: mic permission resets between sessions. Workaround: PWA install banner is fine for free users; ship Expo app early in Phase 2 for retention.
- **Firefox**: doesn't support `audio/mp4`. Fall back to `audio/webm`.
- **Safari < 14.1**: no `MediaRecorder`. Show "please update your browser" message.

### File upload path
- Files >25MB: split server-side via `ffmpeg-wasm` into ≤24MB chunks before sending to OpenAI Whisper.
- Files >100MB: reject on Free/Starter; allow on Pro with progress indicator.

### Storage lifecycle
- Audio stored at `audio/<user_id>/<note_id>/<chunk_index>.webm`.
- Daily Inngest cron deletes audio for notes older than 1 hour (Free), 7 days (Pro opt-in).
- Final concatenated audio kept only if user explicitly opts in.

---

## 19. LLM cleanup prompts (initial versions — iterate later)

### Verbatim prompt
```
You are a transcript cleaner. Apply ONLY these changes:
- Add punctuation, capitalization, and paragraph breaks.
- Remove filler words: "um", "uh", "like", "you know" (and their equivalents in {language}).
- Do NOT change vocabulary, do NOT rephrase, do NOT add or remove ideas.
- Output in the same language as the transcript: {language}.

Transcript:
{transcript}

Cleaned transcript:
```

### Light cleanup prompt
```
You are an editor. Lightly clean the following transcript while preserving the speaker's voice and vocabulary.
- Fix grammar and punctuation.
- Remove filler words and false starts.
- Keep the speaker's word choices, idioms, and sentence rhythm.
- Do NOT add new information.
- Output language: {language}.

Transcript:
{transcript}

Edited:
```

### Full rewrite prompt
```
You are a writing assistant. Rewrite the transcript as a clear, well-structured piece of writing.
- Preserve all ideas and the speaker's intent.
- Improve flow, clarity, and structure.
- Use paragraphs, lists, or headings where they help.
- Match the register: {register}  (default: neutral).
- Output language: {language}.

Transcript:
{transcript}

Rewritten:
```

### Title prompt (GPT-5 nano, $0.05/1M tokens)
```
Generate a 4-8 word title for this note. No quotes, no punctuation at the end.
Same language as the content: {language}.

Note:
{summary_or_transcript}

Title:
```

### "Write Like Me" prompt (Phase 2, Sonnet 4.6)
```
You are imitating a specific writer's voice. Here are 3-5 samples of their writing:

<samples>
{user_writing_samples}
</samples>

Now rewrite the following transcript in that exact voice — same vocabulary patterns, sentence length, idioms, formality level. Output language: {language}.

Transcript:
{transcript}

Rewritten in the user's voice:
```

All prompts live in `src/lib/llm/prompts/` as named TS exports. Never inline as strings inside route handlers.

---

## 20. Cost economics (recheck monthly — prices fall ~30%/yr)

### Per-note math (5-minute voice note ≈ 750 spoken words ≈ 1,000 input tokens + 600 output tokens)

| Component | Engine | Cost |
|---|---|---|
| STT (English/global) | gpt-4o-mini-transcribe | 5 × $0.003 = **$0.015** |
| STT (Indian language) | Sarvam Saaras v3 | (5/60) × $0.36 = **$0.030** |
| STT (premium) | ElevenLabs Scribe v2 | 5 × $0.0037 = **$0.019** |
| LLM cleanup | Claude Haiku 4.5 | (1,000 × $1 + 600 × $5) / 1M = **$0.004** |
| Title gen | GPT-5 nano | negligible (~$0.0001) |
| **Total per 5-min note (default route)** |  | **~$0.02** |
| Total per 5-min note (Indian language) |  | ~$0.034 |
| Total per 5-min note (premium accuracy) |  | ~$0.024 |

### Monthly cost ceilings
- A heavy Pro user generating 200 × 5-min notes/month = ~$4 STT+LLM. At $10/mo Pro, that's 60% gross margin.
- A free user maxing 30 min/mo = ~$0.10 cost. Acceptable signup-cost loss leader.
- A free-tier abuser running 100 burner accounts × 30 min = $10 — solved by email verification + IP rate limit.

### Hard cost guardrails (enforce in code)
- Per-user minute caps enforced server-side BEFORE calling STT.
- Daily company-wide spend cap of $20 in Phase 1 (raise as MRR grows). Inngest function checks daily total before executing transcription jobs; if exceeded, queues with delayed retry + alerts founder.
- Per-job timeout (10 min). Kill + refund the minute usage if STT hangs.

---

## 21. Environment variables (`.env.example`)

```env
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# LLMs
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
SARVAM_API_KEY=
ELEVENLABS_API_KEY=
GOOGLE_GEMINI_API_KEY=

# Payments
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_WEBHOOK_SECRET=

# Background jobs
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Observability
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
SENTRY_DSN=
SENTRY_AUTH_TOKEN=

# Email
RESEND_API_KEY=
FROM_EMAIL=hello@audionotes.app

# Feature flags / cost guardrails
DAILY_COST_CAP_USD=20
ENABLE_SARVAM=true
ENABLE_ELEVENLABS=false
```

---

## 22. Distribution playbook (post-MVP)

The product won't sell itself. Schedule these in parallel with development:

1. **Build in public on X / LinkedIn.** Daily/weekly progress posts. Tag relevant founders (Louis Pereira, Sarvam team, Indian indie hackers). Mirror Louis's blueprint, not just for inspiration but because it works.
2. **ProductHunt launch.** Schedule for a Tuesday or Wednesday. Coordinate hunters in advance. Indian time zones favor a US-morning launch (12:30 AM IST). Have demo video, GIFs, and FAQ ready a week prior.
3. **SEO long-tail content.** Target keywords:
   - "AudioPen alternative for Hindi"
   - "voice notes Tamil app"
   - "WhatsApp voice transcription Notion"
   - "voice to text app for doctors India"
   - "Whisper alternative multilingual"
   - "best voice journal app 2026"
4. **YouTube Shorts + Instagram Reels.** Bilingual demos in Hindi + English. Tamil/Telugu later.
5. **Communities to seed:** r/Notion, r/ObsidianMD, r/PKMS, r/India, r/IndiaInvestments, IndieHackers, AppSumo, Indian startup WhatsApp groups, X spaces.
6. **Affiliate program** at 30% recurring (Lemon Squeezy has it built-in).
7. **Vertical content pages**: "Voice notes for doctors," "Voice notes for lawyers," "Voice notes for journalists" — each with case study + sign-up CTA.
8. **Newsletter sponsorships** (after $3K MRR): Recommendo, The Sweet Setup, Ben's Bites.
9. **Influencer outreach**: 1 well-placed signal from a 50K+ Indian tech YouTuber (Beerbiceps tier is too big; aim for tier 2) can move the needle.
10. **No paid ads until $5K MRR.** Organic only — paid acquisition kills indie unit economics until product-market fit is locked.

---

## 23. Risks & mitigations

| Risk | Mitigation |
|---|---|
| OpenAI / Anthropic outage | Multi-provider fallback in `lib/llm/route.ts` and `lib/stt/route.ts`. Cache transcripts. Graceful "we're retrying" UI. |
| Free-tier abuse | Email verification, hCaptcha on signup, IP rate limit (10 signups/IP/day), hard server-side minute caps |
| Long-recording chunk bugs | `Blob.slice()` workaround; test on real Android (Chrome) and iOS Safari devices |
| iOS PWA mic permission reset | Ship Expo native app in Phase 2; until then, accept limitation |
| Indian-language WER variance | Route to Sarvam; allow user "Reprocess with different model" button; A/B test against Whisper for each language |
| Cleanup hallucinations on bad audio | Always preserve and display original transcript next to summary |
| Rising LLM costs | Default to Haiku 4.5 + GPT-5 nano for utility tasks; reserve Sonnet for paying users |
| GST/VAT compliance globally | Lemon Squeezy as MoR for non-IN; Razorpay invoice-compliant for IN |
| Copying AudioPen too closely | Lead with multilingual + verbatim + on-device — those are real differentiators, not the UI |
| DDoS / abuse | Cloudflare proxy from week 1; per-IP rate limits in middleware; Louis Pereira publicly disclosed AudioPen DDoS — plan for it |
| Stripe India unavailable | Razorpay handles 99% of Indian needs; Lemon Squeezy (or Dodo) covers global |
| Sarvam API instability | They're a younger company (founded 2023). Abstract behind interface so swap is one-file change. |
| HIPAA marketing premature | Don't mention HIPAA until BAAs are signed with every vendor in the chain |
| Solo founder burnout | Phased roadmap; ship MVP in 4 weeks not 4 months; outsource translations and design icons |

---

## 24. Working with me (Claude Code)

- **Always read CLAUDE.md** at the start of a session before any other action.
- **Ask before guessing** on: schema changes, pricing tiers, STT routing logic, LLM model choices, prompts.
- **Small reviewable changes.** One feature per branch. Don't rewrite three files when one will do.
- **Run `pnpm lint && pnpm typecheck`** before claiming a task is complete. Run `pnpm test` once tests exist.
- **Justify new dependencies.** State why before installing. Prefer the smaller / more-maintained option.
- **Update CLAUDE.md** when you change architecture, add an API, or finish a phase. Keep it accurate.
- **Prompts live in code, not strings.** All LLM prompts in `src/lib/llm/prompts/` as named exports.
- **Migrations not dashboard.** Schema changes via `supabase migration new <name>`; never edit the dashboard for non-throwaway data.
- **Cost-aware.** When suggesting a model, mention the cost class (cheap/medium/premium). Default cheap; escalate only for paying users.
- **Privacy-aware.** Never log full transcripts to Sentry/PostHog. Hash user IDs in non-essential telemetry.
- **No emoji-spam in commit messages or UI text** (founder preference).
- **Tone in UI copy:** warm, plain, confident. Avoid AI clichés ("supercharge," "unleash," "revolutionize").

---

## 25. Glossary

- **STT** — Speech-to-Text. The transcription step.
- **LLM cleanup** — The "rewriting" step after transcription. Three intensities: verbatim, light, full.
- **Sarvam Saaras v3** — Indian-language STT model from Sarvam AI (Bengaluru), specialized for 22 Indian languages and Hinglish/Tanglish code-switching.
- **WER** — Word Error Rate. Lower is better. Industry-standard STT accuracy metric.
- **MoR** — Merchant of Record. Lemon Squeezy / Paddle handle global tax compliance on the seller's behalf.
- **PPP** — Purchasing Power Parity. Why Indian Pro is ₹399 not ₹830.
- **BAA** — Business Associate Agreement. Required for HIPAA compliance.
- **RLS** — Row-Level Security. Supabase Postgres feature ensuring users only see their own rows.
- **Inngest** — Serverless background-job platform; our queue for transcription + cleanup pipelines.
- **Bharat-first** — design priority: Indian users and languages are not an afterthought, they're the primary first audience.
- **Phase 1/2/3** — see §13/14/15. Sacred. Don't ship Phase 2 features in Phase 1.

---

## 26. First-session prompt — paste this into Claude Code on day 1

> Read CLAUDE.md to understand the entire project. Then begin Phase 1 setup:
>
> 1. Initialize a Next.js 15 project with TypeScript, Tailwind, shadcn/ui, and pnpm.
> 2. Set up the folder structure described in §11.
> 3. Create `.env.example` per §21.
> 4. Wire up Supabase clients (browser + server + service-role) using `@supabase/ssr`.
> 5. Create the initial database migration with the schema in §12 (profiles, notes, usage, payment_events, RLS policies, indexes, audio storage bucket).
> 6. Build a minimal landing page at `/` with placeholder hero, pricing table reflecting §9, and FAQ. Mark sections as `TODO: copy v2`.
> 7. Build a placeholder authenticated `/notes` page that shows "no notes yet" and a "New Note" button (which is also a placeholder for now).
> 8. Add Google OAuth sign-in via Supabase Auth.
> 9. Wire up PostHog + Sentry stubs.
> 10. Commit incrementally with conventional-commit messages.
>
> Do NOT yet build the recording UI, audio upload, Inngest pipeline, or payments. Those are sessions 2–5.
>
> After each major step (1-3, 4-5, 6-7, 8, 9), pause and ask me to confirm before continuing.

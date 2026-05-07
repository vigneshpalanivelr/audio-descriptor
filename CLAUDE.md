@AGENTS.md

# QuillCast — Standing Instructions for Claude

## Project identity

- App name: **QuillCast** — do not rename unless the user explicitly asks.
- Single source of truth for the name: `src/config/app.ts`.
- Active dev branch: `claude/review-project-setup-dapqK`. All work goes here; never push to `main` directly.

## Committing

- Commit **after every meaningful unit of work** — a passing test, a fixed lint error, a new file.
- Never batch large amounts of unrelated changes into one commit.
- Commit message format: `type(scope): short description` (Conventional Commits).
  - Types: `feat`, `fix`, `chore`, `test`, `docs`, `security`, `refactor`.
- Always run `pnpm lint && pnpm typecheck` before committing.
- Always push immediately after committing: `git push -u origin claude/review-project-setup-dapqK`.

## CI / pipeline

- On every push, check PR #1 check-runs via the GitHub MCP (`mcp__github__pull_request_read` with `method: get_check_runs`, `pullNumber: 1`).
- If **any** check is failing, fix it before moving on to new features.
- Fix order: Lint/Format/Typecheck → Unit tests → Security tests → Dependency audit → E2E.
- The CI workflow is at `.github/workflows/ci.yml` — read it before diagnosing failures.
- E2E only installs **chromium** (`playwright install --with-deps chromium`); `Mobile Safari` is excluded from CI via `process.env.CI` guard in `playwright.config.ts`.

## Testing

- Unit/security tests live in `tests/unit/` and `tests/security/`.
- Coverage must remain at **100%** across all four metrics (lines, functions, branches, statements).
- Use `/* c8 ignore next */` or `/* c8 ignore start/stop */` only for genuinely unreachable branches.
- Every `beforeEach` in Vitest that imports a module under test must call **both** `vi.clearAllMocks()` and `vi.resetModules()`.
- Run `pnpm test:coverage` to verify before committing new source files.

## Code style

- No comments unless the WHY is non-obvious.
- No nested ternaries — extract a named helper function (`sonarjs/no-nested-conditional`).
- Use `Map` instead of plain `Record<string, T>` when the object is used for runtime key lookups (avoids `security/detect-object-injection`).
- Conditional spreads for `exactOptionalPropertyTypes`: `...(val ? { key: val } : {})`.
- Default exports for pino transports: `import createStream from "pino-rotating-file-stream"`.

## Management script

- `./manage.sh` is the single entry point for starting, stopping, restarting, and inspecting the server.
- Before starting (even on restart), it shows all config values redacted.
- Tell the user to run `./manage.sh help` if they ask how to operate the server.

## Session continuation

- At the start of each new session, read this file (`CLAUDE.md`) and `IMPLEMENTATION.md` to understand current phase and what's been built.
- Check CI status for PR #1 first thing — if failing, fix before anything else.
- `IMPLEMENTATION.md` is the single source of truth for architecture, progress, and production checklist. `PLAN.md` has been merged into it and deleted.

## Key file locations

| What                        | Path                                                   |
| --------------------------- | ------------------------------------------------------ |
| App config (name, URL)      | `src/config/app.ts`                                    |
| Environment template        | `.env.example`                                         |
| DB migration v1             | `supabase/migrations/20260501000000_init.sql`          |
| DB migration v2             | `supabase/migrations/20260502000000_note_versions.sql` |
| DB migration v3             | `supabase/migrations/20260503000000_pinned.sql`        |
| Auth proxy (Next.js 16)     | `src/proxy.ts`                                         |
| STT routing                 | `src/lib/stt/route.ts`                                 |
| LLM routing                 | `src/lib/llm/route.ts`                                 |
| Audit logger                | `src/lib/logger/audit.ts`                              |
| Structured logger           | `src/lib/logger/index.ts`                              |
| Usage limits                | `src/lib/usage/limits.ts`                              |
| Note CRUD API               | `src/app/api/notes/[id]/route.ts`                      |
| Audio download API          | `src/app/api/notes/[id]/audio/route.ts`                |
| Regenerate API              | `src/app/api/notes/[id]/regenerate/route.ts`           |
| Note detail UI              | `src/app/(app)/notes/[id]/NoteDetailClient.tsx`        |
| User menu component         | `src/components/UserMenu.tsx`                          |
| App layout (all auth pages) | `src/app/(app)/layout.tsx`                             |
| Admin dashboard             | `src/app/(admin)/admin/page.tsx`                       |
| CI workflow                 | `.github/workflows/ci.yml`                             |
| Management script           | `manage.sh`                                            |

## Critical known behaviours

- **Local Supabase data is ephemeral**: data lives in Docker volumes. If Docker Desktop
  restarts, volumes are pruned (`docker system prune -v`), or Docker recreates containers,
  **all local data is permanently lost**. For persistent storage use a remote Supabase
  project: set `NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co` in `.env.local` with
  the remote anon/service-role keys. `manage.sh` detects a non-localhost URL and skips
  local Docker automatically.
- **Remote Supabase migration workflow**: `supabase db push` only targets the local Docker
  instance. To push migrations to a remote project: set `SUPABASE_PROJECT_REF=<ref>` in
  `.env.local` (manage.sh will auto-link on start/stop), then run `./manage.sh db remote`
  (runs `supabase migration up`). The `is_pinned` migration `20260503000000_pinned.sql`
  must be applied to any remote project where the feature is used.
- **Auto supabase link**: when `SUPABASE_PROJECT_REF` is set in `.env.local` and the URL
  is remote, `manage.sh` automatically runs `supabase link --project-ref <ref>` during
  `start`, `stop`, and `restart` so the CLI always targets the correct remote project.
- **Google OAuth setup**: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`
  are NOT used by the app directly. Google OAuth is configured entirely in the Supabase
  Dashboard: Authentication → Providers → Google → enable → paste Client ID + Secret.
  The error `"Unsupported provider: provider is not enabled"` means this Dashboard step
  was not completed. The redirect URI to register in the Google Cloud Console is:
  `https://<project-ref>.supabase.co/auth/v1/callback`.
- **Inngest dev mode vs event key**: `INNGEST_EVENT_KEY` is required for **production**
  Inngest. For **local dev** with `npx inngest-cli@latest dev` running on :8288,
  `manage.sh` sets `INNGEST_DEV=1` — no event key is needed. The upload route checks
  both (`hasEventKey || isDevMode`) before sending to Inngest; if neither is set it falls
  back to `processNoteDirectly` (in-process, synchronous transcription).
- **GET /api/notes/[id] error handling**: non-PGRST116 database errors return 500
  (not 404). Previously any null data returned 404, masking schema errors — fixed to
  check `error.code` first.
- **Next.js 16** uses `src/proxy.ts` (not `middleware.ts`) with `export function proxy`.
  File was renamed; `export function middleware` no longer works.
- **`custom_prompt` column** on the `notes` table only exists after migration
  `20260502000000_note_versions.sql` is applied (`./manage.sh db push`).
  `NoteDetailClient` deliberately **does NOT** select `custom_prompt` from `notes`;
  it reads custom prompt history from the `note_versions` table instead.
- **Default intensity** is `"verbatim"` everywhere (Recorder UI + upload API).
  Previously it was `"light"` — do not revert this.
- **Audio retention**: 24 h from `ready_at`. The GET `/api/notes/[id]/audio` route
  lazily expires audio (removes from storage + nulls `audio_storage_path`) on first
  request after expiry.
- **`docker info` timeout**: all three checks in `manage.sh` use `timeout 5 docker info`
  so the script fails fast when Docker Desktop is closed (no 10-second hang).
- **`supabase start` in manage.sh** streams output via `tee` so progress is visible live.

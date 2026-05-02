@AGENTS.md

# QuillCast — Standing Instructions for Claude

## Project identity

- App name: **QuillCast** — do not rename unless the user explicitly asks.
- Single source of truth for the name: `src/config/app.ts`.
- Active dev branch: `claude/plan-mvp-naming-Y7eZq`. All work goes here; never push to `main` directly.

## Committing

- Commit **after every meaningful unit of work** — a passing test, a fixed lint error, a new file.
- Never batch large amounts of unrelated changes into one commit.
- Commit message format: `type(scope): short description` (Conventional Commits).
  - Types: `feat`, `fix`, `chore`, `test`, `docs`, `security`, `refactor`.
- Always run `pnpm lint && pnpm typecheck` before committing.
- Always push immediately after committing: `git push -u origin claude/plan-mvp-naming-Y7eZq`.

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
- The active plan is in `/root/.claude/plans/read-claude-md-http-claude-md-to-underst-zazzy-lighthouse.md`.
  Sessions follow the 5-session MVP plan. Check `IMPLEMENTATION.md` to see which sessions are complete.

## Key file locations

| What                   | Path                                          |
| ---------------------- | --------------------------------------------- |
| App config (name, URL) | `src/config/app.ts`                           |
| Environment template   | `.env.example`                                |
| DB migration           | `supabase/migrations/20260501000000_init.sql` |
| STT routing            | `src/lib/stt/route.ts`                        |
| LLM routing            | `src/lib/llm/route.ts`                        |
| Audit logger           | `src/lib/logger/audit.ts`                     |
| Structured logger      | `src/lib/logger/index.ts`                     |
| Usage limits           | `src/lib/usage/limits.ts`                     |
| Admin dashboard        | `src/app/(admin)/admin/page.tsx`              |
| CI workflow            | `.github/workflows/ci.yml`                    |
| Management script      | `manage.sh`                                   |

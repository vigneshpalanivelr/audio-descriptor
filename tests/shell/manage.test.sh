#!/usr/bin/env bash
# Unit tests for manage.sh
# Run:  bash tests/shell/manage.test.sh
# Exit: 0 = all pass, 1 = one or more failures

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# ─── Source manage.sh (BASH_SOURCE guard prevents execution) ──────────────────
# Temporarily suppress set -e while sourcing so global initialisers don't abort
set +e
# shellcheck disable=SC1091
source "${REPO_ROOT}/manage.sh"
set -e

# ─── Tiny test harness ────────────────────────────────────────────────────────
_PASS=0; _FAIL=0; _TOTAL=0
_CURRENT_SUITE=""

suite() { _CURRENT_SUITE="$1"; echo ""; echo "  ── ${_CURRENT_SUITE}"; }

_pass() { (( _PASS++ )); (( _TOTAL++ )); echo "    ✓  $1"; }
_fail() { (( _FAIL++ )); (( _TOTAL++ )); echo "    ✗  $1"; echo "       expected : $2"; echo "       got      : $3"; }

# Strip all ANSI escape codes from a string
strip_ansi() { printf "%s" "$1" | sed 's/\x1b\[[0-9;]*m//g'; }

assert_eq() {
  local desc="$1" got want
  got=$(strip_ansi "$2")
  want=$(strip_ansi "$3")
  if [[ "$got" == "$want" ]]; then _pass "$desc"
  else _fail "$desc" "$want" "$got"
  fi
}

assert_contains() {
  local desc="$1" needle want_present="${4:-true}"
  local haystack
  haystack=$(strip_ansi "$2")
  needle=$(strip_ansi "$3")
  if echo "$haystack" | grep -qF "$needle"; then
    [[ "$want_present" == "true" ]] && _pass "$desc" || _fail "$desc" "NOT to contain '${needle}'" "found it"
  else
    [[ "$want_present" == "true" ]] && _fail "$desc" "'${needle}'" "not found" || _pass "$desc"
  fi
}

assert_not_contains() {
  assert_contains "$1" "$2" "$3" "false"
}

assert_exit() {
  local desc="$1" want_code="$2"; shift 2
  local code=0
  "$@" >/dev/null 2>&1 || code=$?
  if [[ "$code" -eq "$want_code" ]]; then _pass "$desc"
  else _fail "$desc" "exit ${want_code}" "exit ${code}"
  fi
}

# ─── Tests ────────────────────────────────────────────────────────────────────

# ── redact() ─────────────────────────────────────────────────────────────────
suite "redact()"

out=$(redact "")
assert_contains "empty string → (not set)" "$out" "(not set)"

out=$(redact "short")
assert_contains "≤6 chars → ***" "$out" "***"
assert_not_contains "≤6 chars → no original text" "$out" "short"

out=$(redact "sk-1234567890abcdef")
assert_contains "long string → first 6 chars" "$out" "sk-123"
assert_contains "long string → trailing ***" "$out" "***"
assert_not_contains "long string → no tail chars" "$out" "7890abcdef"

out=$(redact "abcdef")
assert_contains "exactly 6 chars → ***" "$out" "***"

# ── flag_color() ─────────────────────────────────────────────────────────────
suite "flag_color()"

out=$(strip_ansi "$(flag_color "true")")
assert_eq "true → 'true'" "$out" "true"

out=$(strip_ansi "$(flag_color "false")")
assert_eq "false → 'false'" "$out" "false"

out=$(strip_ansi "$(flag_color "")")
assert_eq "empty → 'false'" "$out" "false"

out=$(strip_ansi "$(flag_color "TRUE")")
assert_eq "uppercase TRUE treated as false (strict match)" "$out" "false"

# ── colorize_output() ────────────────────────────────────────────────────────
suite "colorize_output()"

RED_CODE=$'\033[0;31m'; GREEN_CODE=$'\033[0;32m'; YELLOW_CODE=$'\033[0;33m'
DIM_CODE=$'\033[2m'; RST_CODE=$'\033[0m'

_colorize() { printf "%s\n" "$1" | colorize_output; }

# Lines with existing ANSI codes pass through unchanged
ansi_line="${RED_CODE}already coloured${RST_CODE}"
out=$(_colorize "$ansi_line")
assert_eq "pre-coloured line passes through unchanged" "$out" "${ansi_line}"

# Error pattern → red
for pat in "error: something" "Error occurred" "Build failed" "✗ test"; do
  out=$(_colorize "$pat")
  assert_contains "error pattern coloured red: '${pat}'" "$out" "${RED_CODE}"
done

# Warning pattern → yellow
for pat in "warn: low memory" "warning: deprecated" "⚠ caution"; do
  out=$(_colorize "$pat")
  assert_contains "warn pattern coloured yellow: '${pat}'" "$out" "${YELLOW_CODE}"
done

# Success pattern → green
for pat in "✓ all tests passed" "3 passed" "ready in 1.2s" "compiled" "success"; do
  out=$(_colorize "$pat")
  assert_contains "success pattern coloured green: '${pat}'" "$out" "${GREEN_CODE}"
done

# Plain line → dim
out=$(_colorize "just a regular line of text")
assert_contains "plain line → dim" "$out" "${DIM_CODE}"

# ── run_cmd() ────────────────────────────────────────────────────────────────
suite "run_cmd()"

out=$(run_cmd "Echo test" echo "hello world" 2>&1)
assert_contains "shows the command before running" "$out" "\$ echo hello world"
assert_contains "shows the label on success" "$out" "Echo test"
assert_contains "shows ✓ on success" "$out" "✓"

exit_code=0
run_cmd "False test" false > /dev/null 2>&1 || exit_code=$?
assert_eq "returns non-zero on failure" "$exit_code" "1"

out=$(run_cmd "False output" false 2>&1 || true)
assert_contains "shows ✗ on failure" "$out" "✗"
assert_contains "shows exit code on failure" "$out" "exit 1"

# ── cmd_status() ─────────────────────────────────────────────────────────────
suite "cmd_status()"

PID_FILE_ORIG="$PID_FILE"
PID_FILE=$(mktemp)

# No (empty) PID file → not running
echo "" > "$PID_FILE"
# cmd_status checks if file exists AND pid is alive; with empty pid kill -0 errors
out=$(cmd_status 2>&1 || true)
assert_contains "empty PID → not running message" "$out" "not running"

# Valid running PID
echo "$$" > "$PID_FILE"
out=$(cmd_status 2>&1)
assert_contains "valid PID → running message" "$out" "Running"
assert_contains "valid PID → shows URL" "$out" "http://localhost:3000"
assert_contains "valid PID → shows admin path" "$out" "/admin"

# Stale PID (non-existent process)
echo "999999999" > "$PID_FILE"
out=$(cmd_status 2>&1 || true)
assert_contains "stale PID → not running message" "$out" "not running"
assert_eq "stale PID file removed" "$(test -f "$PID_FILE" && echo exists || echo gone)" "gone"

PID_FILE="$PID_FILE_ORIG"
rm -f "$PID_FILE_ORIG"

# ── show_config() ────────────────────────────────────────────────────────────
suite "show_config()"

out=$(show_config 2>&1)
assert_contains "shows app section"        "$out" "App"
assert_contains "shows supabase section"   "$out" "Supabase"
assert_contains "shows LLM/STT section"    "$out" "LLM / STT APIs"
assert_contains "shows feature flags"      "$out" "Feature Flags"
assert_contains "shows payments section"   "$out" "Payments"
assert_contains "shows observability"      "$out" "Observability"
assert_contains "shows Inngest section"    "$out" "Inngest"

# Redacts secrets from .env.local
TMPENV=$(mktemp)
printf "ANTHROPIC_API_KEY=sk-ant-secret123456789\n" > "$TMPENV"
out=$(ANTHROPIC_API_KEY="sk-ant-secret123456789" show_config 2>&1)
assert_contains     "API key first 6 chars shown"  "$out" "sk-ant"
assert_not_contains "API key tail not shown"        "$out" "secret123456789"
rm -f "$TMPENV"

# Boolean feature flags rendered correctly
out=$(ENABLE_SARVAM=true show_config 2>&1)
out_plain=$(strip_ansi "$out")
# Should show "true" (not dim/false) for ENABLE_SARVAM
assert_contains "flag=true shows 'true'" "$out_plain" "true"

# ── cmd_admin() ──────────────────────────────────────────────────────────────
suite "cmd_admin()"

out=$(cmd_admin 2>&1)
assert_contains "shows admin URL"          "$out" "/admin"
assert_contains "shows Inngest UI URL"     "$out" "localhost:8288"
assert_contains "shows Supabase Studio"    "$out" "localhost:54323"
assert_contains "shows SQL snippet"        "$out" "update public.profiles"
assert_contains "mentions tier = admin"    "$out" "admin"

# ── cmd_help() ───────────────────────────────────────────────────────────────
suite "cmd_help()"

out=$(cmd_help 2>&1)
assert_contains "shows app name"     "$out" "QuillCast"
assert_contains "shows start cmd"    "$out" "start"
assert_contains "shows stop cmd"     "$out" "stop"
assert_contains "shows restart cmd"  "$out" "restart"
assert_contains "shows build cmd"    "$out" "build"
assert_contains "shows status cmd"   "$out" "status"
assert_contains "shows config cmd"   "$out" "config"
assert_contains "shows stats cmd"    "$out" "stats"
assert_contains "shows admin cmd"    "$out" "admin"
assert_contains "shows test cmd"     "$out" "test"
assert_contains "shows logs cmd"     "$out" "logs"

# ── CLI entrypoint (black-box) ───────────────────────────────────────────────
suite "CLI entrypoint"

MANAGE="${REPO_ROOT}/manage.sh"
assert_exit "help exits 0"   0 "$MANAGE" help
assert_exit "config exits 0" 0 "$MANAGE" config
assert_exit "status exits 0" 0 "$MANAGE" status
assert_exit "admin exits 0"  0 "$MANAGE" admin
assert_exit "--help exits 0" 0 "$MANAGE" --help
assert_exit "-h exits 0"     0 "$MANAGE" -h
assert_exit "unknown exits 1" 1 "$MANAGE" this-command-does-not-exist

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "  ────────────────────────────────────────"

if [[ $_FAIL -eq 0 ]]; then
  echo "  ✓  All ${_TOTAL} tests passed"
  exit 0
else
  echo "  ✗  ${_FAIL} of ${_TOTAL} tests failed  (${_PASS} passed)"
  exit 1
fi

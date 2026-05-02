#!/usr/bin/env bash
# QuillCast management script
# Usage: ./manage.sh [command] [options]

set -euo pipefail

# ─── Palette ($'...' embeds the real ESC byte so heredocs and printf work) ────
R=$'\033[0;31m'   # red
BR=$'\033[1;31m'  # bright red
G=$'\033[0;32m'   # green
BG=$'\033[1;32m'  # bright green
Y=$'\033[0;33m'   # amber / yellow
BY=$'\033[1;33m'  # bright amber
C=$'\033[0;36m'   # cyan
BC=$'\033[1;36m'  # bright cyan
BD=$'\033[1m'     # bold
DIM=$'\033[2m'    # dim
RST=$'\033[0m'    # reset

PID_FILE=".quillcast.pid"
LOG_FILE="logs/server.log"
APP_NAME="QuillCast"
APP_URL="${NEXT_PUBLIC_APP_URL:-http://localhost:3000}"
ADMIN_PATH="/admin"

# ─── Banner helpers ───────────────────────────────────────────────────────────
info()    { echo "  ${C}ℹ${RST}  $*"; }
success() { echo "  ${BG}✓${RST}  $*"; }
warn()    { echo "  ${BY}⚠${RST}  $*"; }
error()   { echo "  ${BR}✗${RST}  $*" >&2; }
_RULE="${DIM}────────────────────────────────────────────────────${RST}"
header()  {
  echo ""
  echo "  ${BD}${BC}${1}${RST}"
  echo "  ${_RULE}"
}
divider() { echo "  ${_RULE}"; }

# ─── Colorise a stream of command output ──────────────────────────────────────
# Lines that already carry ANSI codes pass through unchanged.
# Plain lines are coloured by content pattern.
colorize_output() {
  while IFS= read -r line || [[ -n "$line" ]]; do
    # Pass through lines that already have colour codes
    case "$line" in
      *$'\033['*)
        printf "%s\n" "$line"
        continue
        ;;
    esac

    if printf "%s" "$line" | grep -qiE '(^error[: ]| error[: ]|^Error|failed|failure|✗|✕| FAIL[ED]?$)'; then
      printf "${R}%s${RST}\n" "$line"
    elif printf "%s" "$line" | grep -qiE '(^warn[: ]| warn[: ]|warning[: ]|deprecated|⚠)'; then
      printf "${Y}%s${RST}\n" "$line"
    elif printf "%s" "$line" | grep -qiE '(✓|✔| pass(ed)?$| ok$|success|ready in|compiled|done\.|created)'; then
      printf "${G}%s${RST}\n" "$line"
    else
      printf "${DIM}%s${RST}\n" "$line"
    fi
  done
}

# ─── run_cmd: echo command → coloured output → ✓ / ✗ ────────────────────────
# Usage: run_cmd "label" cmd [args...]
run_cmd() {
  local label="$1"; shift

  echo ""
  echo "  ${DIM}\$${RST} ${BC}$*${RST}"
  divider

  # Capture the real exit code through the pipe via a temp fd
  local tmpfile
  tmpfile=$(mktemp)
  exec 3>"$tmpfile"

  set +e
  { "$@" 2>&1; printf "%d" $? >&3; } | colorize_output
  set -e

  exec 3>&-
  local code
  code=$(cat "$tmpfile")
  rm -f "$tmpfile"

  divider
  if [[ "$code" -eq 0 ]]; then
    echo "  ${BG}✓${RST}  ${BD}${label}${RST}"
  else
    echo "  ${BR}✗${RST}  ${BD}${label}${RST}  ${DIM}(exit ${code})${RST}"
    return "$code"
  fi
}

# ─── Spinner (braille dots) — writes to /dev/tty so it works inside pipes ────
_SPIN_PID=""
_SPIN_MSG=""

spin_start() {
  _SPIN_MSG="${1:-Working…}"
  local frames='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
  (
    local i=0
    local n=${#frames}
    while true; do
      printf "\r  ${C}${frames:$i:1}${RST}  ${_SPIN_MSG}   " > /dev/tty
      i=$(( (i + 1) % n ))
      sleep 0.08
    done
  ) &
  _SPIN_PID=$!
  disown "$_SPIN_PID" 2>/dev/null || true
}

spin_stop() {
  local result="${1:-ok}"   # ok | fail
  if [[ -n "$_SPIN_PID" ]]; then
    kill "$_SPIN_PID" 2>/dev/null || true
    wait "$_SPIN_PID" 2>/dev/null || true
    _SPIN_PID=""
    printf "\r%60s\r" "" > /dev/tty
  fi
  if [[ "$result" == "ok" ]]; then
    echo "  ${BG}●${RST}  ${_SPIN_MSG} — ${BG}done${RST}"
  else
    echo "  ${BR}●${RST}  ${_SPIN_MSG} — ${BR}failed${RST}"
  fi
}

# ─── Step progress counter ────────────────────────────────────────────────────
_STEP=0
_STEP_TOTAL=0

steps_init() { _STEP_TOTAL="$1"; _STEP=0; }

step_run() {
  # Usage: step_run "label" cmd [args...]
  (( _STEP++ ))
  local label="$1"; shift
  echo ""
  echo "  ${DIM}[${_STEP}/${_STEP_TOTAL}]${RST}  ${BD}${label}${RST}"
  run_cmd "$label" "$@"
}

# ─── Load .env.local ──────────────────────────────────────────────────────────
load_env() {
  if [[ -f ".env.local" ]]; then
    set -a
    # shellcheck disable=SC1091
    source <(grep -E '^[A-Z_][A-Z0-9_]*=.' .env.local | grep -v '^#') 2>/dev/null || true
    set +a
  fi
}

# ─── Redact: show first 6 chars + *** ─────────────────────────────────────────
redact() {
  local val="${1:-}"
  if   [[ -z "$val" ]];       then echo "${DIM}(not set)${RST}"
  elif [[ "${#val}" -le 6 ]]; then echo "${DIM}***${RST}"
  else                             echo "${G}${val:0:6}***${RST}"
  fi
}

# ─── flag_color: green for true, dim for false ────────────────────────────────
flag_color() {
  if [[ "${1:-false}" == "true" ]]; then
    echo "${BG}true${RST}"
  else
    echo "${DIM}false${RST}"
  fi
}

# ─── Config (redacted) ────────────────────────────────────────────────────────
show_config() {
  load_env
  header "⚙   Configuration — ${APP_NAME}"

  echo ""
  echo "  ${BD}App${RST}"
  printf "    ${DIM}%-36s${RST} %b\n" "NEXT_PUBLIC_APP_URL"     "${NEXT_PUBLIC_APP_URL:-http://localhost:3000}"
  printf "    ${DIM}%-36s${RST} %b\n" "NODE_ENV"                "${NODE_ENV:-development}"
  printf "    ${DIM}%-36s${RST} %b\n" "DAILY_COST_CAP_USD"      "${DAILY_COST_CAP_USD:-20}"

  echo ""
  echo "  ${BD}Supabase${RST}"
  printf "    ${DIM}%-36s${RST} %b\n" "NEXT_PUBLIC_SUPABASE_URL"     "${NEXT_PUBLIC_SUPABASE_URL:-(not set)}"
  printf "    ${DIM}%-36s${RST} %b\n" "NEXT_PUBLIC_SUPABASE_ANON_KEY" "$(redact "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}")"
  printf "    ${DIM}%-36s${RST} %b\n" "SUPABASE_SERVICE_ROLE_KEY"    "$(redact "${SUPABASE_SERVICE_ROLE_KEY:-}")"

  echo ""
  echo "  ${BD}LLM / STT APIs${RST}"
  printf "    ${DIM}%-36s${RST} %b\n" "ANTHROPIC_API_KEY"     "$(redact "${ANTHROPIC_API_KEY:-}")"
  printf "    ${DIM}%-36s${RST} %b\n" "OPENAI_API_KEY"        "$(redact "${OPENAI_API_KEY:-}")"
  printf "    ${DIM}%-36s${RST} %b\n" "SARVAM_API_KEY"        "$(redact "${SARVAM_API_KEY:-}")"
  printf "    ${DIM}%-36s${RST} %b\n" "ELEVENLABS_API_KEY"    "$(redact "${ELEVENLABS_API_KEY:-}")"
  printf "    ${DIM}%-36s${RST} %b\n" "GOOGLE_GEMINI_API_KEY" "$(redact "${GOOGLE_GEMINI_API_KEY:-}")"

  echo ""
  echo "  ${BD}Payments${RST}"
  printf "    ${DIM}%-36s${RST} %b\n" "RAZORPAY_KEY_ID"      "$(redact "${RAZORPAY_KEY_ID:-}")"
  printf "    ${DIM}%-36s${RST} %b\n" "RAZORPAY_KEY_SECRET"  "$(redact "${RAZORPAY_KEY_SECRET:-}")"
  printf "    ${DIM}%-36s${RST} %b\n" "LEMONSQUEEZY_API_KEY" "$(redact "${LEMONSQUEEZY_API_KEY:-}")"
  printf "    ${DIM}%-36s${RST} %b\n" "LEMONSQUEEZY_STORE_ID" "${LEMONSQUEEZY_STORE_ID:-(not set)}"

  echo ""
  echo "  ${BD}Feature Flags${RST}"
  printf "    ${DIM}%-36s${RST} %b\n" "ENABLE_SARVAM"       "$(flag_color "${ENABLE_SARVAM:-false}")"
  printf "    ${DIM}%-36s${RST} %b\n" "ENABLE_ELEVENLABS"   "$(flag_color "${ENABLE_ELEVENLABS:-false}")"
  printf "    ${DIM}%-36s${RST} %b\n" "ELEVENLABS_PREMIUM"  "$(flag_color "${ELEVENLABS_PREMIUM:-false}")"

  echo ""
  echo "  ${BD}Observability${RST}"
  printf "    ${DIM}%-36s${RST} %b\n" "SENTRY_DSN"              "$(redact "${SENTRY_DSN:-}")"
  printf "    ${DIM}%-36s${RST} %b\n" "NEXT_PUBLIC_POSTHOG_KEY" "$(redact "${NEXT_PUBLIC_POSTHOG_KEY:-}")"

  echo ""
  echo "  ${BD}Background Jobs (Inngest)${RST}"
  printf "    ${DIM}%-36s${RST} %b\n" "INNGEST_EVENT_KEY"  "$(redact "${INNGEST_EVENT_KEY:-}")"
  printf "    ${DIM}%-36s${RST} %b\n" "INNGEST_SIGNING_KEY" "$(redact "${INNGEST_SIGNING_KEY:-}")"
  echo ""
}

# ─── status ───────────────────────────────────────────────────────────────────
cmd_status() {
  header "📊  Server Status"
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      success "Running  ${DIM}(PID ${pid})${RST}"
      echo "  ${DIM}  URL   :${RST}  ${BC}${APP_URL}${RST}"
      echo "  ${DIM}  Admin :${RST}  ${BC}${APP_URL}${ADMIN_PATH}${RST}"
      echo "  ${DIM}  Log   :${RST}  ${DIM}${LOG_FILE}${RST}"
    else
      warn "PID file present but process ${pid} is not running — cleaning up."
      rm -f "$PID_FILE"
    fi
  else
    warn "Server is not running."
  fi
  echo ""
}

# ─── start ────────────────────────────────────────────────────────────────────
cmd_start() {
  local mode="${1:-dev}"
  show_config

  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      warn "Server already running (PID ${pid}). Use ${BD}restart${RST} to restart."
      return 0
    fi
    rm -f "$PID_FILE"
  fi

  mkdir -p logs

  if [[ "$mode" == "prod" ]]; then
    if [[ ! -d ".next" ]]; then
      info "No production build found — building first."
      run_cmd "Build" pnpm build
    fi
    echo ""
    echo "  ${DIM}\$${RST} ${BC}pnpm start  ${DIM}(background)${RST}"
    nohup pnpm start >"$LOG_FILE" 2>&1 &
  else
    echo ""
    echo "  ${DIM}\$${RST} ${BC}pnpm dev  ${DIM}(background)${RST}"
    nohup pnpm dev >"$LOG_FILE" 2>&1 &
  fi

  local pid=$!
  echo "$pid" > "$PID_FILE"

  local retries=30
  spin_start "Waiting for server at ${APP_URL}"
  local reached=false
  while [[ $retries -gt 0 ]]; do
    if curl -sf "${APP_URL}" -o /dev/null 2>/dev/null; then
      reached=true
      break
    fi
    sleep 0.5
    (( retries-- )) || true
  done

  if [[ "$reached" == "true" ]]; then
    spin_stop "ok"
    success "Server started  ${DIM}(PID ${pid})${RST}"
    echo "  ${DIM}  URL   :${RST}  ${BC}${APP_URL}${RST}"
    echo "  ${DIM}  Admin :${RST}  ${BC}${APP_URL}${ADMIN_PATH}${RST}"
    echo "  ${DIM}  Logs  :${RST}  ${DIM}./manage.sh logs${RST}"
    echo "  ${DIM}  Stop  :${RST}  ${DIM}./manage.sh stop${RST}"
  else
    spin_stop "fail"
    warn "Server did not respond within 15 s — check ${LOG_FILE}"
  fi
  echo ""
}

# ─── stop ─────────────────────────────────────────────────────────────────────
cmd_stop() {
  header "🛑  Stopping ${APP_NAME}"
  if [[ ! -f "$PID_FILE" ]]; then
    warn "No PID file — server may not be running."
    echo ""; return 0
  fi
  local pid
  pid=$(cat "$PID_FILE")
  if kill -0 "$pid" 2>/dev/null; then
    echo ""
  echo "  ${DIM}\$${RST} ${BC}kill ${pid}${RST}"
    kill "$pid"
    rm -f "$PID_FILE"
    success "Server stopped  ${DIM}(PID ${pid})${RST}"
  else
    warn "Process ${pid} not running — removing stale PID file."
    rm -f "$PID_FILE"
  fi
  echo ""
}

# ─── restart ──────────────────────────────────────────────────────────────────
cmd_restart() {
  local mode="${1:-dev}"
  header "🔄  Restarting ${APP_NAME}"
  cmd_stop
  cmd_start "$mode"
}

# ─── build ────────────────────────────────────────────────────────────────────
cmd_build() {
  header "🔨  Building ${APP_NAME}"
  show_config
  run_cmd "Production build" pnpm build
  echo ""
  success "Run ${BD}./manage.sh start prod${RST} to serve."
  echo ""
}

# ─── logs ─────────────────────────────────────────────────────────────────────
cmd_logs() {
  if [[ ! -f "$LOG_FILE" ]]; then
    warn "No log file at ${LOG_FILE}. Start the server first."; return 0
  fi
  info "Tailing ${LOG_FILE}  ${DIM}(Ctrl-C to stop)${RST}"
  echo ""
  tail -f "$LOG_FILE" | colorize_output
}

# ─── stats ────────────────────────────────────────────────────────────────────
cmd_stats() {
  header "📈  Application Stats"

  local version
  version=$(node -pe "require('./package.json').version" 2>/dev/null || echo "unknown")
  printf "  ${DIM}%-22s${RST} %s\n" "App version"  "$version"
  printf "  ${DIM}%-22s${RST} %b\n" "App URL"      "${BC}${APP_URL}${RST}"
  printf "  ${DIM}%-22s${RST} %b\n" "Admin URL"    "${BC}${APP_URL}${ADMIN_PATH}${RST}"
  printf "  ${DIM}%-22s${RST} %s\n" "Node"         "$(node -v 2>/dev/null || echo 'not found')"
  printf "  ${DIM}%-22s${RST} %s\n" "pnpm"         "$(pnpm -v 2>/dev/null || echo 'not found')"
  echo ""

  if [[ -d ".next" ]]; then
    local build_id build_time
    build_id=$(cat .next/BUILD_ID 2>/dev/null || echo "unknown")
    build_time=$(stat -c '%y' .next/BUILD_ID 2>/dev/null \
              || stat -f '%Sm' .next/BUILD_ID 2>/dev/null \
              || echo "unknown")
    printf "  ${DIM}%-22s${RST} %s\n" "Build ID"      "$build_id"
    printf "  ${DIM}%-22s${RST} %s\n" "Build time"    "$build_time"
  else
    printf "  ${DIM}%-22s${RST} %b\n" "Build" "${Y}none — run ./manage.sh build${RST}"
  fi
  echo ""

  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      printf "  ${DIM}%-22s${RST} %b\n" "Server" "${BG}running${RST} ${DIM}(PID ${pid})${RST}"
      if [[ -f "/proc/${pid}/status" ]]; then
        local mem
        mem=$(grep VmRSS "/proc/${pid}/status" 2>/dev/null | awk '{print $2, $3}' || echo "unknown")
        printf "  ${DIM}%-22s${RST} %s\n" "Memory (RSS)" "$mem"
      fi
    else
      printf "  ${DIM}%-22s${RST} %b\n" "Server" "${R}stopped (stale PID)${RST}"
      rm -f "$PID_FILE"
    fi
  else
    printf "  ${DIM}%-22s${RST} %b\n" "Server" "${DIM}stopped${RST}"
  fi
  echo ""

  echo "  ${BD}Last test run${RST}"
  run_cmd "Unit tests" pnpm test
}

# ─── admin info ───────────────────────────────────────────────────────────────
cmd_admin() {
  header "🔐  Admin Console"
  echo "  ${BD}URL${RST}  ${BC}${APP_URL}${ADMIN_PATH}${RST}"
  echo ""
  echo "  ${DIM}Access requires${RST}  profiles.tier = 'admin'  ${DIM}in Supabase.${RST}"
  echo "  ${DIM}Grant access:${RST}"
  echo ""
  echo "    ${DIM}update public.profiles${RST}"
  echo "    ${DIM}  set tier = 'admin'${RST}"
  echo "    ${DIM}  where id = '<your-user-uuid>';${RST}"
  echo ""
  echo "  ${BD}Dashboard shows${RST}"
  echo "  ${DIM}  •${RST}  User count and tier breakdown"
  echo "  ${DIM}  •${RST}  Audit log events (auth · payments · security)"
  echo "  ${DIM}  •${RST}  Per-user usage stats (IST timestamps)"
  echo ""
  echo "  ${BD}Local dev services${RST}"
  printf "  ${DIM}  %-20s${RST} %b\n" "Inngest UI"       "${BC}http://localhost:8288${RST}"
  printf "  ${DIM}  %-20s${RST} %b\n" "Supabase Studio"  "${BC}http://localhost:54323${RST}"
  echo ""
}

# ─── test ─────────────────────────────────────────────────────────────────────
cmd_test() {
  local suite="${1:-all}"
  header "🧪  Running Tests — ${suite}"
  case "$suite" in
    unit)     run_cmd "Unit tests"       pnpm test ;;
    coverage) run_cmd "Coverage"         pnpm test:coverage ;;
    security) run_cmd "Security tests"   pnpm test:security ;;
    e2e)      run_cmd "E2E tests"        pnpm test:e2e ;;
    all)
      steps_init 2
      step_run "Unit + coverage" pnpm test:coverage
      step_run "Security suite"  pnpm test:security
      echo ""
      success "All test suites passed"
      ;;
    *)
      error "Unknown suite '${suite}'.  Use: unit | coverage | security | e2e | all"
      exit 1
      ;;
  esac
  echo ""
}

# ─── help ─────────────────────────────────────────────────────────────────────
cmd_help() {
  header "🎙  ${APP_NAME} — manage.sh"
  cat <<EOF

  ${BD}Server${RST}
  ${DIM}  start [dev|prod]   ${RST}  Start server ${DIM}(default: dev)${RST}
  ${DIM}  stop               ${RST}  Stop the running server
  ${DIM}  restart [dev|prod] ${RST}  Stop → show config → start
  ${DIM}  build              ${RST}  Production build ${DIM}(shows config first)${RST}
  ${DIM}  status             ${RST}  PID, URL, admin link
  ${DIM}  logs               ${RST}  Tail ${LOG_FILE} with colour

  ${BD}Info${RST}
  ${DIM}  config             ${RST}  All env vars, secrets redacted
  ${DIM}  stats              ${RST}  Build ID, memory, last test run
  ${DIM}  admin              ${RST}  Admin URL + SQL + local dev services

  ${BD}Tests${RST}
  ${DIM}  test [suite]       ${RST}  unit | coverage | security | e2e | all ${DIM}(default: all)${RST}

  ${BD}Examples${RST}
  ${DIM}  ./manage.sh start            ${RST}  # dev server
  ${DIM}  ./manage.sh start prod       ${RST}  # serve production build
  ${DIM}  ./manage.sh restart          ${RST}  # restart dev (config shown first)
  ${DIM}  ./manage.sh test coverage    ${RST}  # coverage report
  ${DIM}  ./manage.sh config           ${RST}  # redacted env dump
  ${DIM}  ./manage.sh stats            ${RST}  # build + server + test summary
  ${DIM}  ./manage.sh admin            ${RST}  # console URL + access instructions

EOF
}

# ─── Entrypoint (guard allows sourcing for unit tests) ───────────────────────
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  COMMAND="${1:-help}"
  case "$COMMAND" in
    start)   cmd_start   "${2:-dev}" ;;
    stop)    cmd_stop ;;
    restart) cmd_restart "${2:-dev}" ;;
    build)   cmd_build ;;
    status)  cmd_status ;;
    logs)    cmd_logs ;;
    config)  show_config ;;
    stats)   cmd_stats ;;
    admin)   cmd_admin ;;
    test)    cmd_test "${2:-all}" ;;
    help|--help|-h) cmd_help ;;
    *)
      error "Unknown command: ${COMMAND}"
      cmd_help
      exit 1
      ;;
  esac
fi

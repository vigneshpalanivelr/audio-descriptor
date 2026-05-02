#!/usr/bin/env bash
# QuillCast management script
# Usage: ./manage.sh [command]
# Commands: start | stop | restart | build | status | config | stats | logs | admin | test | help

set -euo pipefail

# ─── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

# ─── Helpers ──────────────────────────────────────────────────────────────────
info()    { echo -e "${CYAN}[info]${RESET}  $*"; }
success() { echo -e "${GREEN}[ok]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[warn]${RESET}  $*"; }
error()   { echo -e "${RED}[error]${RESET} $*" >&2; }
header()  { echo -e "\n${BOLD}${CYAN}$*${RESET}"; echo "────────────────────────────────────────"; }

PID_FILE=".quillcast.pid"
LOG_FILE="logs/server.log"
APP_NAME="QuillCast"
APP_URL="${NEXT_PUBLIC_APP_URL:-http://localhost:3000}"
ADMIN_PATH="/admin"

# ─── Load .env.local if present ───────────────────────────────────────────────
load_env() {
  if [[ -f ".env.local" ]]; then
    # Export only VAR=value lines, skip comments and blanks
    set -a
    # shellcheck disable=SC1091
    source <(grep -E '^[A-Z_]+=.' .env.local | grep -v '^#')
    set +a
  fi
}

# ─── Redact a value — show first 6 chars then *** ─────────────────────────────
redact() {
  local val="${1:-}"
  if [[ -z "$val" ]]; then
    echo "(not set)"
  elif [[ "${#val}" -le 6 ]]; then
    echo "***"
  else
    echo "${val:0:6}***"
  fi
}

# ─── Print config (redacted) ──────────────────────────────────────────────────
show_config() {
  load_env
  header "⚙  Configuration (${APP_NAME})"

  echo -e "  ${BOLD}App${RESET}"
  printf "    %-35s %s\n" "NEXT_PUBLIC_APP_URL"      "${NEXT_PUBLIC_APP_URL:-http://localhost:3000}"
  printf "    %-35s %s\n" "NODE_ENV"                 "${NODE_ENV:-development}"
  printf "    %-35s %s\n" "DAILY_COST_CAP_USD"       "${DAILY_COST_CAP_USD:-20}"

  echo -e "\n  ${BOLD}Supabase${RESET}"
  printf "    %-35s %s\n" "NEXT_PUBLIC_SUPABASE_URL"  "${NEXT_PUBLIC_SUPABASE_URL:-(not set)}"
  printf "    %-35s %s\n" "NEXT_PUBLIC_SUPABASE_ANON_KEY" "$(redact "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}")"
  printf "    %-35s %s\n" "SUPABASE_SERVICE_ROLE_KEY" "$(redact "${SUPABASE_SERVICE_ROLE_KEY:-}")"

  echo -e "\n  ${BOLD}LLM / STT APIs${RESET}"
  printf "    %-35s %s\n" "ANTHROPIC_API_KEY"         "$(redact "${ANTHROPIC_API_KEY:-}")"
  printf "    %-35s %s\n" "OPENAI_API_KEY"            "$(redact "${OPENAI_API_KEY:-}")"
  printf "    %-35s %s\n" "SARVAM_API_KEY"            "$(redact "${SARVAM_API_KEY:-}")"
  printf "    %-35s %s\n" "ELEVENLABS_API_KEY"        "$(redact "${ELEVENLABS_API_KEY:-}")"
  printf "    %-35s %s\n" "GOOGLE_GEMINI_API_KEY"     "$(redact "${GOOGLE_GEMINI_API_KEY:-}")"

  echo -e "\n  ${BOLD}Payments${RESET}"
  printf "    %-35s %s\n" "RAZORPAY_KEY_ID"           "$(redact "${RAZORPAY_KEY_ID:-}")"
  printf "    %-35s %s\n" "RAZORPAY_KEY_SECRET"       "$(redact "${RAZORPAY_KEY_SECRET:-}")"
  printf "    %-35s %s\n" "LEMONSQUEEZY_API_KEY"      "$(redact "${LEMONSQUEEZY_API_KEY:-}")"
  printf "    %-35s %s\n" "LEMONSQUEEZY_STORE_ID"     "${LEMONSQUEEZY_STORE_ID:-(not set)}"

  echo -e "\n  ${BOLD}Feature Flags${RESET}"
  printf "    %-35s %s\n" "ENABLE_SARVAM"             "${ENABLE_SARVAM:-false}"
  printf "    %-35s %s\n" "ENABLE_ELEVENLABS"         "${ENABLE_ELEVENLABS:-false}"
  printf "    %-35s %s\n" "ELEVENLABS_PREMIUM"        "${ELEVENLABS_PREMIUM:-false}"

  echo -e "\n  ${BOLD}Observability${RESET}"
  printf "    %-35s %s\n" "SENTRY_DSN"                "$(redact "${SENTRY_DSN:-}")"
  printf "    %-35s %s\n" "NEXT_PUBLIC_POSTHOG_KEY"   "$(redact "${NEXT_PUBLIC_POSTHOG_KEY:-}")"

  echo -e "\n  ${BOLD}Background Jobs (Inngest)${RESET}"
  printf "    %-35s %s\n" "INNGEST_EVENT_KEY"         "$(redact "${INNGEST_EVENT_KEY:-}")"
  printf "    %-35s %s\n" "INNGEST_SIGNING_KEY"       "$(redact "${INNGEST_SIGNING_KEY:-}")"

  echo ""
}

# ─── Show server status ───────────────────────────────────────────────────────
cmd_status() {
  header "📊  Server Status"
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      success "Server is running  (PID ${pid})"
      echo    "    URL     : ${APP_URL}"
      echo    "    Admin   : ${APP_URL}${ADMIN_PATH}"
      echo    "    Log     : ${LOG_FILE}"
    else
      warn "PID file found but process ${pid} is not running — stale PID file."
      rm -f "$PID_FILE"
    fi
  else
    warn "Server is not running."
  fi
  echo ""
}

# ─── Start server ─────────────────────────────────────────────────────────────
cmd_start() {
  local mode="${1:-dev}"   # dev | prod
  show_config

  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      warn "Server is already running (PID ${pid}). Use 'restart' to restart."
      return 0
    fi
    rm -f "$PID_FILE"
  fi

  mkdir -p logs

  if [[ "$mode" == "prod" ]]; then
    if [[ ! -d ".next" ]]; then
      info "No production build found. Building first..."
      pnpm build
    fi
    info "Starting production server..."
    nohup pnpm start >"$LOG_FILE" 2>&1 &
  else
    info "Starting development server..."
    nohup pnpm dev >"$LOG_FILE" 2>&1 &
  fi

  local pid=$!
  echo "$pid" > "$PID_FILE"

  # Wait up to 15s for the server to become reachable
  local retries=30
  info "Waiting for server to be ready at ${APP_URL} ..."
  while [[ $retries -gt 0 ]]; do
    if curl -sf "${APP_URL}" -o /dev/null 2>/dev/null; then
      break
    fi
    sleep 0.5
    (( retries-- ))
  done

  if [[ $retries -eq 0 ]]; then
    warn "Server did not respond within 15 s. Check logs: ${LOG_FILE}"
  else
    success "Server started (PID ${pid})"
    echo    "    URL     : ${APP_URL}"
    echo    "    Admin   : ${APP_URL}${ADMIN_PATH}"
    echo    "    Logs    : ./manage.sh logs"
    echo    "    Stop    : ./manage.sh stop"
  fi
  echo ""
}

# ─── Stop server ──────────────────────────────────────────────────────────────
cmd_stop() {
  header "🛑  Stopping ${APP_NAME}"
  if [[ ! -f "$PID_FILE" ]]; then
    warn "No PID file found — server may not be running."
    return 0
  fi
  local pid
  pid=$(cat "$PID_FILE")
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    rm -f "$PID_FILE"
    success "Server stopped (PID ${pid})"
  else
    warn "Process ${pid} was not running. Removing stale PID file."
    rm -f "$PID_FILE"
  fi
  echo ""
}

# ─── Restart ──────────────────────────────────────────────────────────────────
cmd_restart() {
  local mode="${1:-dev}"
  header "🔄  Restarting ${APP_NAME}"
  cmd_stop
  cmd_start "$mode"
}

# ─── Build ────────────────────────────────────────────────────────────────────
cmd_build() {
  header "🔨  Building ${APP_NAME}"
  show_config
  pnpm build
  success "Build complete — run './manage.sh start prod' to serve it."
  echo ""
}

# ─── Tail logs ────────────────────────────────────────────────────────────────
cmd_logs() {
  if [[ ! -f "$LOG_FILE" ]]; then
    warn "No log file at ${LOG_FILE}. Start the server first."
    return 0
  fi
  info "Tailing ${LOG_FILE} (Ctrl-C to stop)"
  tail -f "$LOG_FILE"
}

# ─── Stats ────────────────────────────────────────────────────────────────────
cmd_stats() {
  header "📈  Application Stats"

  # Package info
  local version
  version=$(node -pe "require('./package.json').version" 2>/dev/null || echo "unknown")
  printf "  %-20s %s\n" "App version"  "$version"
  printf "  %-20s %s\n" "App URL"      "$APP_URL"
  printf "  %-20s %s\n" "Admin URL"    "${APP_URL}${ADMIN_PATH}"
  printf "  %-20s %s\n" "Node"         "$(node -v 2>/dev/null || echo 'not found')"
  printf "  %-20s %s\n" "pnpm"         "$(pnpm -v 2>/dev/null || echo 'not found')"
  echo ""

  # Build info
  if [[ -d ".next" ]]; then
    local build_time
    build_time=$(stat -c '%y' .next/BUILD_ID 2>/dev/null || stat -f '%Sm' .next/BUILD_ID 2>/dev/null || echo "unknown")
    local build_id
    build_id=$(cat .next/BUILD_ID 2>/dev/null || echo "unknown")
    printf "  %-20s %s\n" "Last build ID"  "$build_id"
    printf "  %-20s %s\n" "Last build at"  "$build_time"
  else
    printf "  %-20s %s\n" "Build" "(none — run './manage.sh build')"
  fi
  echo ""

  # Server process
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      printf "  %-20s %s\n" "Server PID"   "$pid"
      printf "  %-20s %s\n" "Server status" "running"
      # RSS memory on Linux
      if [[ -f "/proc/${pid}/status" ]]; then
        local mem
        mem=$(grep VmRSS "/proc/${pid}/status" 2>/dev/null | awk '{print $2, $3}' || echo "unknown")
        printf "  %-20s %s\n" "Memory (RSS)" "$mem"
      fi
    fi
  else
    printf "  %-20s %s\n" "Server status" "stopped"
  fi
  echo ""

  # Test results summary
  echo -e "  ${BOLD}Last test run${RESET}"
  if pnpm test --reporter=verbose 2>&1 | tail -5; then
    : # output already shown
  fi
  echo ""
}

# ─── Admin console info ───────────────────────────────────────────────────────
cmd_admin() {
  header "🔐  Admin Console"
  echo    "  URL       : ${APP_URL}${ADMIN_PATH}"
  echo    ""
  echo    "  Access requires your Supabase profile tier = 'admin'."
  echo    "  To grant yourself access, run this SQL in Supabase:"
  echo    ""
  echo    "    update public.profiles"
  echo    "      set tier = 'admin'"
  echo    "      where id = '<your-user-uuid>';"
  echo    ""
  echo    "  The dashboard shows:"
  echo    "    • Live user count and tier breakdown"
  echo    "    • Recent audit log events (auth, payments, security)"
  echo    "    • Per-user usage stats (IST timestamps)"
  echo    ""
  echo    "  Inngest dev UI (background jobs):"
  echo    "    http://localhost:8288"
  echo    ""
  echo    "  Supabase Studio (local):"
  echo    "    http://localhost:54323"
  echo    ""
}

# ─── Run tests ────────────────────────────────────────────────────────────────
cmd_test() {
  local suite="${1:-all}"
  header "🧪  Running Tests (${suite})"
  case "$suite" in
    unit)     pnpm test ;;
    coverage) pnpm test:coverage ;;
    security) pnpm test:security ;;
    e2e)      pnpm test:e2e ;;
    all)
      pnpm test:coverage
      pnpm test:security
      ;;
    *)
      error "Unknown test suite '${suite}'. Use: unit | coverage | security | e2e | all"
      exit 1
      ;;
  esac
  echo ""
}

# ─── Help ─────────────────────────────────────────────────────────────────────
cmd_help() {
  header "🎙  ${APP_NAME} — Management Script"
  cat <<'EOF'
  Usage: ./manage.sh [command] [options]

  Server
    start [dev|prod]    Start the server (default: dev mode)
    stop                Stop the running server
    restart [dev|prod]  Restart (shows config first)
    build               Production build (shows config first)
    status              Show server status and URL
    logs                Tail the server log file

  Configuration & Info
    config              Show current config values (secrets redacted)
    stats               Show runtime stats (version, build, memory, test summary)
    admin               Show admin console URL and access instructions

  Testing
    test [suite]        Run tests: unit | coverage | security | e2e | all (default: all)

  General
    help                Show this message

  Examples
    ./manage.sh start              # start dev server
    ./manage.sh start prod         # serve last production build
    ./manage.sh restart            # restart dev server (shows config first)
    ./manage.sh test coverage      # run unit tests with coverage
    ./manage.sh config             # print all env vars (redacted)
    ./manage.sh stats              # build ID, memory usage, last test run
    ./manage.sh admin              # admin console URL + access instructions

EOF
}

# ─── Entrypoint ───────────────────────────────────────────────────────────────
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

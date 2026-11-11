#!/usr/bin/env bash
# Deploys Doctor Tracker to Vercel as two projects: backend (Express Function) first, then frontend
# (Next.js). Runs all checks and tests first, verifies health afterwards, and never prints secrets.
#
# Usage:
#   ./deploy.sh check        Preflight only: tools, links, login, env var names, tests and builds
#   ./deploy.sh preview      Preview deployment of both apps (frontend preview → backend preview)
#   ./deploy.sh production   Production deployment (asks for explicit confirmation)
#   ./deploy.sh seed-admin   Create the first admin in a database you specify (prompts; nothing echoed)
#
# Optional environment:
#   VERCEL_BACKEND_PROJECT / VERCEL_FRONTEND_PROJECT   expected project names (default doctor-tracker-api / doctor-tracker-web)
#   VERCEL_SCOPE                                       team slug to deploy under
#   VERCEL_TOKEN                                       token for non-interactive use (CI)
#   VERCEL_BIN                                         path to the Vercel CLI (default: vercel)
#   PREVIEW_API_ALIAS / PREVIEW_WEB_ALIAS              stable *.vercel.app aliases for previews (see README)
#   PROTECTION_BYPASS_SECRET                           Vercel "Protection Bypass for Automation" secret, used only for health checks
#   DEPLOY_CONFIRM=production                          non-interactive production confirmation (CI only)

set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:-}"
BACKEND_PROJECT="${VERCEL_BACKEND_PROJECT:-doctor-tracker-api}"
FRONTEND_PROJECT="${VERCEL_FRONTEND_PROJECT:-doctor-tracker-web}"
VERCEL_BIN="${VERCEL_BIN:-vercel}"
TMP_DIR=""

usage() { sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'; }
step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
info() { printf '    %s\n' "$1"; }
warn() { printf '    \033[33mWarning:\033[0m %s\n' "$1" >&2; }
fail() { printf '\n\033[31mError:\033[0m %s\n' "$1" >&2; exit 1; }
cleanup() { if [ -n "$TMP_DIR" ]; then rm -rf "$TMP_DIR"; fi; }
trap cleanup EXIT

case "$MODE" in
  check|preview|production|seed-admin) ;;
  -h|--help|help) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac

TMP_DIR="$(mktemp -d)"
chmod 700 "$TMP_DIR"

# Vercel CLI wrapper: adds token/scope when provided. The token is passed as an argument because
# that is what the CLI documents; prefer a CI secret store and never echo it.
vc() {
  local extra=()
  if [ -n "${VERCEL_TOKEN:-}" ]; then extra+=(--token "$VERCEL_TOKEN"); fi
  if [ -n "${VERCEL_SCOPE:-}" ]; then extra+=(--scope "$VERCEL_SCOPE"); fi
  "$VERCEL_BIN" ${extra[@]+"${extra[@]}"} "$@"
}

# ---------------------------------------------------------------------------
# seed-admin: create the first production admin explicitly (never part of a deployment)
# ---------------------------------------------------------------------------
seed_admin() {
  step "Create an admin account (explicit, one-off)"
  info "Values are read without echo, are not saved, and local backend/.env is ignored for this run."
  test -t 0 || fail "seed-admin is interactive; run it from a terminal."
  local uri email password database answer
  printf '    MongoDB URI of the target database: '; read -r -s uri; printf '\n'
  printf '    Admin email: '; read -r email
  printf '    Admin password (12+ characters): '; read -r -s password; printf '\n'
  [ -n "$uri" ] && [ -n "$email" ] && [ -n "$password" ] || fail "All three values are required."
  database="$(SEED_URI="$uri" node -e 'try { console.log(decodeURIComponent(new URL(process.env.SEED_URI).pathname.slice(1)) || "(default)") } catch { console.log("(unparseable)") }')"
  printf '    This creates the admin only if it does not exist yet, in database "%s".\n' "$database"
  printf '    Type the database name to confirm: '; read -r answer
  [ "$answer" = "$database" ] || fail "Confirmation did not match; nothing was changed."
  # DOTENV_CONFIG_PATH=/dev/null stops dotenv from filling gaps with local development values.
  (cd "$ROOT/backend" && DOTENV_CONFIG_PATH=/dev/null NODE_ENV=production MONGODB_URI="$uri" ADMIN_EMAIL="$email" ADMIN_PASSWORD="$password" npm run --silent seed)
  info "Done. Do not store ADMIN_PASSWORD in the production Vercel project."
}

if [ "$MODE" = "seed-admin" ]; then
  command -v node >/dev/null 2>&1 || fail "Node.js is required."
  command -v npm >/dev/null 2>&1 || fail "npm is required."
  seed_admin
  exit 0
fi

# ---------------------------------------------------------------------------
# 1. Tools and repository layout
# ---------------------------------------------------------------------------
step "Checking tools"
command -v node >/dev/null 2>&1 || fail "Node.js is required."
command -v npm >/dev/null 2>&1 || fail "npm is required."
command -v curl >/dev/null 2>&1 || fail "curl is required."
command -v "$VERCEL_BIN" >/dev/null 2>&1 || fail "Vercel CLI not found. Install it with: npm install -g vercel   (or set VERCEL_BIN)"
info "node $(node -v), npm $(npm -v), vercel $("$VERCEL_BIN" --version 2>/dev/null | tail -1)"
test -d "$ROOT/backend" && test -d "$ROOT/frontend" || fail "backend/ and frontend/ must exist next to deploy.sh."

# ---------------------------------------------------------------------------
# 2. Project links: one Vercel project per directory, never the same project twice
# ---------------------------------------------------------------------------
step "Checking Vercel project links"
for app in backend frontend; do
  test -f "$ROOT/$app/.vercel/project.json" || fail "$app/ is not linked. Run: vercel link --cwd $app --project $( [ "$app" = backend ] && echo "$BACKEND_PROJECT" || echo "$FRONTEND_PROJECT" )"
done
node - "$ROOT" "$BACKEND_PROJECT" "$FRONTEND_PROJECT" <<'NODE' || exit 1
const fs = require("fs");
const [root, expectedBackend, expectedFrontend] = process.argv.slice(2);
const read = (app) => JSON.parse(fs.readFileSync(`${root}/${app}/.vercel/project.json`, "utf8"));
const backend = read("backend"), frontend = read("frontend");
const problems = [];
if (!backend.projectId || !frontend.projectId) problems.push("a project.json is missing projectId; re-run vercel link");
if (backend.projectId === frontend.projectId) problems.push("backend/ and frontend/ are linked to the SAME Vercel project");
for (const [app, link, expected] of [["backend", backend, expectedBackend], ["frontend", frontend, expectedFrontend]]) {
  if (link.projectName && link.projectName !== expected) problems.push(`${app}/ is linked to "${link.projectName}", expected "${expected}" (set VERCEL_${app.toUpperCase()}_PROJECT if intentional)`);
}
if (problems.length) { for (const p of problems) console.error(`Error: ${p}`); process.exit(1); }
console.log(`    backend  -> ${backend.projectName ?? backend.projectId}`);
console.log(`    frontend -> ${frontend.projectName ?? frontend.projectId}`);
NODE

step "Checking Vercel login"
vc whoami >/dev/null 2>&1 || fail "Not logged in to Vercel. Run: vercel login   (or set VERCEL_TOKEN)"
info "Authenticated."

# ---------------------------------------------------------------------------
# 3. Environment variable NAMES in Vercel (values are never displayed or read into the script)
# ---------------------------------------------------------------------------
TARGET="production"; [ "$MODE" = "preview" ] && TARGET="preview"
step "Checking $TARGET environment variables in Vercel (names only)"
has_var() { grep -Eq "(^|[[:space:]])$1([[:space:]]|$)" "$2"; }
vc env list --environment "$TARGET" --cwd "$ROOT/backend" >"$TMP_DIR/backend-env" 2>&1 || fail "Could not list backend environment variables (vercel env list)."
vc env list --environment "$TARGET" --cwd "$ROOT/frontend" >"$TMP_DIR/frontend-env" 2>&1 || fail "Could not list frontend environment variables (vercel env list)."
missing=""
for name in MONGODB_URI JWT_SECRET CORS_ORIGIN; do has_var "$name" "$TMP_DIR/backend-env" || missing="$missing backend:$name"; done
if [ "$TARGET" = "production" ]; then has_var API_PROXY_TARGET "$TMP_DIR/frontend-env" || missing="$missing frontend:API_PROXY_TARGET"; fi
[ -z "$missing" ] || fail "Missing $TARGET variables in Vercel:$missing  (add with: vercel env add NAME --environment $TARGET --cwd <app>)"
has_var JWT_EXPIRES_IN "$TMP_DIR/backend-env" || warn "backend JWT_EXPIRES_IN not set; the default (1d) will be used."
for name in ALLOW_DEV_SEED SEED_REFERENCE_DATE ADMIN_PASSWORD; do
  if has_var "$name" "$TMP_DIR/backend-env"; then
    if [ "$TARGET" = "production" ] && [ "$name" = "ALLOW_DEV_SEED" ]; then fail "ALLOW_DEV_SEED must not exist in the production backend environment."; fi
    warn "backend $TARGET has $name; remove it unless you are deliberately seeding."
  fi
done
info "Required variable names are present."
rm -f "$TMP_DIR/backend-env" "$TMP_DIR/frontend-env"

# ---------------------------------------------------------------------------
# 4. Source state
# ---------------------------------------------------------------------------
step "Checking working tree"
if [ -n "$(git -C "$ROOT" status --porcelain 2>/dev/null)" ]; then
  warn "Uncommitted changes: CLI deployments upload your LOCAL files, including uncommitted ones."
  git -C "$ROOT" status --short | sed 's/^/      /' | head -15
else
  info "Clean ($(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo "not a git repository"))."
fi

# ---------------------------------------------------------------------------
# 5. Validation: stop on the first failure
# ---------------------------------------------------------------------------
run_check() { step "$1"; shift; (cd "$ROOT" && "$@") || fail "Validation failed: $*"; }
run_check "Backend: type check" npm run --silent typecheck --prefix backend
run_check "Backend: tests"      npm test --silent --prefix backend
run_check "Backend: build"      npm run --silent build --prefix backend
run_check "Frontend: lint"      npm run --silent lint --prefix frontend
run_check "Frontend: tests"     npm test --silent --prefix frontend
run_check "Frontend: build"     npm run --silent build --prefix frontend

if [ "$MODE" = "check" ]; then
  step "Preflight passed. Nothing was deployed."
  exit 0
fi

# ---------------------------------------------------------------------------
# 6. Production confirmation
# ---------------------------------------------------------------------------
if [ "$MODE" = "production" ]; then
  step "Production deployment"
  if [ "${DEPLOY_CONFIRM:-}" = "production" ]; then
    info "Confirmed via DEPLOY_CONFIRM=production."
  else
    test -t 0 || fail "Production needs confirmation. Run interactively, or set DEPLOY_CONFIRM=production in CI."
    printf '    This deploys %s and %s to PRODUCTION.\n    Type "deploy production" to continue: ' "$BACKEND_PROJECT" "$FRONTEND_PROJECT"
    read -r answer
    [ "$answer" = "deploy production" ] || fail "Not confirmed; nothing was deployed."
  fi
fi

# ---------------------------------------------------------------------------
# Helpers: deploy, URL extraction, health checks
# ---------------------------------------------------------------------------
# Deploys one app and prints its deployment URL. `--json` makes the output machine-readable
# (the CLI prints JSON when not attached to a terminal anyway).
deploy_app() {
  local app="$1"; shift
  local out="$TMP_DIR/deploy-$app.json"
  if ! vc deploy --cwd "$ROOT/$app" --yes --json "$@" >"$out"; then
    fail "Vercel deployment of $app failed (see the CLI output above)."
  fi
  node - "$out" <<'NODE'
const fs = require("fs");
const raw = fs.readFileSync(process.argv[2], "utf8");
let url;
try {
  const json = JSON.parse(raw);
  url = json.url ?? json.deployment?.url ?? json.deploymentUrl;
} catch { /* fall through to text search */ }
url ??= (raw.match(/https?:\/\/[a-z0-9.-]+\.vercel\.app/i) ?? [])[0];
if (!url) { console.error("Error: could not find the deployment URL in the Vercel CLI output."); process.exit(1); }
console.log(url.startsWith("http") ? url : `https://${url}`);
NODE
}

# GETs a URL with retries. Prints "<status> <body>". Adds the protection bypass header if provided.
http_get() {
  local url="$1" attempt=1 status=""
  local header=()
  if [ -n "${PROTECTION_BYPASS_SECRET:-}" ]; then header=(-H "x-vercel-protection-bypass: $PROTECTION_BYPASS_SECRET"); fi
  while [ "$attempt" -le 6 ]; do
    status="$(curl -sS -o "$TMP_DIR/body" -w '%{http_code}' --max-time 20 ${header[@]+"${header[@]}"} "$url" 2>/dev/null || true)"
    if [ "$status" = "200" ] || [ "$status" = "401" ] || [ "$status" = "403" ] || [ "$status" = "404" ]; then break; fi
    sleep 5; attempt=$((attempt + 1))
  done
  printf '%s %s' "${status:-000}" "$(head -c 300 "$TMP_DIR/body" 2>/dev/null | tr -d '\n')"
}

# Verifies {status:"ok"} and that the backend reports the expected Vercel environment.
check_health() {
  local label="$1" url="$2" expected_env="$3" result status body
  result="$(http_get "$url")"; status="${result%% *}"; body="${result#* }"
  if [ "$status" = "401" ] || [ "$status" = "403" ]; then
    if printf '%s' "$body" | grep -qiE "vercel|authentication required|<html"; then
      fail "$label is behind Vercel Deployment Protection ($status). The frontend proxy cannot reach a protected backend: disable Deployment Protection for the backend project's previews (the API has its own authentication), or set PROTECTION_BYPASS_SECRET for this check."
    fi
  fi
  [ "$status" = "200" ] || fail "$label health check failed: HTTP $status at $url"
  printf '%s' "$body" | grep -q '"status":"ok"' || fail "$label health check returned an unexpected body."
  if ! printf '%s' "$body" | grep -q "\"environment\":\"$expected_env\""; then
    fail "$label is not a $expected_env backend ($(printf '%s' "$body" | grep -oE '"environment":"[^"]*"')). Refusing to continue: a $expected_env frontend must not use another environment's data."
  fi
  info "$label healthy ($expected_env): $url"
}

# ---------------------------------------------------------------------------
# 7. Deploy backend first
# ---------------------------------------------------------------------------
if [ "$MODE" = "production" ]; then
  step "Deploying backend ($BACKEND_PROJECT) to production"
  BACKEND_URL="$(deploy_app backend --prod)"
else
  step "Deploying backend ($BACKEND_PROJECT) preview"
  BACKEND_URL="$(deploy_app backend)"
fi
info "Backend deployment: $BACKEND_URL"
BACKEND_TARGET="$BACKEND_URL"
if [ "$MODE" = "preview" ] && [ -n "${PREVIEW_API_ALIAS:-}" ]; then
  vc alias set "$BACKEND_URL" "$PREVIEW_API_ALIAS" >/dev/null || fail "Could not alias the backend preview to $PREVIEW_API_ALIAS."
  BACKEND_TARGET="https://$PREVIEW_API_ALIAS"
  info "Stable preview alias: $BACKEND_TARGET"
fi
step "Checking backend health"
check_health "Backend" "$BACKEND_URL/health" "$TARGET"

# ---------------------------------------------------------------------------
# 8. Deploy frontend after the backend is healthy
# ---------------------------------------------------------------------------
if [ "$MODE" = "production" ]; then
  # Production uses API_PROXY_TARGET from the frontend project's Production environment (the
  # backend's stable production domain), so a backend rollback/promotion is picked up as-is.
  step "Deploying frontend ($FRONTEND_PROJECT) to production"
  FRONTEND_URL="$(deploy_app frontend --prod)"
else
  # Rewrites are resolved at build time, so the preview build is pinned to the backend PREVIEW.
  step "Deploying frontend ($FRONTEND_PROJECT) preview → $BACKEND_TARGET"
  FRONTEND_URL="$(deploy_app frontend --build-env "API_PROXY_TARGET=$BACKEND_TARGET" --env "API_PROXY_TARGET=$BACKEND_TARGET")"
fi
info "Frontend deployment: $FRONTEND_URL"
FRONTEND_PUBLIC="$FRONTEND_URL"
if [ "$MODE" = "preview" ] && [ -n "${PREVIEW_WEB_ALIAS:-}" ]; then
  vc alias set "$FRONTEND_URL" "$PREVIEW_WEB_ALIAS" >/dev/null || fail "Could not alias the frontend preview to $PREVIEW_WEB_ALIAS."
  FRONTEND_PUBLIC="https://$PREVIEW_WEB_ALIAS"
  info "Stable preview alias: $FRONTEND_PUBLIC"
fi

# Verify the exact deployment just created (aliases only add a name to it).
step "Checking frontend → backend proxy"
proxy_result="$(http_get "$FRONTEND_URL/api/health")"
proxy_status="${proxy_result%% *}"
if [ "$proxy_status" = "401" ] || [ "$proxy_status" = "403" ]; then
  warn "The frontend is behind Vercel Deployment Protection ($proxy_status); open $FRONTEND_PUBLIC in a signed-in browser to verify, or set PROTECTION_BYPASS_SECRET."
else
  check_health "Frontend proxy" "$FRONTEND_URL/api/health" "$TARGET"
fi

# ---------------------------------------------------------------------------
# 9. Summary
# ---------------------------------------------------------------------------
step "Deployment complete ($MODE)"
info "Backend:  $BACKEND_URL"
info "Frontend: $FRONTEND_URL"
if [ "$MODE" = "preview" ]; then
  if [ -n "${PREVIEW_WEB_ALIAS:-}" ]; then
    info "Sign in at https://$PREVIEW_WEB_ALIAS (requires backend Preview CORS_ORIGIN=https://$PREVIEW_WEB_ALIAS)."
  else
    warn "Without PREVIEW_WEB_ALIAS, login on this preview needs the backend Preview CORS_ORIGIN to include $FRONTEND_URL."
  fi
fi
info "No database seeding was performed."

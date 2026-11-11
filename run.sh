#!/usr/bin/env bash
# Local development launcher: validates configuration, starts the backend and frontend, and stops
# both cleanly on Ctrl+C, SIGTERM, or when either one exits. Works with bash 3.2+ (macOS) and Linux.
#
# Optional overrides: BACKEND_PORT (default 5000), FRONTEND_PORT (default 3000),
# ALLOW_PRODUCTION_DATABASE=true (only to deliberately bypass the production-database guard).

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_PORT="${BACKEND_PORT:-5000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
BACKEND_PID=""
FRONTEND_PID=""
STOPPING=0

fail() {
  echo "Error: $1" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "Node.js is required."
command -v npm >/dev/null 2>&1 || fail "npm is required."

test -d "$PROJECT_ROOT/backend" || fail "backend/ directory is missing."
test -d "$PROJECT_ROOT/frontend" || fail "frontend/ directory is missing."
test -f "$PROJECT_ROOT/backend/.env" || fail "backend/.env is missing."
test -f "$PROJECT_ROOT/frontend/.env.local" || fail "frontend/.env.local is missing."

# Validate configuration without ever printing secret values.
node - "$PROJECT_ROOT" "${ALLOW_PRODUCTION_DATABASE:-}" <<'NODE'
const fs = require("fs");
const path = require("path");

function readEnvironment(file) {
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator > 0) values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

const [root, allowProduction] = process.argv.slice(2);
const checks = [
  [path.join(root, "backend/.env"), ["MONGODB_URI", "JWT_SECRET", "CORS_ORIGIN"]],
  [path.join(root, "frontend/.env.local"), ["API_PROXY_TARGET"]],
];

for (const [file, required] of checks) {
  const environment = readEnvironment(file);
  const missing = required.filter((name) => !environment[name]);
  if (missing.length) {
    console.error(`Error: ${path.relative(root, file)} is missing required variables: ${missing.join(", ")}`);
    process.exit(1);
  }
}

const backend = readEnvironment(path.join(root, "backend/.env"));
if (backend.JWT_SECRET.length < 32) {
  console.error("Error: backend/.env JWT_SECRET must contain at least 32 characters.");
  process.exit(1);
}

// Guard against running the local dev servers against production data.
let database = "(default)";
try { database = decodeURIComponent(new URL(backend.MONGODB_URI).pathname.replace(/^\//, "")) || "(default)"; } catch { /* reported by the backend */ }
const looksProduction = backend.NODE_ENV === "production" || /prod/i.test(database);
if (looksProduction && allowProduction !== "true") {
  console.error(`Error: backend/.env points at a production configuration (NODE_ENV=${backend.NODE_ENV || "unset"}, database "${database}").`);
  console.error("Use a development database locally, or set ALLOW_PRODUCTION_DATABASE=true to override deliberately.");
  process.exit(1);
}

console.log("Environment configuration: valid");
console.log(`Database: ${database}`); // the name only — never the connection string
NODE

# Fail early with a clear message instead of a crash when a port is taken.
node - "$BACKEND_PORT" "$FRONTEND_PORT" <<'NODE'
const net = require("net");
const ports = process.argv.slice(2).map(Number);
Promise.all(ports.map((port) => new Promise((resolve) => {
  const server = net.createServer().once("error", () => resolve(port)).once("listening", () => server.close(() => resolve(null))).listen(port);
}))).then((busy) => {
  const taken = busy.filter(Boolean);
  if (taken.length) {
    console.error(`Error: port ${taken.join(" and ")} already in use. Stop the other process or set BACKEND_PORT/FRONTEND_PORT.`);
    process.exit(1);
  }
});
NODE

install_if_needed() {
  app_dir="$1"
  if ! test -d "$app_dir/node_modules" || ! (cd "$app_dir" && npm ls --depth=0 >/dev/null 2>&1); then
    echo "Installing dependencies in ${app_dir#"$PROJECT_ROOT"/}/..."
    (cd "$app_dir" && npm install)
  fi
}

install_if_needed "$PROJECT_ROOT/backend"
install_if_needed "$PROJECT_ROOT/frontend"

# Each service runs in its own process group (job control), so stopping a service signals the
# whole group at once: npm, the shell, and watchers such as tsx/next cannot respawn orphans.
group_alive() { test -n "$1" && kill -0 -- "-$1" 2>/dev/null; }

stop_group() {
  test -n "$1" || return 0
  kill -TERM -- "-$1" 2>/dev/null || true
}

cleanup() {
  test "$STOPPING" -eq 0 || return 0
  STOPPING=1
  trap - INT TERM EXIT
  echo
  echo "Stopping Doctor Tracker services..."
  stop_group "$BACKEND_PID"
  stop_group "$FRONTEND_PID"
  attempts=0
  while { group_alive "$BACKEND_PID" || group_alive "$FRONTEND_PID"; } && test "$attempts" -lt 50; do
    sleep 0.1
    attempts=$((attempts + 1))
  done
  # Anything still running after 5 seconds is force-stopped.
  if group_alive "$BACKEND_PID"; then kill -KILL -- "-$BACKEND_PID" 2>/dev/null || true; fi
  if group_alive "$FRONTEND_PID"; then kill -KILL -- "-$FRONTEND_PID" 2>/dev/null || true; fi
  wait 2>/dev/null || true
  echo "Stopped."
}

on_signal() {
  cleanup
  exit "$1"
}

trap 'on_signal 130' INT
trap 'on_signal 143' TERM
trap cleanup EXIT

echo "Starting backend:  http://localhost:$BACKEND_PORT"
echo "Starting frontend: http://localhost:$FRONTEND_PORT"
echo "Health endpoint:   http://localhost:$BACKEND_PORT/health"
echo "Press Ctrl+C to stop both services."

# Job control gives each background job its own process group. Services read stdin from /dev/null
# so a watcher never blocks on terminal input from a background group.
set -m
(cd "$PROJECT_ROOT/backend" && PORT="$BACKEND_PORT" exec npm run dev) </dev/null &
BACKEND_PID=$!
(cd "$PROJECT_ROOT/frontend" && exec npm run dev -- --port "$FRONTEND_PORT") </dev/null &
FRONTEND_PID=$!
set +m

while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
  sleep 1
done

if kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo "Frontend exited unexpectedly; stopping backend." >&2
else
  echo "Backend exited unexpectedly; stopping frontend." >&2
fi
exit 1

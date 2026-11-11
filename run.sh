#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
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

node - "$PROJECT_ROOT" <<'NODE'
const fs = require("fs");
const path = require("path");

function readEnvironment(file) {
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator > 0) values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return values;
}

const root = process.argv[2];
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

console.log("Environment configuration: valid");
NODE

install_if_needed() {
  app_dir="$1"
  if ! test -d "$app_dir/node_modules" || ! (cd "$app_dir" && npm ls --depth=0 >/dev/null 2>&1); then
    echo "Installing dependencies in ${app_dir#$PROJECT_ROOT/}/..."
    (cd "$app_dir" && npm install)
  fi
}

install_if_needed "$PROJECT_ROOT/backend"
install_if_needed "$PROJECT_ROOT/frontend"

terminate_tree() {
  target_pid="$1"
  test -n "$target_pid" || return 0
  child_pids="$(pgrep -P "$target_pid" 2>/dev/null || true)"
  for child_pid in $child_pids; do
    terminate_tree "$child_pid"
  done
  kill -TERM "$target_pid" 2>/dev/null || true
}

cleanup() {
  test "$STOPPING" -eq 0 || return 0
  STOPPING=1
  trap - INT TERM EXIT
  echo
  echo "Stopping Doctor Tracker services..."
  terminate_tree "$BACKEND_PID"
  terminate_tree "$FRONTEND_PID"
  cleanup_attempts=0
  while { kill -0 "$BACKEND_PID" 2>/dev/null || kill -0 "$FRONTEND_PID" 2>/dev/null; } && test "$cleanup_attempts" -lt 20; do
    sleep 0.1
    cleanup_attempts=$((cleanup_attempts + 1))
  done
  kill -KILL "$BACKEND_PID" 2>/dev/null || true
  kill -KILL "$FRONTEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" 2>/dev/null || true
  wait "$FRONTEND_PID" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

echo "Starting backend:  http://localhost:5000"
echo "Starting frontend: http://localhost:3000"
echo "Health endpoint:  http://localhost:5000/health"
echo "Press Ctrl+C to stop both services."

(cd "$PROJECT_ROOT/backend" && exec npm run dev) &
BACKEND_PID=$!
(cd "$PROJECT_ROOT/frontend" && exec npm run dev) &
FRONTEND_PID=$!

while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$FRONTEND_PID" 2>/dev/null; do
  sleep 1
done

if kill -0 "$BACKEND_PID" 2>/dev/null; then
  wait "$FRONTEND_PID" || true
  echo "Frontend exited unexpectedly; stopping backend." >&2
else
  wait "$BACKEND_PID" || true
  echo "Backend exited unexpectedly; stopping frontend." >&2
fi

exit 1

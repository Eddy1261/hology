#!/usr/bin/env bash
# E2E auth-service launcher. Resolves the repository root from THIS script's
# own location (never $PWD): walks up from the script dir until it finds
# cloud/auth-service, then validates. Works from apps/desktop, repo root,
# Playwright, and CI.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

REPO_ROOT=""
d="$SCRIPT_DIR"
while [ -n "$d" ] && [ "$d" != "/" ]; do
  if [ -d "$d/cloud/auth-service" ]; then
    REPO_ROOT="$d"
    break
  fi
  d="$(dirname "$d")"
done

if [ -z "$REPO_ROOT" ]; then
  echo "auth-service not found: $REPO_ROOT/cloud/auth-service" >&2
  exit 1
fi

AUTH_SERVICE_DIR="$REPO_ROOT/cloud/auth-service"
RUNTIME_DIR="$REPO_ROOT/apps/desktop/e2e/.runtime"
mkdir -p "$RUNTIME_DIR"
cd "$AUTH_SERVICE_DIR"

# CGO_ENABLED=0: the no-root box's CC shim is rust-lld (breaks cgo link).
CGO_ENABLED=0 go build -o "$RUNTIME_DIR/auth-service" ./cmd
AUTH_SENDER=memory AUTH_ADDR=127.0.0.1:8090 JWT_SECRET=e2e-secret \
  "$RUNTIME_DIR/auth-service" 2>&1 | tee "$RUNTIME_DIR/auth.log"

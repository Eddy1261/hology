#!/usr/bin/env bash
# No-root browser system libs: pull the .debs chromium needs from the Ubuntu
# archive pool and extract into a local prefix (LD_LIBRARY_PATH).
# SELF-VERIFYING: reruns ldd afterwards; exits non-zero if anything is still
# missing. Idempotent (re-extract over the same prefix is safe).
# CI path: `playwright install --with-deps` (root). This is the dev fallback.
set -euo pipefail
BASE="https://archive.ubuntu.com/ubuntu/pool"
PREFIX="${E2E_LIBS_DIR:-/home/hermes/e2e-libs}"
SHELL_BIN="${PLAYWRIGHT_BROWSERS_PATH:-/home/hermes/ms-playwright}/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$PREFIX"

# package -> pool path (direct + transitive dependency chain)
PACKAGES="
libglib2.0-0 main/g/glib2.0
libx11-6 main/libx/libx11
libxcomposite1 main/libx/libxcomposite
libxdamage1 main/libx/libxdamage
libxext6 main/libx/libxext
libxfixes3 main/libx/libxfixes
libxrandr2 main/libx/libxrandr
libasound2 main/a/alsa-lib
libatk1.0-0 main/a/atk1.0
libatk-bridge2.0-0 main/a/at-spi2-atk
libatspi2.0-0 main/a/at-spi2-core
libdbus-1-3 main/d/dbus
libgbm1 main/m/mesa
libnspr4 main/n/nspr
libnss3 main/n/nss
libxcb1 main/libx/libxcb
libxkbcommon0 main/libx/libxkbcommon
libxau6 main/libx/libxau
libxdmcp6 main/libx/libxdmcp
libxi6 main/libx/libxi
libxrender1 main/libx/libxrender
libdrm2 main/libd/libdrm
libpcre3 main/p/pcre3
"

cd "$WORK"
while read -r pkg dir; do
  [ -z "$pkg" ] && continue
  page="$(curl -s "$BASE/$dir/")"
  deb="$(printf '%s' "$page" | grep -oE "${pkg}_[0-9][^\"<>]*_amd64\.deb" | tail -1)"
  if [ -z "$deb" ]; then
    echo "skip $pkg (no amd64 deb found)"
    continue
  fi
  curl -sO "$BASE/$dir/$deb"
  dpkg-deb -x "$deb" "$PREFIX"
  echo "staged $pkg ($deb)"
done <<< "$PACKAGES"

# verification: ldd must report zero missing
LIBDIRS="$PREFIX/usr/lib/x86_64-linux-gnu:$PREFIX/lib/x86_64-linux-gnu"
MISSING="$(LD_LIBRARY_PATH="$LIBDIRS" ldd "$SHELL_BIN" 2>/dev/null | grep "not found" | sort -u || true)"
if [ -n "$MISSING" ]; then
  echo "STILL MISSING:" >&2
  echo "$MISSING" >&2
  exit 1
fi
echo "chromium libs: all resolved"

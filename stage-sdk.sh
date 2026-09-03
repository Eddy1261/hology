#!/usr/bin/env bash
# Linux/macOS counterpart to stage-sdk.ps1 — see that file for the full
# rationale. Copies the shared AiConnect SDK from connector-sdk/ into
# apps/desktop/src-tauri/runtime/sdk/{node,python} so it ships via the
# existing `resources: ["runtime/**/*"]` Tauri bundle, the same way the
# bundled Node/Python interpreters already do.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SDK_SRC_NODE="$REPO_DIR/../connector-sdk/node"
SDK_SRC_PYTHON="$REPO_DIR/../connector-sdk/python/mcp_license_sdk"
DEST_ROOT="$REPO_DIR/apps/desktop/src-tauri/runtime/sdk"

if [ ! -d "$SDK_SRC_NODE" ]; then
    echo "connector-sdk/node not found at $SDK_SRC_NODE" >&2
    exit 1
fi
if [ ! -d "$SDK_SRC_PYTHON" ]; then
    echo "connector-sdk/python/mcp_license_sdk not found at $SDK_SRC_PYTHON" >&2
    exit 1
fi

echo "== staging SDK =="

rm -rf "$DEST_ROOT/node"
mkdir -p "$DEST_ROOT/node"
cp -R "$SDK_SRC_NODE/." "$DEST_ROOT/node/"
echo "STAGED NODE SDK:   $DEST_ROOT/node"

rm -rf "$DEST_ROOT/python/mcp_license_sdk"
mkdir -p "$DEST_ROOT/python"
cp -R "$SDK_SRC_PYTHON" "$DEST_ROOT/python/mcp_license_sdk"
echo "STAGED PYTHON SDK: $DEST_ROOT/python/mcp_license_sdk"

# node_modules / __pycache__ / test dirs are dev-only weight the app must
# never ship.
find "$DEST_ROOT" -depth -type d \( -name node_modules -o -name __pycache__ -o -name tests -o -name test \) -exec rm -rf {} +

echo "✅ Staging complete! Ready for Tauri build."

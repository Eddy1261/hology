#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATEWAY_DIR="$REPO_DIR/apps/gateway"
DEST_DIR="$REPO_DIR/apps/desktop/src-tauri/binaries"

TARGET_TRIPLE="$(rustc -vV | sed -n 's|host: ||p')"
echo "== Building gateway and bridge sidecars for: $TARGET_TRIPLE =="

cd "$GATEWAY_DIR"
cargo build --release --bin gateway --bin mcp-stdio-bridge

mkdir -p "$DEST_DIR"

cp "$GATEWAY_DIR/target/release/gateway" "$DEST_DIR/gateway-$TARGET_TRIPLE"
cp "$GATEWAY_DIR/target/release/mcp-stdio-bridge" "$DEST_DIR/mcp-stdio-bridge-$TARGET_TRIPLE"

echo "STAGED GATEWAY: $DEST_DIR/gateway-$TARGET_TRIPLE"
echo "STAGED BRIDGE:  $DEST_DIR/mcp-stdio-bridge-$TARGET_TRIPLE"
sha256sum "$DEST_DIR/gateway-$TARGET_TRIPLE"
sha256sum "$DEST_DIR/mcp-stdio-bridge-$TARGET_TRIPLE"
echo "✅ Staging complete! Ready for Tauri build."

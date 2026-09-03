# Stage the shared AiConnect SDK (license gate + response envelope) into
# apps/desktop/src-tauri/runtime/sdk/{node,python} so it ships with the app the
# same way the bundled Node/Python interpreters already do — see
# `resolve_sdk_dir` in apps/gateway/src/process_manager.rs for why a managed
# connector cannot function without it (AICONNECT_ENABLE=1 makes every
# managed "node"/"python" connector's aioconnect.{ts,py} require this SDK,
# but nothing used to tell it where the packaged copy lives).
#
# Copies FROM the source of truth (connector-sdk/) rather than committing a
# second copy under src-tauri/ — this repo already learned that lesson once
# (see build_and_sync_marketplace.py's own docstring on CONNECTOR_DEFS: "Two
# sources of truth, with the copy in this file deciding").
#
# Run from the repo root, BEFORE `pnpm tauri build`, same as
# stage-gateway-sidecar.ps1:
#   powershell -ExecutionPolicy Bypass -File apps\desktop\stage-sdk.ps1
#
# No tauri.conf.json change needed: `resources: ["runtime/**/*"]` already
# bundles everything under src-tauri/runtime/, which is how runtime/node/ and
# runtime/python/ (the bundled interpreters) already ship.

$ErrorActionPreference = 'Stop'
$repo = (Get-Location).Path
if (-not (Test-Path "$repo\apps\gateway\Cargo.toml")) {
    throw "run this from the repo root (apps\gateway\Cargo.toml not found under $repo)"
}

$sdkSrcNode = "$repo\..\connector-sdk\node"
$sdkSrcPython = "$repo\..\connector-sdk\python\mcp_license_sdk"
if (-not (Test-Path $sdkSrcNode)) { throw "connector-sdk\node not found at $sdkSrcNode" }
if (-not (Test-Path $sdkSrcPython)) { throw "connector-sdk\python\mcp_license_sdk not found at $sdkSrcPython" }

$destRoot = "$repo\apps\desktop\src-tauri\runtime\sdk"
$destNode = "$destRoot\node"
$destPython = "$destRoot\python\mcp_license_sdk"

Write-Host "== staging SDK =="

Remove-Item -Recurse -Force $destNode -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $destNode | Out-Null
Copy-Item "$sdkSrcNode\*" $destNode -Recurse -Force
Write-Host "STAGED NODE SDK:   $destNode"

Remove-Item -Recurse -Force $destPython -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Split-Path $destPython -Parent) | Out-Null
Copy-Item $sdkSrcPython $destPython -Recurse -Force
Write-Host "STAGED PYTHON SDK: $destPython"

# node_modules / __pycache__ / test dirs are dev-only weight the app must
# never ship — the runtime interpreters ship no such thing either.
Get-ChildItem -Path $destRoot -Recurse -Directory -Include "node_modules","__pycache__","tests","test" -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-Item $_.FullName -Recurse -Force }

Write-Host "STAGING-OK — safe to run: pnpm tauri build"

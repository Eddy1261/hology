# G-1.3 -- Rebuild + stage the Gateway Windows sidecar, then verify it boots.
#
# Tauri `pnpm tauri build` packages the PRE-STAGED externalBin file
# (apps/desktop/src-tauri/binaries/gateway-x86_64-pc-windows-msvc.exe); it
# does NOT rebuild it from apps/gateway source. If that file is stale (e.g.
# built before the G-1.1 non-fatal connectors fix), the installed app ships
# an old gateway. Run this script BEFORE `pnpm tauri build` every time the
# gateway Rust source changes.
#
# Run from the repo root (C:\Users\HP\AiConnect):
#   powershell -ExecutionPolicy Bypass -File apps\desktop\stage-gateway-sidecar.ps1
#
# What it does:
#   1. cargo build --release --bin gateway   (x86_64-pc-windows-msvc)
#   2. copies target\release\gateway.exe -> src-tauri\binaries\gateway-x86_64-pc-windows-msvc.exe
#   3. prints SIZE / MTIME / SHA256 (proof of rebuild)
#   4. boots the STAGED binary directly with a missing connectors dir +
#      explicit AICONNECT_DATA_DIR; requires /health -> 200, then kills it.
#   5. "STAGING-OK" only if all of the above succeeded.
#
# No PATH modification, no connectors/ copy into the installer, no hardcoded
# user paths.

$ErrorActionPreference = 'Stop'
$repo = (Get-Location).Path
if (-not (Test-Path "$repo\apps\gateway\Cargo.toml")) {
    throw "run this from the repo root (apps\gateway\Cargo.toml not found under $repo)"
}

# AUTH-001 removed every baked verification key from the gateway: with none in
# its environment it bails on the FIRST statement of main() and exits 1. The
# desktop shell bakes AICONNECT_PUBLIC_KEY at build time (see BAKED_PUBLIC_KEY
# in apps/desktop/src-tauri/src/lib.rs), so `pnpm tauri build` needs it set
# too -- requiring it here stops a keyless installer from ever being produced.
$pubKey = $env:AICONNECT_PUBLIC_KEY
if ([string]::IsNullOrWhiteSpace($pubKey)) {
    $pubKey = "7bc3079518ed11da0336085bf6962920ff87fb3c4d630a9b58cb6153674f5dd6"
    $env:AICONNECT_PUBLIC_KEY = $pubKey
    Write-Host "AICONNECT_PUBLIC_KEY was not set -- defaulting to production cloud key: $pubKey" -ForegroundColor Yellow
}

# 1. rebuild
Write-Host "== build gateway and bridge (release, windows-msvc) =="
Push-Location "$repo\apps\gateway"
try {
    cargo build --release --bin gateway --bin mcp-stdio-bridge
    if ($LASTEXITCODE -ne 0) { throw "cargo release build failed (exit $LASTEXITCODE)" }
} finally {
    Pop-Location
}

# 2. stage
$builtGw = "$repo\apps\gateway\target\release\gateway.exe"
if (-not (Test-Path $builtGw)) { throw "build artifact missing: $builtGw" }
$builtBridge = "$repo\apps\gateway\target\release\mcp-stdio-bridge.exe"
if (-not (Test-Path $builtBridge)) { throw "build artifact missing: $builtBridge" }

$dest = "$repo\apps\desktop\src-tauri\binaries"
New-Item -ItemType Directory -Force $dest | Out-Null

$stagedGw = Join-Path $dest 'gateway-x86_64-pc-windows-msvc.exe'
Copy-Item $builtGw $stagedGw -Force
$stagedBridge = Join-Path $dest 'mcp-stdio-bridge-x86_64-pc-windows-msvc.exe'
Copy-Item $builtBridge $stagedBridge -Force

$f = Get-Item $stagedGw
$hash = (Get-FileHash $stagedGw -Algorithm SHA256).Hash
Write-Host "STAGED GATEWAY: $stagedGw"
Write-Host ("SIZE:   {0} bytes" -f $f.Length)
Write-Host ("MTIME:  {0}" -f $f.LastWriteTime.ToUniversalTime().ToString('u'))
Write-Host "SHA256: $hash"
Write-Host "STAGED BRIDGE:  $stagedBridge"
$proof = "size=$($f.Length) mtime=$($f.LastWriteTime.ToUniversalTime().ToString('u')) sha256=$hash"
$proof | Set-Content (Join-Path $dest 'gateway-staged.txt')
Write-Host "proof file: $dest\gateway-staged.txt"

# 3. direct boot verification (the exact packaged runtime conditions)
$data = Join-Path $env:TEMP "aiconnect-sidecar-test-$PID"
$env:AICONNECT_DATA_DIR = $data
$env:CONNECTORS_DIR = Join-Path $data 'no-connectors'   # deliberately missing
$env:AICONNECT_PUBLIC_KEY = $pubKey

# The gateway also exits 1 when 127.0.0.1:8788 is already bound (main.rs
# `TcpListener::bind(...)?`). A leftover gateway.exe from an earlier failed run
# -- Stop-Process below only kills the parent -- or an installed AI Connect that
# is currently running both produce that, and it looks identical to a config
# failure. Say so up front instead.
$busy = Get-NetTCPConnection -LocalPort 8788 -State Listen -ErrorAction SilentlyContinue
if ($busy) {
    $owners = ($busy | ForEach-Object {
        $proc = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
        if ($proc) { "$($proc.ProcessName) (PID $($proc.Id))" } else { "PID $($_.OwningProcess)" }
    }) -join ', '
    throw "127.0.0.1:8788 is already in use by $owners - the boot test cannot bind. Close the running AI Connect / stray gateway.exe and re-run."
}

New-Item -ItemType Directory -Force $data | Out-Null
$outLog = Join-Path $data 'boot-test.out.log'
$errLog = Join-Path $data 'boot-test.err.log'

# The gateway has NO file logging -- every diagnostic is a bare eprintln!, and
# anyhow prints the fatal reason to stderr before exiting. Capturing stderr is
# the difference between "exited early (code 1)" and the actual cause.
function Get-BootLog {
    $text = ''
    foreach ($f in @($errLog, $outLog)) {
        if (Test-Path $f) {
            $c = (Get-Content $f -Raw -ErrorAction SilentlyContinue)
            if (-not [string]::IsNullOrWhiteSpace($c)) { $text += $c }
        }
    }
    if ([string]::IsNullOrWhiteSpace($text)) { return '(gateway produced no output)' }
    return $text.Trim()
}

Write-Host "== direct boot test (data=$data, connectors missing) =="
$p = Start-Process $stagedGw -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $outLog -RedirectStandardError $errLog
try {
    $ok = $false
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Milliseconds 500
        if ($p.HasExited) {
            throw "gateway exited early (code $($p.ExitCode))`n--- gateway output ---`n$(Get-BootLog)"
        }
        try {
            $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8788/health' -TimeoutSec 2
            if ($r.StatusCode -eq 200) { $ok = $true; break }
        } catch { }
    }
    if (-not $ok) {
        throw "gateway /health never returned 200 within 20s`n--- gateway output ---`n$(Get-BootLog)"
    }
    Write-Host 'HEALTH: 200 OK'
} finally {
    if (-not $p.HasExited) {
        # /T so a connector the gateway spawned is reaped too -- Stop-Process
        # alone leaves the child holding port 8788 and breaks the NEXT run.
        & taskkill /T /F /PID $p.Id 2>&1 | Out-Null
    }
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    Remove-Item Env:AICONNECT_DATA_DIR -ErrorAction SilentlyContinue
    Remove-Item Env:CONNECTORS_DIR -ErrorAction SilentlyContinue
    Remove-Item $data -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host 'STAGING-OK -- safe to run: pnpm tauri build'

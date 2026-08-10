use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, RunEvent};

/// Phase 5R: offline local-data layer (gateway-down persistence access).
mod offline;

/// Handle to the spawned gateway sidecar. Taken (set to None) on kill so the
/// exit hook doesn't double-kill. `Mutex` interior mutability: Tauri State is
/// immutable, and the exit hook must move the child out exactly once.
struct GatewayProcess(Mutex<Option<Child>>);

/// Kill the whole gateway process tree. Unix: POSIX negative-pid group kill
/// (the gateway was spawned into its own process group) reaps connectors the
/// gateway may have spawned. Windows: no POSIX groups — `taskkill /T /F`
/// walks the parent-child tree (same no-orphans semantics).
#[cfg(unix)]
fn kill_process_tree(pid: u32) {
    let _ = Command::new("sh")
        .arg("-c")
        .arg(format!("kill -9 -{pid} 2>/dev/null"))
        .status();
}

#[cfg(windows)]
fn kill_process_tree(pid: u32) {
    use std::os::windows::process::CommandExt;
    let _ = Command::new("taskkill")
        .creation_flags(0x08000000)
        .args(["/T", "/F", "/PID", &pid.to_string()])
        .status();
}

/// Packaged externalBin sidecar file name. Tauri v2 strips the target
/// triple when staging: Windows NSIS puts `gateway.exe` at the INSTALL
/// ROOT (resource dir), NOT `resources\binaries\<triple>.exe` (G-1.2,
/// verified against a real NSIS install). Unix bundles stage plain
/// `gateway`.
#[cfg_attr(debug_assertions, allow(dead_code))]
fn packaged_sidecar_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "gateway.exe"
    } else {
        "gateway"
    }
}

/// Spawn the gateway (apps/gateway) as a child process of the desktop shell.
///
/// Binary resolution order:
///   1. `AICONNECT_GATEWAY_BIN` env var — explicit dev/test override,
///      highest priority, returned verbatim.
///   2. DEBUG builds — `gateway` on PATH (cargo-installed or symlinked).
///   3. PACKAGED builds — the bundled Tauri externalBin sidecar at
///      `resource_dir()/gateway.exe` (Windows NSIS install root) — no PATH
///      lookup, no hardcoded user path (G-1, G-1.2).
///
/// Failure is EXPLICIT: a packaged build whose sidecar file does not exist
/// returns an Err with the exact path — never a silent fallback to a bare
/// `gateway` (that would re-open the PATH hole).
fn resolve_gateway_bin(#[allow(unused_variables)] app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Ok(p) = std::env::var("AICONNECT_GATEWAY_BIN") {
        return Ok(PathBuf::from(p));
    }
    #[cfg(debug_assertions)]
    {
        return Ok(PathBuf::from("gateway"));
    }
    #[cfg(not(debug_assertions))]
    {
        let dir = app
            .path()
            .resource_dir()
            .map_err(|e| format!("cannot resolve app resource dir: {e}"))?;
        let path = dir.join(packaged_sidecar_name());
        if !path.is_file() {
            return Err(format!(
                "packaged gateway sidecar not found at {} — externalBin must be staged by the build; set AICONNECT_GATEWAY_BIN to an explicit binary to override",
                path.display()
            ));
        }
        Ok(path)
    }
}

/// Ed25519 session-verification key for the gateway, baked at BUILD time.
///
/// AUTH-001 removed every baked fallback from the gateway itself: with no
/// `AICONNECT_PUBLIC_KEY` (or `AUTH_PUBLIC_KEY` / `JWT_PUBLIC_KEY`) in its
/// environment, `apps/gateway/src/main.rs` bails on the FIRST statement of
/// `main()` and exits 1 — so the sidecar died on every launch and the app
/// reported only "gateway unreachable".
///
/// A public key is public by definition; baking it is safe. AUTH-001's actual
/// defect was that the baked key's PRIVATE half was committed in this repo.
/// Defaults to the production cloud auth-service's real public key so packaged
/// installers work out-of-the-box on clean user machines without requiring manual
/// environment variables.
pub const DEFAULT_PUBLIC_KEY: &str =
    "7bc3079518ed11da0336085bf6962920ff87fb3c4d630a9b58cb6153674f5dd6";

const BAKED_PUBLIC_KEY: Option<&str> = match option_env!("AICONNECT_PUBLIC_KEY") {
    Some(key) if !key.is_empty() => Some(key),
    _ => Some(DEFAULT_PUBLIC_KEY),
};

/// Where the gateway's stdout/stderr is captured. The gateway has no
/// `tracing`/`log`/file logging — every diagnostic is a bare `eprintln!`, and
/// a packaged GUI child's inherited stderr goes nowhere. Without this file a
/// boot failure is indistinguishable from "gateway unreachable".
fn gateway_log_path() -> PathBuf {
    context_store::store::data_dir().join("logs").join("gateway.log")
}

/// Open the gateway log for appending. Best-effort: a log we cannot open must
/// never stop the gateway from starting.
fn gateway_log_file() -> Option<std::fs::File> {
    let path = gateway_log_path();
    std::fs::create_dir_all(path.parent()?).ok()?;
    std::fs::OpenOptions::new().create(true).append(true).open(&path).ok()
}

fn spawn_gateway(app: &tauri::AppHandle) -> Result<Child, String> {
    let bin = resolve_gateway_bin(app)?;
    let mut cmd = Command::new(&bin);
    // Explicit packaged runtime state root (G-1.1): persistent connectors +
    // projects/context/leases/skill-resources must NOT follow the gateway's
    // CWD (install dir, read-only on Windows). Env override still wins if
    // the caller set it; only set it when unset so dev/test overrides hold.
    if std::env::var_os("AICONNECT_DATA_DIR").is_none() {
        cmd.env("AICONNECT_DATA_DIR", context_store::store::data_dir());
    }
    // Session verification key. Same precedence rule as the data dir: an
    // ambient env var (dev/test) wins, the baked build-time value is the
    // fallback. Absent BOTH, refuse to spawn with an actionable message
    // rather than letting the child exit 1 into a discarded stderr.
    if std::env::var_os("AICONNECT_PUBLIC_KEY").is_none()
        && std::env::var_os("AUTH_PUBLIC_KEY").is_none()
        && std::env::var_os("JWT_PUBLIC_KEY").is_none()
    {
        match BAKED_PUBLIC_KEY.map(str::trim).filter(|k| !k.is_empty()) {
            Some(key) => {
                cmd.env("AICONNECT_PUBLIC_KEY", key);
            }
            None => {
                return Err(format!(
                    "this build has no session verification key: it was built without \
                     AICONNECT_PUBLIC_KEY set, so the gateway at {} would exit immediately. \
                     Rebuild with AICONNECT_PUBLIC_KEY=<cloud auth-service Ed25519 public key>, \
                     or set that variable in this environment to override.",
                    bin.display()
                ));
            }
        }
    }
    // Capture the child's output; the gateway logs only to stderr.
    if let Some(log) = gateway_log_file() {
        match log.try_clone() {
            Ok(err_handle) => {
                cmd.stdout(std::process::Stdio::from(log));
                cmd.stderr(std::process::Stdio::from(err_handle));
            }
            Err(_) => {
                cmd.stderr(std::process::Stdio::from(log));
            }
        }
    }
    // Unix: own process group so a group-kill on exit reaps connectors the
    // gateway may have spawned (same dash `kill -9 -<pid>` trick the
    // gateway's own stop path uses). Windows: tree cleanup on exit uses
    // taskkill /T in kill_process_tree.
    #[cfg(unix)]
    {
        cmd.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd.spawn()
        .map_err(|e| format!("failed to spawn gateway binary '{}': {e}", bin.display()))
}

/// Where the gateway announced its ACTUAL bound port.
///
/// `bind_with_fallback` (apps/gateway/src/main.rs) falls back to an
/// OS-assigned port when 8788 is already taken — by an unrelated app, or (the
/// common case) by a `gateway.exe` an unclean shutdown of a previous run left
/// behind, since the tree-kill only runs on a clean `RunEvent::Exit`. The port
/// file is the only channel by which this shell can learn what `:0` resolved
/// to.
fn gateway_port_file() -> PathBuf {
    context_store::store::data_dir().join("gateway-port.json")
}

/// Resolve the gateway's base URL for the frontend (`resolveGatewayUrl` in
/// `src/lib/gateway.ts`).
///
/// `Ok(None)` means "nothing to change, keep the default" — and, crucially,
/// is also what a not-yet-written port file returns, because the caller
/// retries on `None` and only gives up on a thrown error. Returning `Err`
/// here would stop that retry loop dead.
///
/// The pid check is the whole point. A port file left by an ORPHANED gateway
/// names that orphan's port, and honouring it would point the app at the very
/// stale process this resolution exists to route around — the app would hand
/// its session token to, and read connector state from, a gateway from a
/// previous run. Only the child THIS shell spawned counts.
#[tauri::command]
fn resolve_gateway_url(gw: tauri::State<'_, GatewayProcess>) -> Result<Option<String>, String> {
    // A poisoned mutex must not break resolution: the guarded value is a plain
    // Option<Child> with no invariant a panic could have broken.
    let our_pid = match gw.0.lock() {
        Ok(g) => g.as_ref().map(|c| c.id()),
        Err(poisoned) => poisoned.into_inner().as_ref().map(|c| c.id()),
    };
    let Some(our_pid) = our_pid else { return Ok(None) };

    let Ok(raw) = std::fs::read_to_string(gateway_port_file()) else { return Ok(None) };
    let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw) else { return Ok(None) };
    let (Some(port), Some(pid)) = (
        v.get("port").and_then(|x| x.as_u64()),
        v.get("pid").and_then(|x| x.as_u64()),
    ) else {
        return Ok(None);
    };
    if pid != u64::from(our_pid) {
        // Stale file (previous run) or an orphan's. The caller keeps retrying,
        // and our own gateway overwrites it as soon as it finishes binding.
        return Ok(None);
    }
    if port == 0 || port > u64::from(u16::MAX) {
        return Ok(None);
    }
    Ok(Some(format!("http://127.0.0.1:{port}")))
}

// ---------------------------------------------------------------------------
// Session persistence (Checkpoint B #4): OS keychain (keyring crate) with a
// 0600-file fallback for machines with no Secret Service (this sandbox).
// Plaintext 0600 file is LOCAL-TESTING ONLY — the prod path is the keychain.
// ---------------------------------------------------------------------------

fn session_file() -> PathBuf {
    std::env::var_os("AICONNECT_SESSION_FILE")
        .map(PathBuf::from)
        .unwrap_or_else(|| context_store::store::data_dir().join("session.json"))
}

#[tauri::command]
fn session_save(json: String) -> Result<(), String> {
    if let Ok(entry) = keyring::Entry::new("aiconnect", "session") {
        if entry.set_password(&json).is_ok() {
            return Ok(());
        }
    }
    let path = session_file();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, &json).map_err(|e| e.to_string())?;
    // Unix: tighten the file fallback to 0600 (sandbox / no-Secret-Service
    // machines). Windows: permission bits are a Unix concept — the fallback
    // file sits under the user-profile ACL, and the OS keychain remains the
    // primary path, so no chmod equivalent is applied.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn session_load() -> Result<Option<String>, String> {
    if let Ok(entry) = keyring::Entry::new("aiconnect", "session") {
        if let Ok(pw) = entry.get_password() {
            return Ok(Some(pw));
        }
    }
    match std::fs::read_to_string(session_file()) {
        Ok(s) => Ok(Some(s)),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
fn session_clear() -> Result<(), String> {
    if let Ok(entry) = keyring::Entry::new("aiconnect", "session") {
        let _ = entry.delete_password();
    }
    let _ = std::fs::remove_file(session_file());
    Ok(())
}

// ---------------------------------------------------------------------------
// Google OAuth (Checkpoint B #1): PKCE + system browser + loopback listener.
// Client id comes from `GOOGLE_CLIENT_ID` env (drop-in, no code change; the
// desktop frontend also carries the default in src/lib/config.ts — keep the
// two in sync). Returns the Google id_token; the frontend posts it to
// POST /auth/google/callback (server verifies via googleapis idtoken lib).
//
// UNVERIFIED on this box: needs a GUI host (system browser + webkit2gtk) to
// exercise end-to-end. Redirect URI http://127.0.0.1:48721/callback must be
// registered in the Google Cloud console for this client.
// ---------------------------------------------------------------------------

fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn parse_query(q: &str) -> std::collections::HashMap<String, String> {
    let mut m = std::collections::HashMap::new();
    for pair in q.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            m.insert(
                percent_decode_str(k),
                percent_decode_str(v),
            );
        }
    }
    m
}

/// Percent-decode a query component. Escapes are decoded into a BYTE buffer
/// and run through ONE UTF-8 decode at the end: decoding per-`char` would be
/// Latin-1 (mojibake on every multi-byte escape) and slicing a `String` at
/// fixed byte offsets can land mid-char and panic. Both are why this works
/// on bytes and never on `str` indices.
fn percent_decode_str(s: &str) -> String {
    let src = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(src.len());
    let mut i = 0;
    while i < src.len() {
        match src[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < src.len() => {
                match (
                    (src[i + 1] as char).to_digit(16),
                    (src[i + 2] as char).to_digit(16),
                ) {
                    (Some(hi), Some(lo)) => {
                        out.push((hi * 16 + lo) as u8);
                        i += 3;
                    }
                    // not a valid escape — keep the literal '%'
                    _ => {
                        out.push(b'%');
                        i += 1;
                    }
                }
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Read ONE HTTP request from the loopback socket and return its request
/// target. A single `read()` is not guaranteed to return the whole request
/// line, so this reads until the first LF (or an 8 KiB cap). `None` =
/// closed / malformed / oversized.
async fn read_http_request_target(socket: &mut tokio::net::TcpStream) -> Option<String> {
    let mut buf: Vec<u8> = Vec::with_capacity(1024);
    let mut chunk = [0u8; 1024];
    while !buf.contains(&b'\n') && buf.len() < 8192 {
        let n = tokio::io::AsyncReadExt::read(socket, &mut chunk).await.ok()?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..n]);
    }
    let head = String::from_utf8_lossy(&buf);
    head.lines().next()?.split(' ').nth(1).map(|t| t.to_string())
}

fn open_browser(url: &str) -> Result<(), String> {
    let ok = if cfg!(target_os = "linux") {
        Command::new("xdg-open").arg(url).spawn().is_ok()
    } else if cfg!(target_os = "macos") {
        Command::new("open").arg(url).spawn().is_ok()
    } else if cfg!(target_os = "windows") {
        Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", url])
            .spawn()
            .is_ok()
    } else {
        false
    };
    if ok {
        Ok(())
    } else {
        Err("could not open system browser".into())
    }
}

/// Checkpoint D: open a URL (Xendit checkout, OAuth consent) in the SYSTEM
/// browser — never inside the webview.
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    open_browser(&url)
}

/// Public Google OAuth client id (installed-app, PKCE, no client secret).
/// BUNDLED so packaged builds never depend on process env — the id is public
/// configuration (B4-FRONTEND fix). Dev override via GOOGLE_CLIENT_ID env.
const GOOGLE_CLIENT_ID: &str =
    "858768057989-rtk713n66kov8a7bi2vcft3kkai732e0.apps.googleusercontent.com";

fn google_client_id() -> String {
    std::env::var("GOOGLE_CLIENT_ID").unwrap_or_else(|_| GOOGLE_CLIENT_ID.to_string())
}

#[tauri::command]
async fn google_login() -> Result<String, String> {
    use base64::Engine;
    let client_id = google_client_id();
    let port: u16 = 48721;

    // PKCE verifier + S256 challenge
    let mut rng_buf = [0u8; 32];
    rand::RngCore::fill_bytes(&mut rand::rngs::OsRng, &mut rng_buf);
    let verifier = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(rng_buf);
    use sha2::{Digest, Sha256};
    let challenge =
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    // CSRF state is an INDEPENDENT CSPRNG draw — deriving it from the
    // verifier would leak verifier bytes to anything that sees the redirect.
    let mut state_buf = [0u8; 16];
    rand::RngCore::fill_bytes(&mut rand::rngs::OsRng, &mut state_buf);
    let state = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(state_buf);

    // Bind the loopback listener BEFORE opening the browser (no race).
    // Retry with offset ports if previous OAuth attempt left port occupied.
    let mut listener = None;
    for offset in 0..5 {
        let p = port + offset;
        match tokio::net::TcpListener::bind(("127.0.0.1", p)).await {
            Ok(l) => { listener = Some((l, p)); break; }
            Err(_) => continue,
        }
    }
    let (listener, port) = listener.ok_or_else(|| format!("all loopback ports {port}-{} occupied", port + 4))?;
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/auth?client_id={}&redirect_uri={}&response_type=code&scope=openid%20email%20profile&state={}&code_challenge={}&code_challenge_method=S256",
        urlencode(&client_id),
        urlencode(&redirect_uri),
        state,
        challenge
    );
    eprintln!("google: auth_url={auth_url}");
    open_browser(&auth_url)?;

    // Read the callback: keep accepting until a request for the callback
    // PATH arrives, then parse ?code=...&state=... . Browser preconnects,
    // favicon fetches and port scans all land on this listener and must not
    // consume the sign-in; a stalled connection is dropped after 10s and the
    // whole wait is bounded so a browser that never returns cannot hang.
    let query = tokio::time::timeout(std::time::Duration::from_secs(300), async {
        loop {
            let (mut socket, _) = listener.accept().await.map_err(|e| e.to_string())?;
            let target = match tokio::time::timeout(
                std::time::Duration::from_secs(10),
                read_http_request_target(&mut socket),
            )
            .await
            {
                Ok(Some(t)) => t,
                _ => continue,
            };
            let (path, query) = match target.split_once('?') {
                Some((p, q)) => (p.to_string(), q.to_string()),
                None => (target, String::new()),
            };
            if path != "/callback" {
                let _ = tokio::io::AsyncWriteExt::write_all(
                    &mut socket,
                    b"HTTP/1.1 404 Not Found\r\ncontent-length: 0\r\nconnection: close\r\n\r\n",
                )
                .await;
                continue;
            }
            let _ = tokio::io::AsyncWriteExt::write_all(
                    &mut socket,
                    b"HTTP/1.1 200 OK\r\ncontent-type: text/html\r\nconnection: close\r\n\r\n<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Signed in</title></head><body style=\"margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0a0f;color:#e4e4e7;font-family:system-ui,sans-serif\"><div style=\"text-align:center;padding:48px 32px;border-radius:20px;background:linear-gradient(180deg,#13131a,#0f0f16);border:1px solid rgba(255,255,255,0.06);box-shadow:0 24px 80px -12px rgba(0,0,0,0.8);max-width:380px\"><div style=\"width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#a855f7);display:flex;align-items:center;justify-content:center;margin:0 auto 24px\"><svg width=\"28\" height=\"28\" viewBox=\"0 0 24 24\" fill=\"white\"><path d=\"M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z\"/></svg></div><h1 style=\"font-size:20px;font-weight:700;margin:0 0 8px\">Signed in successfully</h1><p style=\"font-size:14px;color:#71717a;margin:0 0 28px\">Your Google account is connected.<br>You can close this tab and return to AI Connect.</p><div style=\"display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.2);font-size:12px;font-weight:600;color:#a78bfa\"><span style=\"width:6px;height:6px;border-radius:50%;background:#22c55e\"></span>Authenticated</div></div></body></html>",
                )
                .await;
            return Ok::<String, String>(query);
        }
    })
    .await
    .map_err(|_| "timed out waiting for the oauth callback".to_string())??;

    let params = parse_query(&query);
    if params.get("state") != Some(&state) {
        return Err("oauth state mismatch (possible CSRF)".into());
    }
    let code = params.get("code").ok_or("no code in oauth callback")?;

    // Exchange code → id_token (installed-app client, PKCE, no client secret).
    // BAKE: GOOGLE_CLIENT_SECRET is compiled in at build time via option_env!,
    // same convention as BAKED_PUBLIC_KEY. Falls back to empty (omitted from
    // the token exchange body) when unset.
    eprintln!("google: redirect_uri={redirect_uri}");
    const BAKED_GOOGLE_CLIENT_SECRET: &str = match option_env!("GOOGLE_CLIENT_SECRET") { Some(v) => v, None => "" };
    let client_secret = BAKED_GOOGLE_CLIENT_SECRET.to_string();
    let mut body = format!(
        "code={}&client_id={}&redirect_uri={}&grant_type=authorization_code&code_verifier={}",
        urlencode(code),
        urlencode(&client_id),
        urlencode(&redirect_uri),
        urlencode(&verifier)
    );
    if !client_secret.is_empty() {
        body.push_str(&format!("&client_secret={}", urlencode(&client_secret)));
    }
    let resp = ureq::post("https://oauth2.googleapis.com/token")
        .set("Content-Type", "application/x-www-form-urlencoded")
        .send_string(&body);
    match resp {
        Ok(r) => {
            let parsed: serde_json::Value = r.into_json().map_err(|e| e.to_string())?;
            let obj = parsed.as_object().ok_or("response is not a JSON object")?;
            obj.get("id_token")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .ok_or_else(|| format!("no id_token in response: {obj:?}"))
        }
        Err(ureq::Error::Status(status, resp)) => {
            let body = resp.into_string().unwrap_or_default();
            Err(format!("google token exchange {status}: {body}"))
        }
        Err(e) => Err(format!("token exchange failed: {e}")),
    }
}

// ---------------------------------------------------------------------------
// Artifact persistence (Track C-9): a pure filesystem SINK for the C-8
// download client. The Tauri shell persists VERIFIED bytes only — it never
// authorizes, never verifies checksums, never decides entitlement, and never
// talks to storage backends. `rel` is the local relative artifact path
// (`connectors/<file>` | `skills/<file>`), validated and confined to the
// artifact root. Stage → complete write → atomic rename; abort cleans up.
// ---------------------------------------------------------------------------

fn data_dir() -> PathBuf {
    context_store::store::data_dir()
}

fn artifact_root() -> PathBuf {
    data_dir().join("artifacts")
}

/// Validate + resolve the local relative artifact path. Exactly two safe
/// segments: `connectors/<basename>` or `skills/<basename>`. Rejects
/// traversal, absolute paths, backslashes, drive/UNC forms, leading dots,
/// and NULs. REJECTIVE — never reparative.
fn resolve_artifact_rel(rel: &str) -> Result<PathBuf, String> {
    let mut parts = rel.split('/');
    let kind = parts.next().unwrap_or("");
    let name = parts.next().unwrap_or("");
    if parts.next().is_some() {
        return Err("unsafe artifact path".into());
    }
    if !matches!(kind, "connectors" | "skills") {
        return Err("unsafe artifact kind".into());
    }
    if name.is_empty()
        || name == "." 
        || name == ".."
        || name.starts_with('.')
        || name.len() > 255
        || name.contains('/')
        || name.contains('\\')
        || name.contains(':')
        || name.contains('\0')
    {
        return Err("unsafe artifact filename".into());
    }
    Ok(artifact_root().join(kind).join(name))
}

fn artifact_tmp(rel: &str) -> Result<PathBuf, String> {
    let final_path = resolve_artifact_rel(rel)?;
    Ok(final_path.with_extension(format!("tmp{}", std::process::id())))
}

/// Stage verified bytes at the temp path (never the final path).
#[tauri::command]
fn artifact_stage(rel: String, bytes: Vec<u8>) -> Result<(), String> {
    let tmp = artifact_tmp(&rel)?;
    if let Some(parent) = tmp.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())
}

/// Atomically finalize: rename tmp → final artifact path. Retries transient
/// Windows AV-lock denials (see `installer::rename_with_retry`) — this
/// renames the artifact right after writing its (often tens-of-MB) bytes,
/// exactly the pattern real-time scanning transiently locks.
#[tauri::command]
fn artifact_finalize(rel: String) -> Result<(), String> {
    let final_path = resolve_artifact_rel(&rel)?;
    let tmp = artifact_tmp(&rel)?;
    installer::rename_with_retry(&tmp, &final_path).map_err(|e| e.to_string())
}

/// Abort: remove the staged temp file (best-effort).
#[tauri::command]
fn artifact_abort(rel: String) -> Result<(), String> {
    let tmp = artifact_tmp(&rel)?;
    let _ = std::fs::remove_file(&tmp);
    Ok(())
}

// ---------------------------------------------------------------------------
// CP20: Transactional connector installation (download → extract → commit).
// ---------------------------------------------------------------------------

/// CP21 signature enforcement policy.
///
/// DEFAULT = `required`: an artifact with no valid envelope signed by a
/// trusted, non-revoked key is NEVER installed. `permissive` is an explicit,
/// loudly-logged operator opt-out for a catalog that does not publish
/// `<artifact>.sig.json` envelopes yet — it disables publisher trust and
/// revocation entirely and must never become the implicit default.
enum SignaturePolicy {
    Required,
    Permissive,
}

fn signature_policy() -> SignaturePolicy {
    match std::env::var("AICONNECT_SIGNATURE_POLICY")
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "permissive" => SignaturePolicy::Permissive,
        _ => SignaturePolicy::Required,
    }
}

/// Operator-managed trust store: `AICONNECT_TRUST_STORE` env override,
/// otherwise `<data_dir>/trust/trust-store.json`. An operator file, when
/// present, is authoritative and replaces the baked default below entirely
/// (e.g. an enterprise self-hosted publisher) — it is never merged with it.
fn trust_store_path() -> PathBuf {
    std::env::var_os("AICONNECT_TRUST_STORE")
        .map(PathBuf::from)
        .unwrap_or_else(|| data_dir().join("trust").join("trust-store.json"))
}

/// AiConnect's own publisher key, baked at BUILD time — same convention as
/// `BAKED_PUBLIC_KEY` above (`AICONNECT_PUBLIC_KEY=<hex> pnpm tauri build`).
/// A public key is public by definition; baking it is safe. Without this, a
/// fresh install has no `<data_dir>/trust/trust-store.json` and every signed
/// connector install refuses with "trust store unreadable" — CP21 shipping
/// signed artifacts (see scripts/release/sign_artifact.py) is worthless
/// without a client that can verify them out of the box.
const BAKED_TRUST_PUBLIC_KEY_HEX: Option<&str> = option_env!("AICONNECT_TRUST_PUBLIC_KEY");
const BAKED_TRUST_PUBLISHER_ID: &str = "AiConnect Official";

fn decode_hex_32(hex: &str) -> Option<[u8; 32]> {
    let hex = hex.trim();
    if hex.len() != 64 {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).ok()?;
    }
    Some(out)
}

/// The default trust store baked into this build, if any. `key_id` is
/// derived from the public key (never hardcoded separately) so the two
/// cannot drift out of sync. Same content as `trust-store.default.json`
/// (this crate's root) — that file is for manual drop-in at
/// `<data_dir>/trust/trust-store.json` (or `AICONNECT_TRUST_STORE`) on an
/// already-built install that predates this baked default, with zero
/// rebuild required.
fn baked_trust_store() -> Option<signature::TrustStore> {
    let pk = decode_hex_32(BAKED_TRUST_PUBLIC_KEY_HEX?)?;
    let key_id = signature::sign::sha256_hex(&pk);
    Some(signature::TrustStore::new(vec![signature::TrustedKey {
        publisher_id: BAKED_TRUST_PUBLISHER_ID.to_string(),
        key_id,
        public_key: pk.to_vec(),
        status: signature::KeyStatus::Active,
    }]))
}

fn load_trust_store() -> Result<signature::TrustStore, String> {
    let path = trust_store_path();
    match std::fs::read(&path) {
        Ok(bytes) => signature::TrustStore::from_json(&bytes)
            .map_err(|e| format!("trust store malformed at {}: {e}", path.display())),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            baked_trust_store().ok_or_else(|| {
                format!(
                    "trust store unreadable at {} (no file, and this build has no baked \
                     AICONNECT_TRUST_PUBLIC_KEY): {e}",
                    path.display()
                )
            })
        }
        Err(e) => Err(format!("trust store unreadable at {}: {e}", path.display())),
    }
}

/// Signature envelope staged next to the artifact under the CP21 §16 name
/// `<artifact>.sig.json`. `Ok(None)` = the catalog published no envelope;
/// a PRESENT but malformed envelope is an error, never a silent None.
fn load_signature_envelope(artifact_path: &Path) -> Result<Option<signature::SignatureEnvelope>, String> {
    let mut name = artifact_path.as_os_str().to_owned();
    name.push(".sig.json");
    let path = PathBuf::from(name);
    let Ok(bytes) = std::fs::read(&path) else {
        return Ok(None);
    };
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|e| format!("malformed signature envelope at {}: {e}", path.display()))
}

/// Expected catalog metadata for installation validation.
#[derive(serde::Deserialize)]
struct InstallRequest {
    connector_id: String,
    version: String,
    os: String,
    arch: String,
    sha256: String,
    size_bytes: u64,
}

/// Installed connector metadata returned to frontend.
#[derive(serde::Serialize)]
struct InstallResult {
    connector_id: String,
    version: String,
    installed_at_ms: i64,
}

/// Install a downloaded connector artifact: CP21 authenticity → CP20
/// transactional installer.
///
/// `artifact_rel` is the local relative path (e.g. "connectors/ping-mcp-1.0.0-windows-x64.zip")
/// resolved by the download sink. The bytes are read from the artifact root,
/// validated against `expected`, verified against the publisher signature
/// envelope staged at `<artifact>.sig.json` and the operator trust store,
/// then extracted atomically and committed. With the default `required`
/// signature policy an artifact with no envelope is never installed.
///
/// Expected installation layout after success:
///   <data_dir>/connectors/<id>/active.json
///   <data_dir>/connectors/<id>/<version>/manifest.json
///   <data_dir>/connectors/<id>/<version>/.aiconnect-install.json
///   <data_dir>/connectors/<id>/<version>/<connector files>
#[tauri::command]
fn install_connector(artifact_rel: String, expected: InstallRequest) -> Result<InstallResult, String> {
    // 1. Validate artifact_rel — must be a safe relative path under connectors/
    let artifact_path = resolve_artifact_rel(&artifact_rel)
        .map_err(|e| format!("invalid artifact path: {e}"))?;

    // 2. Read the artifact bytes
    let bytes = std::fs::read(&artifact_path)
        .map_err(|e| format!("failed to read artifact (path={:?}): {e}", artifact_path))?;

    use sha2::Digest;
    let actual_sha = format!("{:x}", sha2::Sha256::digest(&bytes));

    // 3. CP21 authenticity → CP20 transactional install. install_authenticated
    //    is the production path: publisher trust and revocation only exist if
    //    they run HERE, on the bytes that are about to be extracted.
    let installer = installer::Installer::new(data_dir());
    let expected_art = installer::ExpectedArtifact {
        connector_id: expected.connector_id,
        version: expected.version,
        os: expected.os,
        arch: expected.arch,
        sha256: expected.sha256,
        size_bytes: expected.size_bytes,
    };

    let fail = |e: installer::InstallError| {
        format!("installation failed: {e} (read_bytes={}, computed_sha256={actual_sha}, expected_size={}, expected_sha256={})", bytes.len(), expected_art.size_bytes, expected_art.sha256)
    };
    let meta = match load_signature_envelope(&artifact_path)? {
        Some(envelope) => {
            let trust = load_trust_store()?;
            installer
                .install_authenticated(&bytes, &expected_art, &envelope, &trust, None)
                .map_err(fail)?
        }
        // No envelope on disk: the policy decides — fail closed by default.
        None => match signature_policy() {
            SignaturePolicy::Required => {
                return Err(format!(
                    "installation refused: no signature envelope for {artifact_rel} — publish <artifact>.sig.json alongside the artifact and list the publisher key in the trust store at {} (AICONNECT_SIGNATURE_POLICY=permissive installs unsigned artifacts and disables publisher trust)",
                    trust_store_path().display()
                ));
            }
            SignaturePolicy::Permissive => {
                eprintln!(
                    "AI CONNECT SECURITY WARNING: installing UNSIGNED artifact {artifact_rel} — AICONNECT_SIGNATURE_POLICY=permissive disables publisher trust and revocation"
                );
                installer.install(&bytes, &expected_art).map_err(fail)?
            }
        },
    };

    // CP23: deploy shared connector SDK (node) so connectors can import it.
    // The SDK lives at <resource_dir>/connector-sdk/node/ after bundling and
    // must be copied to <data_dir>/connectors/sdk/node/ — the relative path
    // aioconnect.ts uses (../../../../sdk/node/index.js).
    if let Some(resource_dir) = std::env::current_exe().ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
    {
        let sdk_src = resource_dir.join("connector-sdk").join("node");
        let sdk_dst = data_dir().join("connectors").join("sdk").join("node");
        if sdk_src.is_dir() && !sdk_dst.exists() {
            let _ = std::fs::create_dir_all(sdk_dst.parent().unwrap_or(&sdk_dst));
            let _ = copy_dir_all(&sdk_src, &sdk_dst);
        }
    }

    Ok(InstallResult {
        connector_id: meta.connector_id,
        version: meta.version,
        installed_at_ms: meta.installed_at_ms,
    })
}

/// Recursive directory copy for SDK deployment.
fn copy_dir_all(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dst.join(entry.file_name()))?;
        } else {
            std::fs::copy(entry.path(), dst.join(entry.file_name()))?;
        }
    }
    Ok(())
}

/// TEMPORARY packaged diagnostic (catalog/download): append diagnostic lines
/// to `<app_data_dir>/<file>.log` so packaged WebView2 runs are diagnosable
/// (release console is hidden). `file` is allowlisted to known diagnostics
/// files only — no arbitrary path. Log-only; remove after the runtime issues
/// are resolved.
#[tauri::command]
fn diag(app: tauri::AppHandle, file: String, lines: Vec<String>) -> Result<(), String> {
    use std::io::Write;
    if file != "catalog-diagnostics" && file != "download-diagnostics" && file != "connect-diagnostics" {
        return Err("disallowed diagnostic file".into());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{file}.log"));
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    for l in lines {
        writeln!(f, "{l}").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Controlled failure: a packaged build that cannot resolve/spawn
            // the gateway sidecar aborts setup with a clear message (Tauri
            // prints it) instead of panicking or silently starting without a
            // gateway. AICONNECT_GATEWAY_BIN remains the explicit escape hatch.
            let child = spawn_gateway(app.handle()).map_err(|e| {
                eprintln!("AI CONNECT gateway startup error: {e}");
                e
            })?;
            app.manage(GatewayProcess(Mutex::new(Some(child))));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            session_save,
            session_load,
            session_clear,
            google_login,
            open_external,
            artifact_stage,
            artifact_finalize,
            artifact_abort,
            install_connector,
            resolve_gateway_url,
            diag,
            // Phase 5R: offline local-data layer (gateway-down only; the
            // frontend gates these on !state.online).
            offline::offline_list_projects,
            offline::offline_create_project,
            offline::offline_get_project,
            offline::offline_rename_project,
            offline::offline_delete_project,
            offline::offline_get_active_project,
            offline::offline_set_active_project,
            offline::offline_clear_active_project,
            offline::offline_list_skills,
            offline::offline_upsert_skill,
            offline::offline_delete_skill,
            offline::offline_project_sessions,
            // Phase C: desktop context bridge (offline, gateway-down only)
            offline::offline_context_list,
            offline::offline_context_get,
            offline::offline_context_recent,
            offline::offline_context_recall,
            offline::offline_context_remember,
            offline::offline_context_link
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(gw) = app.try_state::<GatewayProcess>() {
                    if let Some(mut child) = gw.0.lock().unwrap().take() {
                        // Kill the whole tree: group kill on Unix (-pid,
                        // dash-style, no `--`), taskkill /T on Windows.
                        kill_process_tree(child.id());
                        let _ = child.wait();
                    }
                }
            }
        });
}

// G-1.2 regression: the packaged sidecar name must match Tauri v2's
// externalBin staging (target triple stripped): `gateway.exe` on Windows
// NSIS install root, plain `gateway` elsewhere. A wrong name here silently
// breaks packaged startup.
#[cfg(test)]
mod g12_tests {
    use super::packaged_sidecar_name;

    #[test]
    fn sidecar_name_matches_externalbin_staging() {
        let name = packaged_sidecar_name();
        #[cfg(target_os = "windows")]
        assert_eq!(name, "gateway.exe", "NSIS stages gateway.exe at install root");
        #[cfg(not(target_os = "windows"))]
        assert_eq!(name, "gateway", "unix bundles stage plain gateway");
    }
}

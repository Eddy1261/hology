// B4: Google OAuth error classification for the login UI.
// Distinguishes OAuth-LOCAL failures (browser/listener/exchange — readable
// messages surfaced by the Tauri command) from BACKEND rejections (400/401
// id_token errors) and NETWORK failures. Never fabricates retry values or
// hides the underlying cause.

const OAUTH_LOCAL_MARKERS = [
  "loopback listener",
  "state mismatch",
  "token exchange",
  "no id_token in token response",
  "could not open system browser",
] as const;

export function classifyGoogleError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (!msg) return "Google sign-in failed.";
  // OAuth-local command errors are already user-readable — pass through.
  if (OAUTH_LOCAL_MARKERS.some((m) => msg.includes(m))) return msg;
  // Backend contract: 400 missing id_token, 401 invalid id_token.
  if (msg.includes("id_token") || msg.includes("/auth/google/callback")) {
    return "Google login failed.";
  }
  if (/fetch|network|ECONN|Failed to fetch/i.test(msg)) {
    return "Network error — check your connection and try again.";
  }
  return msg;
}

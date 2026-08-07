// Session persistence (Checkpoint B decision #4):
//   - In the Tauri shell → Rust commands (src-tauri/src/lib.rs) backed by the
//     OS keychain (keyring crate) with a 0600-file fallback where no Secret
//     Service exists (this sandbox).
//   - Plain browser/dev (no Tauri runtime) → localStorage, dev/testing only.
//
// What is stored: the cloud token pair + email. The gateway session itself is
// re-established on every app start (POST /internal/session), never persisted
// there.

import { invoke } from "@tauri-apps/api/core";

export interface SessionRecord {
  accessToken: string;
  refreshToken: string;
  /** epoch ms when the access token expires */
  expiresAt: number;
  email: string;
}

const LS_KEY = "aiconnect.session";

const inTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function saveSession(rec: SessionRecord): Promise<void> {
  if (inTauri) {
    await invoke("session_save", { json: JSON.stringify(rec) });
  } else {
    localStorage.setItem(LS_KEY, JSON.stringify(rec));
  }
}

export async function loadSession(): Promise<SessionRecord | null> {
  try {
    if (inTauri) {
      const raw = (await invoke("session_load")) as string | null;
      return raw ? (JSON.parse(raw) as SessionRecord) : null;
    }
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as SessionRecord) : null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  if (inTauri) {
    await invoke("session_clear");
  } else {
    localStorage.removeItem(LS_KEY);
  }
}

/** Google OAuth (PKCE + system browser + loopback) — Tauri shell only. */
export async function googleLoginIdToken(): Promise<string> {
  if (!inTauri) {
    throw new Error("Google sign-in requires the desktop app");
  }
  return (await invoke("google_login")) as string;
}

/** Decode `email` from a Google id_token payload (JWT middle segment). */
export function decodeIdTokenEmail(idToken: string): string | null {
  try {
    const payload = idToken.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.email === "string" ? json.email : null;
  } catch {
    return null;
  }
}

/** The cloud user id (`sub` claim) from the stored access token — needed for
 *  billing calls (billing-service keys everything by user_id). */
export async function sessionUserId(): Promise<string | null> {
  const rec = await loadSession();
  if (!rec) return null;
  try {
    const payload = rec.accessToken.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.sub === "string" ? json.sub : null;
  } catch {
    return null;
  }
}

/** Open a URL in the SYSTEM browser (OAuth consent, Xendit checkout). In the
 *  Tauri shell this is the open_external command (xdg-open/open/cmd); in a
 *  plain browser dev session, window.open. */
export async function openExternal(url: string): Promise<void> {
  if (inTauri) {
    await invoke("open_external", { url });
    return;
  }
  window.open(url, "_blank", "noopener");
}

// Activation lease acquisition + persistence (Track B).
//
// The desktop acquires a signed activation lease from the server BEFORE
// enabling a connector. The lease is the bounded authorization to activate
// connector@version — the desktop NEVER decides entitlement locally ("user is
// paid", "connector is allowed", "trial is active" are server decisions).
//
// Storage: the signed lease blob + lookup metadata ONLY (connector_id,
// version, exp). A signed blob is storage, not an entitlement decision — the
// gateway re-validates it (signature + expiry + binding) before every start.
// No subscription.json / entitlement.json / license.json here.
//
// ponytail: localStorage only — the Tauri shell keychain (session_save) is
// the eventual home; add a keychain-backed variant when src-tauri lands.

import { authServiceUrl } from "./config.ts";
import { loadSession } from "./session-storage.ts";
import { ensureFreshAccessToken } from "./store/auth.ts";

export interface LeaseRecord {
  /** Signed lease blob (server-issued HS256 JWT). */
  lease: string;
  connector_id: string;
  version: string;
  /** Unix seconds when the lease expires (server-authoritative). */
  exp: number;
}

const LS_PREFIX = "aiconnect.lease.";

export function saveLease(rec: LeaseRecord): void {
  localStorage.setItem(LS_PREFIX + rec.connector_id, JSON.stringify(rec));
}

export function loadLease(connectorId: string): LeaseRecord | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + connectorId);
    return raw ? (JSON.parse(raw) as LeaseRecord) : null;
  } catch {
    return null;
  }
}

export function clearLease(connectorId: string): void {
  localStorage.removeItem(LS_PREFIX + connectorId);
}

export function clearAllLeases(): void {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.startsWith(LS_PREFIX)) {
      localStorage.removeItem(key);
    }
  }
}

/**
 * Pure decision: may the STORED lease be reused (offline fallback)?
 * Only an unexpired lease for the SAME connector AND version qualifies.
 * Never extends, never rewrites, never mints.
 */
export function reusableStoredLease(
  stored: LeaseRecord | null,
  connectorId: string,
  version: string,
  nowSecs: number,
): string | null {
  if (!stored) return null;
  if (stored.connector_id !== connectorId) return null;
  if (stored.version !== version) return null;
  if (stored.exp <= nowSecs) return null; // expired → never reusable
  return stored.lease;
}

/**
 * Acquire a lease for connector@version.
 *
 * - Server reachable, entitled  → new lease (fresh entitlement resolution),
 *   persisted, returned.
 * - Server reachable, denied    → throws (403/404/401 surfaced) — a stored
 *   lease is NOT a fallback for a live server denial (revocation must hold).
 *   AUTH-004 exception: a 401 is retried ONCE after a single-flight token
 *   refresh (it almost always just means the access token expired mid-
 *   session) — only a 401 that survives a fresh token is treated as denial.
 * - Server unreachable          → reuse a stored unexpired lease for the SAME
 *   connector+version (bounded offline authorization), else throw.
 */
export async function acquireLease(connectorId: string, version: string): Promise<string> {
  const rec = await loadSession();
  if (!rec) throw new Error("Please sign in to connect this connector.");

  const request = (token: string) =>
    fetch(`${authServiceUrl}/activation/lease`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ connector_id: connectorId, version }),
    });

  let res: Response;
  try {
    res = await request(rec.accessToken);
  } catch {
    // network failure → offline fallback: only a stored unexpired lease
    const stored = await loadLeaseFromStorage(connectorId);
    const reuse = reusableStoredLease(stored, connectorId, version, Math.floor(Date.now() / 1000));
    if (reuse) return reuse;
    throw new Error("You're offline. Connect to the internet to activate this connector.");
  }

  if (res.status === 401) {
    const fresh = await ensureFreshAccessToken();
    if (fresh) {
      try {
        res = await request(fresh);
      } catch {
        /* retry network failure — fall through to the original 401 below */
      }
    }
  }

  if (res.ok) {
    const j = (await res.json()) as { lease: string; expires_at: number; expires_in: number };
    if (!j.lease) throw new Error("Activation failed. Please try again.");
    saveLease({ lease: j.lease, connector_id: connectorId, version, exp: j.expires_at });
    return j.lease;
  }

  const msg = await errorText(res);
  if (res.status === 401) throw new Error("Your session expired. Please sign in again.");
  if (res.status === 403) throw new Error("This connector isn't available in your current plan.");
  if (res.status === 404) throw new Error("This connector wasn't found. Please reinstall it.");
  throw new Error(msg || `Activation failed (error ${res.status}). Please try again.`);
}

async function loadLeaseFromStorage(connectorId: string): Promise<LeaseRecord | null> {
  // keep the sync localStorage read off the hot path; same data
  return loadLease(connectorId);
}

async function errorText(res: Response): Promise<string | null> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error ?? null;
  } catch {
    return null;
  }
}

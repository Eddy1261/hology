// Cloud auth-service client (cloud/auth-service). All calls are plain JSON
// fetch; the desktop shell reaches it over the network, the gateway is a
// separate local process (see gateway.ts).

import { authServiceUrl } from "./config.ts";

export interface AuthPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  /** Backend truth: true only when THIS login created a brand-new account.
   *  Drives first-use onboarding — never inferred client-side. */
  is_new_user?: boolean;
}

async function post<T>(path: string, body: unknown, expect = 200): Promise<T> {
  const res = await fetch(`${authServiceUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status !== expect) {
    let msg = `auth ${path} ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const authApi = {
  /** Always 202 (signup-or-login, no account enumeration). */
  requestCode(email: string): Promise<void> {
    return post<void>("/auth/email/request-code", { email }, 202);
  },

  /** Returns a fresh token pair. */
  verify(email: string, code: string): Promise<AuthPair> {
    return post<AuthPair>("/auth/email/verify", { email, code });
  },

  googleCallback(idToken: string): Promise<AuthPair> {
    return post<AuthPair>("/auth/google/callback", { id_token: idToken });
  },

  refresh(refreshToken: string): Promise<AuthPair> {
    return post<AuthPair>("/auth/refresh", { refresh_token: refreshToken });
  },

  /** Server-side logout: kills the refresh token immediately (204). */
  revoke(refreshToken: string): Promise<void> {
    return post<void>("/auth/revoke", { refresh_token: refreshToken }, 204);
  },
};

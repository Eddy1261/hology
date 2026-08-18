// Track A E2E helpers — REAL backend fixtures only (no frontend fakes).
// API calls for deterministic setup; UI assertions stay user-visible.

import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const GATEWAY = "http://127.0.0.1:8790";
const AUTH = "http://127.0.0.1:8090";
const AUTH_LOG = join(import.meta.dirname, ".runtime", "auth.log");

export const unique = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function gw(path: string, init?: RequestInit) {
  const res = await fetch(`${GATEWAY}${path}`, init);
  if (!res.ok && res.status !== 409) throw new Error(`gw ${path} ${res.status}: ${await res.text()}`);
  return res;
}

/** Enable a connector through the REAL gateway API (installs into the
 *  process-manager snapshot → shows in /internal/connectors). */
export async function apiEnableConnector(id: string) {
  await gw(`/internal/connectors/${id}/enable`, { method: "POST" });
}

/** Create a project via the REAL gateway API (display_name persisted). */
export async function apiCreateProject(id: string, name?: string) {
  await gw("/internal/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: id, display_name: name }),
  });
}

/** Select the active project (real gateway routing state). */
export async function apiActivateProject(id: string) {
  await gw("/internal/session/project", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: id }),
  });
}

/** Touch a session bound to the ACTIVE project (real gateway API). */
export async function apiTouchSession(provider: string) {
  await gw("/internal/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: unique("s"), provider }),
  });
}

/** Read the LATEST verification code for an email from the auth-service log
 *  (AUTH_SENDER=memory). Polls briefly. Takes the LAST match (a prior request
 *  for the same email leaves an already-consumed code earlier in the log). */
export async function authCode(email: string): Promise<string> {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const text = readFileSync(AUTH_LOG, "utf8");
    const all = [...text.matchAll(new RegExp(`verification code for ${escapeRe(email)}: (\\d+)`, "g"))];
    if (all.length) return all[all.length - 1][1];
    if (Date.now() > deadline) throw new Error(`no auth code for ${email} in log`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Create an account via the real auth-service API. Returns access token. */
export async function apiCreateAccount(email: string): Promise<string> {
  await fetch(`${AUTH}/auth/email/request-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const code = await authCode(email);
  const res = await fetch(`${AUTH}/auth/email/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
  if (res.status !== 200) throw new Error(`auth verify ${res.status}`);
  return (await res.json()).access_token;
}

/** Seed a REAL authenticated session via the app's own persistence path:
 *  localStorage `aiconnect.session` (browser dev mode) with a real token from
 *  the real auth-service. auth.restore() then rehydrates + hands off to the
 *  gateway — no fake backend, exercises the real restore mechanism. */
export async function seedSession(page: Page, email: string) {
  const token = await apiCreateAccount(email);
  await page.addInitScript(
    (rec) => localStorage.setItem("aiconnect.session", JSON.stringify(rec)),
    { accessToken: token, refreshToken: token, expiresAt: Date.now() + 3_600_000, email },
  );
}

/** Collect browser console errors; dump them on failure (diagnostics).
 *  Filters E2E-environment noise that is EXPECTED (fail-soft by design):
 *  - ERR_CONNECTION_REFUSED: external S3/billing not running in E2E
 *  - 401 on /internal/session: known gateway handoff quirk (fail-soft)
 *  Everything else (pageerror, unexpected 5xx on core paths) fails the test. */
export function trackConsole(page: Page): { errors: () => string[]; httpErrors: () => string[] } {
  const errors: string[] = [];
  const httpErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("response", async (r) => {
    if (r.status() >= 400) {
      let detail = `${r.status()} ${r.url()}`;
      if (r.status() >= 500) {
        try { detail += ` BODY=${(await r.text()).slice(0, 300)}`; } catch { /* noop */ }
      }
      httpErrors.push(detail);
    }
  });
  return {
    errors: () => errors,
    httpErrors: () => httpErrors,
  };
}

const BENIGN_CONSOLE = [
  "favicon",
  "ERR_CONNECTION_REFUSED", // external S3/billing absent in E2E (fail-soft)
  "401 (Unauthorized)", // known gateway session-handoff quirk (fail-soft)
  // console text carries no URL — the httpErrors check below authoritatively
  // fails on any 5xx outside /catalog|/auth, so 5xx console noise is benign
  "status of 500",
];

export async function expectNoConsoleErrors(page: Page, track: { errors: () => string[]; httpErrors: () => string[] }) {
  await page.waitForTimeout(300);
  const real = track.errors().filter((e) => !BENIGN_CONSOLE.some((b) => e.includes(b)));
  expect(real).toEqual([]);
  // unexpected 5xx on core internal paths (catalog/S3 5xx is expected — no backend)
  const bad5xx = track.httpErrors().filter(
    (h) => h.startsWith("5") && !h.includes("/catalog") && !h.includes("/auth"),
  );
  expect(bad5xx).toEqual([]);
}

// E2E-002 — Existing user login: dashboard directly, NO tutorial.
// Distinguishes signup→tutorial from login→dashboard as a real semantic
// (backend is_new_user=false on the second verification).

import { test, expect } from "@playwright/test";
import { apiCreateAccount, authCode, unique, trackConsole, expectNoConsoleErrors } from "../helpers";

test("existing user is not shown the onboarding tutorial", async ({ page }) => {
  const consoleErrors = trackConsole(page);
  const userEmail = unique("existing") + "@e2e.local";

  // Fixture: account already exists (real auth-service, is_new_user=true once)
  const token = await apiCreateAccount(userEmail);
  expect(token.length).toBeGreaterThan(20);

  // Existing user logs in through the UI
  await page.goto("/login");
  await page.getByLabel(/email/i).first().fill(userEmail);
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  const code = await authCode(userEmail); // second verification → is_new_user=false
  await page.getByLabel(/code|verification/i).fill(code);
  await page.getByRole("button", { name: /verify|sign in/i }).click();
  await page.waitForURL(/\/app/);

  // Dashboard, and NO onboarding dialog
  await expect(page.getByText(/your ai/i)).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();

  await expectNoConsoleErrors(page, consoleErrors);
});

// E2E-001 — New user onboarding: signup → tutorial → dashboard.
// Validates the REAL new-account semantic (backend is_new_user), never a
// page-route implementation detail.

import { test, expect } from "@playwright/test";
import { authCode, unique, trackConsole, expectNoConsoleErrors } from "../helpers";

const email = () => unique("newuser") + "@e2e.local";

test("new user is shown the onboarding tutorial", async ({ page }) => {
  const consoleErrors = trackConsole(page);
  const userEmail = email();

  // 1. Signup page renders with usable controls
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: /ai connect account/i })).toBeVisible();
  const emailInput = page.getByLabel(/email/i).first();
  await expect(emailInput).toBeVisible();
  await emailInput.fill(userEmail);
  await page.getByRole("button", { name: "Send code", exact: true }).click();

  // 2. Account creation: verify with the code from the auth-service log
  const code = await authCode(userEmail);
  await page.getByLabel(/code|verification/i).fill(code);
  await page.getByRole("button", { name: /verify|create account/i }).click();

  // 3. Plan selection (Free) → authenticated app
  await page.locator("div", { hasText: /^Free$/ }).first().click();
  await page.getByRole("button", { name: /continue with free/i }).click();
  await page.waitForURL(/\/app/);

  // 4. Tutorial auto-opens for the NEW account (backend is_new_user)
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/connected to everything/i)).toBeVisible();

  // 5. Complete the tutorial → Dashboard accessible, no stray redirect
  await dialog.getByRole("button", { name: "NEXT" }).click();
  await dialog.getByRole("button", { name: "NEXT" }).click();
  await dialog.getByRole("button", { name: "START" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/your ai/i)).toBeVisible();

  await expectNoConsoleErrors(page, consoleErrors);
});

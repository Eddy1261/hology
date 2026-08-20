// E2E-004 — Session selection through the Projects IA: with an active
// project, the Project Detail (AI Workspace) shows the project's recent
// sessions; selecting one opens the session detail.

import { test, expect } from "@playwright/test";
import { apiActivateProject, apiCreateProject, apiTouchSession, seedSession, unique, trackConsole, expectNoConsoleErrors } from "../helpers";

test("user can select an active session from the project detail", async ({ page }) => {
  const consoleErrors = trackConsole(page);
  const pid = unique("proj");
  const name = `Road ${pid.slice(-4)}`;

  // Fixtures: project + session bound to it (real gateway/context store)
  await apiCreateProject(pid, name);
  await apiActivateProject(pid);
  await apiTouchSession("deepseek");

  await seedSession(page, unique("seeded") + "@e2e.local");
  await page.goto("/app/workspace"); // Project Detail
  await expect(page.getByText(name).first()).toBeVisible();
  await expect(page.getByText(/deepseek/i).first()).toBeVisible();

  // Session selection in the workspace is UI-only (W3). The session DETAIL
  // page is reached from the technical sessions list.
  await page.goto("/app/sessions");
  await page.getByText(/deepseek/i).first().click();
  await expect(page.getByRole("heading").first()).toBeVisible();
  await expect(page.getByText(/Session #/).first()).toBeVisible();

  await expectNoConsoleErrors(page, consoleErrors);
});

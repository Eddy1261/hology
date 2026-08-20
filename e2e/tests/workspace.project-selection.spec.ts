// E2E-003 — Projects IA (P5R): Project List → create (ID required, name
// optional) → project appears → select opens Project Detail (AI Workspace).
// Also asserts the approved navbar (Projects/MCP Collection/Skills/Help/
// Settings) and the removed destinations (AI Workspace/Subscription/Account)
// are absent. Create Project is NOT shown on the detail page.

import { test, expect } from "@playwright/test";
import { seedSession, unique, trackConsole, expectNoConsoleErrors } from "../helpers";

test("user can create and open a project via the Project List", async ({ page }) => {
  const consoleErrors = trackConsole(page);
  const pid = unique("proj");

  await seedSession(page, unique("seeded") + "@e2e.local");
  await page.goto("/app/projects");
  await expect(page.getByRole("heading", { name: /projects/i })).toBeVisible();

  // Navbar: approved destinations present, removed destinations absent
  const nav = page.getByRole("navigation");
  await page.locator('button[aria-label="Open menu"]').click();
  for (const label of ["Home", "Projects", "MCP Collection", "Skills", "Help", "Settings"]) {
    await expect(nav.getByRole("button", { name: label, exact: true })).toBeVisible();
  }
  for (const label of ["AI Workspace", "Subscription", "Account"]) {
    await expect(nav.getByRole("button", { name: label, exact: true })).toHaveCount(0);
  }
  // Close the drawer via the Projects nav item (we are already on it).
  await nav.getByRole("button", { name: "Projects", exact: true }).click();
  await expect(page.locator('button[aria-label="Open menu"]')).toBeVisible();

  // Create project: Project ID required, Display Name optional (empty OK)
  await page.getByRole("button", { name: /new project/i }).first().click();
  const idInput = page.getByRole("textbox", { name: /project id/i });
  await idInput.fill(pid);
  // leave Display Name EMPTY — must not prevent creation
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByText(pid).first()).toBeVisible();
  await expect(page.getByText("Display name is optional").first()).toBeHidden();

  // Select the project → Project Detail (AI Workspace) opens. The display
  // name is gateway-derived; match the row by its project id text.
  await page.getByRole("button", { name: /open project/i }).filter({ hasText: pid }).click();
  await page.waitForURL(/\/app\/workspace/);
  await expect(page.getByText(pid).first()).toBeVisible();

  // Create Project is NOT available on the detail page
  await expect(page.getByRole("button", { name: /new project/i })).toHaveCount(0);

  await expectNoConsoleErrors(page, consoleErrors);
});

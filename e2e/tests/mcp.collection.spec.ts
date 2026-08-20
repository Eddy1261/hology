// E2E-005 — MCP Collection: catalog renders, connector metadata shown,
// details navigation works. Uses the REAL catalog/connector boundary.

import { test, expect } from "@playwright/test";
import { seedSession, unique, trackConsole, expectNoConsoleErrors } from "../helpers";

test("user can open MCP Collection and browse the connector catalog", async ({ page }) => {
  const consoleErrors = trackConsole(page);

  await seedSession(page, unique("seeded") + "@e2e.local");
  // Fixtures: two installed connectors seeded by global-setup (CP22 layout,
  // discovered by scan_installed at gateway boot). Enable is intentionally
  // NOT exercised here: activation now requires gateway session + activation
  // lease + C-10 entry-SHA integrity, which is beyond a listing test's scope
  // (and the E2E auth stack has no entitlements-service).
  await page.goto("/app");
  await page.locator("button[aria-label=\"Open menu\"]").click();
  await page.getByRole("button", { name: "MCP Collection", exact: true }).click();
  await expect(page.getByRole("heading", { name: /mcp collection/i })).toBeVisible();

  // P5R: Sync must give a VISIBLE result — one of the honest states
  // (up to date / offline / catalog unavailable), never silence.
  await page.getByRole("button", { name: "Sync MCP state" }).click();
  await expect(
    page.locator('[role="status"]').filter({ hasText: /up to date|offline|catalog unavailable/i }).first(),
  ).toBeVisible();

  // Catalog renders connector cards with metadata (real manifests exist)
  await expect(page.getByText(/arcgis|autocad|qgis|revit/i).first()).toBeVisible();
  const card = page.locator("button, a", { hasText: /arcgis/i }).first();
  await expect(card).toBeVisible();

  // Connector details navigation works (view guide path)
  await card.click();
  await expect(page).toHaveURL(/\/app\/mcp-guide|\/app\/mcp\//);

  await expectNoConsoleErrors(page, consoleErrors);
});

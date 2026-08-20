// E2E — shell scroll regression (min-h-0 flex fix): the AppShell main must
// be constrained inside the panel and the page's inner scroll container must
// actually scroll (no clipping).

import { test, expect } from "@playwright/test";
import { seedSession, unique, trackConsole, expectNoConsoleErrors } from "../helpers";

test("scroll container is constrained inside the panel and scrolls internally", async ({ page }) => {
  const consoleErrors = trackConsole(page);
  await seedSession(page, unique("scroll") + "@e2e.local");
  await page.goto("/app/mcp");
  await expect(page.getByRole("heading", { name: /mcp collection/i })).toBeVisible();

  // AppShell main must be constrained to the panel (min-h-0 fix)
  const m = await page.evaluate(() => {
    const main = document.querySelector("main");
    const panel = document.querySelector(".ac-panel");
    return {
      overflowY: getComputedStyle(main).overflowY,
      mainBottom: main.getBoundingClientRect().bottom,
      panelBottom: panel.getBoundingClientRect().bottom,
    };
  });
  expect(m.overflowY).toBe("auto");
  expect(m.mainBottom).toBeLessThanOrEqual(m.panelBottom + 1);

  // The MCP page's INNER scroll container must actually scroll (not clip)
  const inner = await page.evaluate(() => {
    const el = document.querySelector("main .overflow-y-auto") as HTMLElement;
    return el
      ? { clientH: el.clientHeight, scrollH: el.scrollHeight, overflowY: getComputedStyle(el).overflowY }
      : null;
  });
  expect(inner).not.toBeNull();
  expect(inner.overflowY).toBe("auto");
  if (inner.scrollH > inner.clientH) {
    await page.mouse.move(200, 300);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(300);
    const st = await page.evaluate(
      () => (document.querySelector("main .overflow-y-auto") as HTMLElement).scrollTop,
    );
    expect(st).toBeGreaterThan(0);
  }

  await expectNoConsoleErrors(page, consoleErrors);
});

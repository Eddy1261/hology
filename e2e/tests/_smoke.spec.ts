// Infrastructure smoke: the three servers start and the browser can load the
// Vite origin. No auth, no UI flow — just topology verification.
import { test, expect } from "@playwright/test";

test("three-server topology: browser reaches the Vite origin", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login|\//);
  // Vite origin serves the app shell (login/landing text)
  await expect(page.locator("body")).toContainText(/sign|login|connect/i);
  // auth-service is reachable through the proxy
  const authRes = await page.request.post("/auth/email/request-code", {
    data: { email: "smoke@e2e.local" },
  });
  expect(authRes.status()).toBe(202);
  // gateway is reachable through the proxy
  const gwRes = await page.request.get("/internal/projects");
  expect(gwRes.status()).toBe(200);
});

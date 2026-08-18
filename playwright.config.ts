import { defineConfig } from "@playwright/test";
import { join } from "node:path";

// Track A — Browser E2E foundation.
// Real stack, no frontend fakes:
//   - auth-service  (cloud/auth-service, AUTH_SENDER=memory → codes in log)
//   - gateway       (apps/gateway, loopback internal API + context store)
//   - vite preview  (built with VITE_GATEWAY_URL= VITE_AUTH_SERVICE_URL= so
//                    the app talks SAME-ORIGIN via the preview proxy — no CORS)
// Data dir is ephemeral; tests use unique ids/emails (no order dependence).
// All server paths derive from THIS config's location — cwd-independent.

const PORT = 8443;
const GATEWAY_PORT = 8790;
const DESKTOP = import.meta.dirname;
const REPO = join(DESKTOP, "../..");
const GATEWAY_BIN = join(REPO, "apps/gateway/target/debug/gateway");
const CONNECTORS_DIR = join(REPO, "connectors");

export default defineConfig({
  testDir: "./e2e/tests",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // shared gateway + auth log → serialize for determinism
  workers: 1,
  retries: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/.runtime/report" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "bash e2e/scripts/start-auth.sh",
      port: 8090,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      // Fresh data dir per run: the projects registry/context-store otherwise
      // accumulate every run's fixtures and the project list becomes
      // unmanageable (pollution across runs). Wipe BEFORE the gateway starts.
      command: `rm -rf ${join(DESKTOP, "e2e/.runtime/data")} && AICONNECT_DATA_DIR=${join(DESKTOP, "e2e/.runtime/data")} JWT_SECRET=e2e-secret GATEWAY_ADDR=127.0.0.1:${GATEWAY_PORT} CONNECTORS_DIR=${CONNECTORS_DIR} ${GATEWAY_BIN}`,
      port: GATEWAY_PORT,
      reuseExistingServer: false,
      timeout: 30_000,
      cwd: "./",
    },
    {
      command: "VITE_GATEWAY_URL= VITE_AUTH_SERVICE_URL= npm run build:e2e && npm run preview -- --port 8443 --strictPort",
      port: PORT,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});

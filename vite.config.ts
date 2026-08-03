import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import fs from "node:fs";

function resolveGatewayPort(): string {
  // 1. Explicit env overrides win
  if (process.env.GATEWAY_PORT) return process.env.GATEWAY_PORT;
  if (process.env.GATEWAY_ADDR) {
    const match = process.env.GATEWAY_ADDR.match(/:(\d+)$/);
    if (match) return match[1];
  }

  // 2. Read from runtime gateway-port.json written by the running gateway sidecar
  const candidates = [
    process.env.AICONNECT_DATA_DIR && path.join(process.env.AICONNECT_DATA_DIR, "gateway-port.json"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "aiconnect", "gateway-port.json"),
    process.env.HOME && path.join(process.env.HOME, ".local", "share", "aiconnect", "gateway-port.json"),
    process.env.TEMP && path.join(process.env.TEMP, "aiconnect", "gateway-port.json"),
  ].filter(Boolean) as string[];

  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, "utf-8"));
        if (data && data.port) {
          return String(data.port);
        }
      }
    } catch {
      // Ignore read/parse errors
    }
  }

  // 3. Fallback default
  return "8788";
}

function getGatewayTarget(): string {
  return `http://127.0.0.1:${resolveGatewayPort()}`;
}

// Vite config — https://vitejs.dev/config/
export default defineConfig(() => {
  // Track A E2E: same-origin proxy so the browser app reaches the REAL
  // auth-service + gateway without CORS (built with VITE_GATEWAY_URL= and
  // VITE_AUTH_SERVICE_URL= for relative URLs).
  const gatewayProxyConfig = {
    target: getGatewayTarget(),
    router: () => getGatewayTarget(),
    changeOrigin: true,
  };

  return {
    base: "./",
    build: {
      sourcemap: false,
      minify: true,
    },
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      host: "0.0.0.0",
      port: 8443,
      strictPort: true,
      proxy: {
        "/auth": "http://127.0.0.1:8090",
        "/internal": gatewayProxyConfig,
        "/mcp": gatewayProxyConfig,
        "/health": gatewayProxyConfig,
      },
    },
    preview: {
      host: "0.0.0.0",
      port: 8443,
      proxy: {
        "/auth": "http://127.0.0.1:8090",
        "/internal": gatewayProxyConfig,
        "/mcp": gatewayProxyConfig,
        "/health": gatewayProxyConfig,
      },
    },
  };
});

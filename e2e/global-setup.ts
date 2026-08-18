// Track A global setup — runs BEFORE the webServers start.
// Seeds the gateway's CP22 installed state (real format, read by
// installed::scan_installed) so /internal/connectors has entries for the
// connector-collection E2E. Uses the REAL connector sources; no fakes.
//
// The seed must satisfy the CURRENT scanner contract exactly:
//   - CP18-valid manifest (platform + manifest_schema_version +
//     package_format_version required — source runtime manifests alone fail
//     scan_installed with InvalidManifest)
//   - FULL .aiconnect-install.json (package_sha256, installed_at_ms,
//     package_format_version, and entry_sha256 — C-10 requires the recorded
//     entry-file SHA; a legacy seed without it makes enable fail closed
//     with ARTIFACT_INTEGRITY_UNAVAILABLE)
//   - platform_os/arch matching the HOST (PlatformIncompatible otherwise)

import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const DESKTOP = join(import.meta.dirname, ".."); // e2e/ → apps/desktop
const REPO = join(DESKTOP, "../..");
const CONNECTORS_DIR = join(REPO, "connectors");
const DATA = join(DESKTOP, "e2e/.runtime/data"); // must match playwright.config webServer
const INSTALL_ROOT = join(DATA, "connectors");

function findManifest(id: string): string | null {
  const walk = (dir: string): string | null => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        const hit = walk(p);
        if (hit) return hit;
      } else if (e.name === "manifest.json") {
        try {
          const m = JSON.parse(readFileSync(p, "utf8"));
          if (m.id === id) return p;
        } catch { /* skip */ }
      }
    }
    return null;
  };
  return walk(CONNECTORS_DIR);
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Recursive basename match inside a dir (source-repo layout ≠ package layout). */
function findFileByName(dir: string, name: string): string | null {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      const hit = findFileByName(p, name);
      if (hit) return hit;
    } else if (e.name === name) {
      return p;
    }
  }
  return null;
}

/** Host platform in the scanner's vocabulary (linux|windows|macos × x64|arm64|x86). */
function hostPlatform(): { os: string; arch: string } {
  const os = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return { os, arch };
}

/**
 * Copy a connector source into the CP22 installed layout and write scanner-
 * compliant metadata:
 *   connectors/<id>/active.json
 *   connectors/<id>/<version>/{manifest.json, .aiconnect-install.json, files}
 *
 * The version-dir manifest.json is AUGMENTED to CP18 shape (source manifests
 * are runtime-only): platform (host), manifest_schema_version, and
 * package_format_version are required by scan_installed's parse_manifest.
 * entry_sha256 is the SHA of the REAL entry file copied from source.
 */
function seedConnector(id: string) {
  const manifestPath = findManifest(id);
  if (!manifestPath) throw new Error(`no manifest for ${id}`);
  const source = JSON.parse(readFileSync(manifestPath, "utf8"));
  const srcDir = join(manifestPath, "..");
  const verDir = join(INSTALL_ROOT, id, String(source.version));
  mkdirSync(verDir, { recursive: true });
  cpSync(srcDir, verDir, { recursive: true, force: true });

  // entry file must exist in the seeded tree (it is the file C-10 binds).
  // Source repos often differ from the packaged layout (e.g. arcgis entry
  // `connector.py` lives at `src/connector.py`) — resolve by basename and
  // materialize it at the manifest-relative path, like a real package.
  const entryRel = String(source.entry ?? "");
  let entryFile = join(verDir, entryRel);
  if (!existsSync(entryFile)) {
    const found = findFileByName(verDir, entryRel.split("/").pop() ?? "");
    if (!found) throw new Error(`seed ${id}: entry ${entryRel} missing in source`);
    mkdirSync(join(verDir, entryRel.split("/").slice(0, -1).join("/")) || verDir, { recursive: true });
    writeFileSync(entryFile, readFileSync(found));
  }

  const { os, arch } = hostPlatform();
  const c18Manifest = {
    id: source.id,
    name: source.name ?? source.id,
    version: String(source.version),
    description: source.description ?? "",
    publisher: source.publisher ?? "",
    manifest_schema_version: 1,
    package_format_version: 1,
    min_app_version: source.min_app_version ?? "",
    platform: { os, arch },
    runtime: source.runtime ?? "python",
    entry: entryRel,
    stdio: source.stdio ?? false,
    entitlement_tier: source.entitlement_tier ?? "free",
    token_env_var: source.token_env_var ?? "MCP_LICENSE_TOKEN",
    port_env_var: source.port_env_var ?? "MCP_PORT",
  };

  const entryBytes = readFileSync(entryFile);
  writeFileSync(join(verDir, "manifest.json"), JSON.stringify(c18Manifest, null, 2));
  writeFileSync(join(INSTALL_ROOT, id, "active.json"), JSON.stringify({ connector_id: id, version: String(source.version) }));
  writeFileSync(join(verDir, ".aiconnect-install.json"), JSON.stringify({
    connector_id: id,
    version: String(source.version),
    package_sha256: sha256(entryBytes),
    platform_os: os,
    platform_arch: arch,
    installed_at_ms: Date.now(),
    package_format_version: 1,
    entry_sha256: sha256(entryBytes),
  }, null, 2));
  console.log(`[global-setup] seeded installed connector ${id}@${source.version} (${os}-${arch}, entry ${entryRel})`);
}

export default function globalSetup() {
  if (!existsSync(join(DESKTOP, ".runtime"))) mkdirSync(join(DESKTOP, ".runtime"), { recursive: true });
  // NOTE: playwright launches webServers BEFORE globalSetup — the gateway is
  // ALREADY RUNNING on this data dir. NEVER rmSync DATA here (it would wipe
  // the gateway's live projects registry / store mid-flight). The seed
  // OVERWRITES the installed layout in place (cpSync force + writeFileSync),
  // which is sufficient to refresh manifests/metadata between runs.
  if (!existsSync(DATA)) mkdirSync(DATA, { recursive: true });
  seedConnector("arcgis-mcp");
  seedConnector("autocad-mcp");
}

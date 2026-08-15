// MCP Collection view model — merges the REMOTE catalog (what can be
// installed) with LOCAL gateway state (what is installed/running) into one
// presentation model. Pure functions, unit-tested without a browser.

import type { ConnectorInfo } from "./gateway.ts";
import type { MCPCatalogItem } from "./catalog.ts";

export type CollectionStatus =
  | "available" // catalog only, not installed
  | "installing" // reserved for the future installer
  | "disconnected" // installed, stopped (gateway status off)
  | "connecting" // gateway starting
  | "connected" // gateway running
  | "error" // gateway crashed
  | "unlisted"; // installed locally but absent from the remote catalog

export interface MCPCollectionItem {
  /** Remote metadata. null → local-only connector (not in catalog). */
  catalog: MCPCatalogItem | null;
  /** Local gateway state. null → remote-only (not installed). */
  local: ConnectorInfo | null;
  status: CollectionStatus;
  entitled: boolean;
  exposed: boolean;
  hostState: string | null;
  publicUrl: string | null;
  /** catalog.version newer than installed version (never auto-updated). */
  updateAvailable: boolean;
}

/** Minimal numeric semver compare: "1.2.0" vs "1.10.0" → -1. Non-numeric
 *  segments compare as 0. Invalid input → 0 (equal, never a false update). */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = (a ?? "").split(".").map((s) => parseInt(s, 10) || 0);
  const pb = (b ?? "").split(".").map((s) => parseInt(s, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

function statusOf(local: ConnectorInfo | null): CollectionStatus {
  if (!local) return "available";
  switch (local.status) {
    case "off":
      return "disconnected";
    case "starting":
      return "connecting";
    case "running":
      return "connected";
    case "crashed":
      return "error";
    default:
      return "disconnected";
  }
}

/** Merge rule (spec §11/§12): catalog defines installability, gateway defines
 *  local truth. Locally-installed connectors NOT in the catalog stay visible
 *  as `unlisted` — the gateway is authoritative for installed software. */
export function buildCollection(
  catalog: MCPCatalogItem[] | null,
  local: ConnectorInfo[],
): MCPCollectionItem[] {
  const items: MCPCollectionItem[] = [];
  const localById = new Map(local.map((c) => [c.id, c]));

  for (const c of catalog ?? []) {
    const loc = localById.get(c.id) ?? null;
    items.push({
      catalog: c,
      local: loc,
      status: statusOf(loc),
      entitled: loc?.entitled ?? false,
      exposed: loc?.exposed ?? false,
      hostState: loc?.host_state ?? null,
      publicUrl: loc?.public_url ?? null,
      updateAvailable: loc ? compareSemver(c.version, loc.version) > 0 : false,
    });
  }

  // Installed connectors absent from the remote catalog (unpublished/removed/
  // older versions) must remain visible.
  for (const loc of local) {
    if (!catalog?.some((c) => c.id === loc.id)) {
      items.push({
        catalog: null,
        local: loc,
        status: "unlisted",
        entitled: loc.entitled,
        exposed: loc.exposed,
        hostState: loc.host_state,
        publicUrl: loc.public_url,
        updateAvailable: false,
      });
    }
  }

  return items;
}

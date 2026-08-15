// Remote MCP catalog client (S3-hosted catalog.json). Metadata ONLY — what
// MCPs exist and can be installed. Never the local installation/process
// state (that is the Gateway's /internal/connectors job).
//
// Security stance: this is UNTRUSTED metadata. Nothing from here is ever
// executed or stored as a secret — the catalog only describes installable
// packages; installation has its own verification step.

import { catalogTtlHours, catalogUrl } from "./config.ts";
import { catlog, catlogErr } from "./catdiag.ts";
import { loadSession } from "./session-storage.ts";

export interface MCPCatalogItem {
  id: string;
  name: string;
  version: string;
  description: string;
  logo_url?: string;
  category?: string;
  tags?: string[];
  license?: string;
  package_url: string;
  package_size_bytes?: number;
  sha256?: string;
  platforms?: string[];
  runtime?: string;
  min_app_version?: string;
  publisher?: string;
  updated_at?: string;
  connector_family?: string;
}

export interface CatalogIndex {
  schema_version: number;
  generated_at: string;
  connectors: MCPCatalogItem[];
}

/** Catalog availability — distinct from "fetched but empty". */
export type CatalogState =
  | "not-configured" // no VITE_MCP_CATALOG_URL
  | "loading"
  | "ok" // fresh
  | "stale" // cached, refresh pending/failed
  | "unavailable" // no cache AND fetch failed
  | "empty"; // fetched OK but zero connectors

interface CatalogCacheEntry {
  fetchedAt: number; // epoch ms
  index: CatalogIndex;
}

const CACHE_KEY = "aiconnect.catalog.v1";

export function catalogTtlMs(): number {
  return catalogTtlHours * 3600 * 1000;
}

function readCache(): CatalogCacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CatalogCacheEntry) : null;
  } catch {
    return null;
  }
}

function writeCache(entry: CatalogCacheEntry): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    /* storage full/blocked — cache is best-effort */
  }
}

/** Fetch + minimal-validate the remote index. Throws on malformed/network.
 *  `url` override is for tests; default = configured catalog URL.
 *  G-diagnostic: logs every step + preserves the real exception (never
 *  swallows it) so a packaged run shows the exact failure. */
export async function fetchCatalogRemote(url?: string): Promise<CatalogIndex> {
  const u = url ?? catalogUrl;
  if (!u) {
    console.error("[catalog] not configured (VITE_MCP_CATALOG_URL)");
    void catlog("[catalog] not configured (VITE_MCP_CATALOG_URL)");
    throw new Error("catalog not configured (VITE_MCP_CATALOG_URL)");
  }
  void catlog(`[catalog] configured URL = ${u}`);
  void catlog(`[catalog] fetch started`);
  // XCUT-009: the marketplace gates catalog reads behind authenticate()
  // (marketplace:read) — an Accept header alone always 401s.
  const rec = await loadSession();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (rec?.accessToken) headers.Authorization = `Bearer ${rec.accessToken}`;
  let res: Response;
  try {
    res = await fetch(u, { headers });
  } catch (err) {
    logErr("[catalog] fetch threw (network/CSP/CORS block?)", err);
    throw err;
  }
  void catlog(`[catalog] response status = ${res.status}`);
  void catlog(`[catalog] response ok = ${res.ok}`);
  void catlog(`[catalog] response url = ${res.url}`);
  void catlog(`[catalog] content-type = ${res.headers.get("content-type")}`);
  if (!res.ok) {
    const e = new Error(`catalog ${res.status}`);
    logErr(`[catalog] non-2xx`, e);
    throw e;
  }
  void catlog(`[catalog] JSON parse started`);
  let json: Partial<CatalogIndex>;
  try {
    json = (await res.json()) as Partial<CatalogIndex>;
  } catch (err) {
    logErr("[catalog] JSON parse failed", err);
    throw err;
  }
  if (!Array.isArray(json.connectors)) {
    const e = new Error("catalog malformed: missing connectors array");
    logErr("[catalog] malformed", e);
    throw e;
  }
  void catlog(`[catalog] connector count = ${json.connectors.length}`);
  return json as CatalogIndex;
}

function logErr(prefix: string, err: unknown): void {
  void catlogErr(prefix, err);
}

/**
 * Load the catalog: cache-first, genuinely.
 *
 *   fresh cache  → return cached, state "ok", NO network request
 *   stale cache  → return cached IMMEDIATELY (state "stale") and trigger a
 *                  background refresh; on success `onRefresh(index, state)`
 *                  fires so the caller can update its state — the caller
 *                  never waits on S3 for stale data
 *   no cache     → await the remote fetch (ok/empty on success, unavailable
 *                  on failure)
 *
 * Never throws. Outage with cached data → stale/ok, NEVER "empty".
 */
export async function loadCatalog(
  url?: string,
  onRefresh?: (index: MCPCatalogItem[], state: CatalogState) => void,
): Promise<{
  index: MCPCatalogItem[];
  state: CatalogState;
}> {
  const u = url ?? catalogUrl;
  if (!u) return { index: [], state: "not-configured" };

  const cached = readCache();
  const fresh = cached && Date.now() - cached.fetchedAt < catalogTtlMs();
  const cacheLabel = !cached
    ? "none"
    : fresh
      ? "hit"
      : "stale";
  console.info(
    `[catalog] cache state = ${cacheLabel}${
      cached ? ` (age_ms=${Date.now() - cached.fetchedAt}, items=${cached.index.connectors.length})` : ""
    }`,
  );

  if (fresh && cached) {
    void catlog(`[catalog] state transition -> ok (cache hit, items=${cached.index.connectors.length})`);
    return { index: cached.index.connectors, state: "ok" };
  }

  if (cached) {
    // Stale cache: expose it NOW, refresh in the background. The UI must not
    // wait for S3 when stale metadata is already available.
    // ponytail: no refresh-deduplication — N concurrent loadCatalog() calls
    // with a stale cache each start a background refresh (same result, wasted
    // requests). Current usage (startup + page mount + login) makes this a
    // non-issue; add an in-flight refresh guard when call sites multiply.
    void (async () => {
      try {
        const index = await fetchCatalogRemote(u);
        writeCache({ fetchedAt: Date.now(), index });
        void catlog(`[catalog] state transition -> ${index.connectors.length === 0 ? "empty" : "ok"} (bg refresh, items=${index.connectors.length})`);
        onRefresh?.(
          index.connectors,
          index.connectors.length === 0 ? "empty" : "ok",
        );
      } catch (err) {
        logErr("[catalog] bg refresh failed (stale cache kept)", err);
        /* S3 down with stale cache — keep showing stale data */
      }
    })();
    void catlog(`[catalog] state transition -> stale (items=${cached.index.connectors.length})`);
    return { index: cached.index.connectors, state: "stale" };
  }

  // No cache: block on the fetch.
  try {
    const index = await fetchCatalogRemote(u);
    writeCache({ fetchedAt: Date.now(), index });
    const st = index.connectors.length === 0 ? "empty" : "ok";
    void catlog(`[catalog] state transition -> ${st} (items=${index.connectors.length})`);
    return {
      index: index.connectors,
      state: st,
    };
  } catch (err) {
    logErr("[catalog] load failed -> unavailable", err);
    void catlog(`[catalog] state transition -> unavailable`);
    return { index: [], state: "unavailable" };
  }
}

/** Force a refresh, falling back to cache on failure. */
export async function refreshCatalog(
  url?: string,
): Promise<{
  index: MCPCatalogItem[];
  state: CatalogState;
}> {
  const u = url ?? catalogUrl;
  if (!u) return { index: [], state: "not-configured" };
  void catlog(`[catalog] refresh started (URL = ${u})`);
  try {
    const index = await fetchCatalogRemote(u);
    writeCache({ fetchedAt: Date.now(), index });
    const st = index.connectors.length === 0 ? "empty" : "ok";
    void catlog(`[catalog] refresh -> ${st} (items=${index.connectors.length})`);
    return { index: index.connectors, state: st };
  } catch (err) {
    logErr("[catalog] refresh failed", err);
    const cached = readCache();
    if (cached) {
      void catlog(`[catalog] refresh fallback -> stale (items=${cached.index.connectors.length})`);
      return { index: cached.index.connectors, state: "stale" };
    }
    void catlog(`[catalog] refresh -> unavailable`);
    return { index: [], state: "unavailable" };
  }
}

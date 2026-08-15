// Catalog client + cache tests. Run: pnpm test (node --experimental-strip-types).
// No browser, no live S3 — fetch/localStorage are mocked.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  fetchCatalogRemote,
  loadCatalog,
  refreshCatalog,
  catalogTtlMs,
} from "./catalog.ts";

// Node has no localStorage — minimal in-memory polyfill (catalog cache).
const lsStore = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => lsStore.get(k) ?? null,
  setItem: (k: string, v: string) => void lsStore.set(k, v),
  removeItem: (k: string) => void lsStore.delete(k),
  clear: () => lsStore.clear(),
};

const TEST_URL = "https://example.test/catalog.json";

const SAMPLE: CatalogIndexShape = {
  schema_version: 1,
  generated_at: "2026-08-13T00:00:00Z",
  connectors: [
    {
      id: "qgis",
      name: "QGIS",
      version: "1.0.0",
      description: "QGIS MCP connector",
      category: "geospatial",
      package_url: "https://bucket/catalog/connectors/qgis.zip",
    },
  ],
};

// Local structural type (avoids importing import.meta-dependent config at test time)
interface CatalogIndexShape {
  schema_version: number;
  generated_at: string;
  connectors: {
    id: string;
    name: string;
    version: string;
    description: string;
    category?: string;
    package_url: string;
  }[];
}

function mockFetch(impl: (url: string) => Promise<Response>): void {
  globalThis.fetch = impl as typeof fetch;
}

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function failResponse(status: number): Response {
  return new Response("nope", { status });
}

test("fetchCatalogRemote parses a valid index", async () => {
  mockFetch(async () => okResponse(SAMPLE));
  const idx = await fetchCatalogRemote(TEST_URL);
  assert.equal(idx.connectors.length, 1);
  assert.equal(idx.connectors[0].id, "qgis");
});

test("fetchCatalogRemote throws on malformed (missing connectors)", async () => {
  mockFetch(async () => okResponse({ schema_version: 1 }));
  await assert.rejects(fetchCatalogRemote(TEST_URL), /malformed/);
});

test("fetchCatalogRemote throws on HTTP error", async () => {
  mockFetch(async () => failResponse(503));
  await assert.rejects(fetchCatalogRemote(TEST_URL), /503/);
});

test("fetchCatalogRemote throws when not configured", async () => {
  // catalogUrl undefined → client throws before fetch
  mockFetch(async () => {
    throw new Error("fetch must not be called");
  });
  await assert.rejects(fetchCatalogRemote(), /not configured/);
});

test("loadCatalog caches fresh result and reuses it (no second fetch)", async () => {
  localStorage.clear();
  let calls = 0;
  mockFetch(async () => {
    calls++;
    return okResponse(SAMPLE);
  });

  const first = await loadCatalog(TEST_URL);
  assert.equal(first.state, "ok");
  assert.equal(first.index.length, 1);
  assert.equal(calls, 1);

  // second load within TTL → served from cache, no fetch
  const second = await loadCatalog(TEST_URL);
  assert.equal(second.state, "ok");
  assert.equal(calls, 1);
});

test("loadCatalog falls back to cache when stale and S3 unavailable", async () => {
  localStorage.clear();
  mockFetch(async () => okResponse(SAMPLE));
  await loadCatalog(TEST_URL); // populate cache

  // force staleness by rewriting the cache timestamp
  const entry = JSON.parse(localStorage.getItem("aiconnect.catalog.v1")!);
  entry.fetchedAt = Date.now() - catalogTtlMs() - 60_000;
  localStorage.setItem("aiconnect.catalog.v1", JSON.stringify(entry));

  mockFetch(async () => {
    throw new Error("s3 down");
  });
  const r = await loadCatalog(TEST_URL);
  assert.equal(r.state, "stale");
  assert.equal(r.index.length, 1); // cached still rendered
});

test("loadCatalog with no cache and S3 down → unavailable, not empty", async () => {
  localStorage.clear();
  mockFetch(async () => {
    throw new Error("s3 down");
  });
  const r = await loadCatalog(TEST_URL);
  assert.equal(r.state, "unavailable");
  assert.equal(r.index.length, 0);
});

test("loadCatalog empty catalog → state empty (distinct from unavailable)", async () => {
  localStorage.clear();
  mockFetch(async () => okResponse({ schema_version: 1, generated_at: "x", connectors: [] }));
  const r = await loadCatalog(TEST_URL);
  assert.equal(r.state, "empty");
});

test("refreshCatalog force-fetches and replaces cache", async () => {
  localStorage.clear();
  mockFetch(async () => okResponse(SAMPLE));
  const r = await refreshCatalog(TEST_URL);
  assert.equal(r.state, "ok");
  const cached = JSON.parse(localStorage.getItem("aiconnect.catalog.v1")!);
  assert.equal(cached.index.connectors[0].id, "qgis");
});

test("refreshCatalog falls back to stale cache on failure", async () => {
  localStorage.clear();
  mockFetch(async () => okResponse(SAMPLE));
  await loadCatalog(TEST_URL);
  mockFetch(async () => {
    throw new Error("down");
  });
  const r = await refreshCatalog(TEST_URL);
  assert.equal(r.state, "stale");
  assert.equal(r.index.length, 1);
});

test("stale cache → IMMEDIATE cached render + background refresh replaces later", async () => {
  localStorage.clear();
  mockFetch(async () => okResponse(SAMPLE));
  await loadCatalog(TEST_URL); // populate cache

  // force staleness
  const entry = JSON.parse(localStorage.getItem("aiconnect.catalog.v1")!);
  entry.fetchedAt = Date.now() - catalogTtlMs() - 60_000;
  localStorage.setItem("aiconnect.catalog.v1", JSON.stringify(entry));

  // delayed remote fetch: held open until the test releases it
  let releaseFetch!: () => void;
  const gate = new Promise<void>((r) => {
    releaseFetch = r;
  });
  let fetchStarted = false;
  mockFetch(async () => {
    fetchStarted = true;
    await gate;
    return okResponse({ ...SAMPLE, generated_at: "2026-08-14T00:00:00Z" });
  });

  const updates: { index: unknown[]; state: string }[] = [];
  const r = await loadCatalog(TEST_URL, (index, state) => {
    updates.push({ index, state });
  });

  // IMMEDIATE: stale cache available before S3 completed
  assert.equal(r.state, "stale");
  assert.equal(r.index.length, 1);
  assert.equal(fetchStarted, true, "background refresh must have started");
  assert.equal(updates.length, 0, "caller must NOT wait for S3 to render stale data");

  // release S3 → background refresh lands and replaces
  releaseFetch();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(updates.length, 1);
  assert.equal(updates[0].state, "ok");
  const cached = JSON.parse(localStorage.getItem("aiconnect.catalog.v1")!);
  assert.equal(cached.index.generated_at, "2026-08-14T00:00:00Z");
});

test("fresh cache + S3 down → cached catalog, state ok, no fetch", async () => {
  localStorage.clear();
  mockFetch(async () => okResponse(SAMPLE));
  await loadCatalog(TEST_URL);
  let fetchCalled = false;
  mockFetch(async () => {
    fetchCalled = true;
    throw new Error("s3 down");
  });
  const r = await loadCatalog(TEST_URL);
  assert.equal(r.state, "ok");
  assert.equal(r.index.length, 1);
  assert.equal(fetchCalled, false);
});

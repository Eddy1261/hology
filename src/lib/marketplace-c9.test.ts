
// Track C-9 — path safety, kind separation, fs failure, duplicate guard.
// Supplement: the rel-based sink contract + Tauri sink refusal outside runtime.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  DownloadError,
  connectorArtifactKey,
  createMemorySink,
  createNodeArtifactSink,
  downloadArtifact,
  localArtifactRel,
  safeArtifactFilename,
  skillArtifactKey,
  type ArtifactSink,
} from "./marketplace.ts";
import { createTauriArtifactSink, inTauriRuntime } from "./tauri-sink.ts";
import { shouldStartDownload, userMessage, mergeLiveIntegrity } from "./store/downloads.ts";
import type { MCPCatalogItem } from "./catalog.ts";

const CONN_KEY = connectorArtifactKey("conn-a", "1.0.0", "linux", "x64");
const BYTES = new Uint8Array([1, 2, 3, 4, 5]);

function startMock(status: number, body: Uint8Array | null): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((_req, res) => {
    res.writeHead(status, { "Content-Type": "application/octet-stream" });
    res.end(body ? Buffer.from(body) : Buffer.alloc(0));
  });
  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

function tmpDir(tag: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `c9-${tag}-`));
}

const nodeFs = {
  mkdir: async (p: string, o: { recursive: true }): Promise<void> => { await fs.promises.mkdir(p, o); },
  writeFile: (p: string, d: Uint8Array) => fs.promises.writeFile(p, d),
  rename: (a: string, b: string) => fs.promises.rename(a, b),
  unlink: (p: string) => fs.promises.unlink(p),
};

test("path traversal filenames rejected (client-side)", () => {
  for (const bad of ["../../evil", "..\\..\\evil", "/tmp/evil", "C:\\evil", "foo/../../evil", ".hidden", "..", ".", "a\0b"]) {
    assert.equal(safeArtifactFilename(bad), false, bad);
  }
  for (const ok of ["revit-mcp-1.0.0-windows-x64.zip", "skill-code-reviewer-1.0.0.zip"]) {
    assert.equal(safeArtifactFilename(ok), true, ok);
  }
});

test("localArtifactRel confines kind + basename", () => {
  assert.equal(localArtifactRel(CONN_KEY), "connectors/conn-a-1.0.0-linux-x64.zip");
  assert.equal(localArtifactRel(skillArtifactKey("s", "1.0.0")), "skills/skill-s-1.0.0.zip");
  // only the FIRST (kind) and LAST (basename) segments are ever used — a
  // middle traversal segment is inherently contained, never a path escape
  assert.equal(localArtifactRel("connectors/../evil.zip"), "connectors/evil.zip");
  assert.equal(localArtifactRel("connectors/../evil.zip/extra"), "connectors/extra");
  assert.equal(localArtifactRel("connectors/../../evil.zip"), "connectors/evil.zip");
  // unknown kinds / unsafe last segments are rejected outright
  for (const bad of ["unknown/a.zip", "connectors/.."]) {
    assert.throws(() => localArtifactRel(bad), Error, bad);
  }
});

test("kind separation: same basename in connectors vs skills never collide", async () => {
  const mock = await startMock(200, BYTES);
  const dir = tmpDir("sep");
  const sink: ArtifactSink = createNodeArtifactSink(dir, nodeFs);
  // connector and skill keys that share the same filename basename
  const cKey = connectorArtifactKey("x", "1.0.0", "linux", "x64");
  const sKey = skillArtifactKey("x", "1.0.0");
  assert.notEqual(localArtifactRel(cKey), localArtifactRel(sKey), "distinct rel paths");
  await downloadArtifact("t", cKey, sink, mock.url);
  await downloadArtifact("t", sKey, sink, mock.url);
  assert.ok(fs.existsSync(path.join(dir, "connectors", "x-1.0.0-linux-x64.zip")));
  assert.ok(fs.existsSync(path.join(dir, "skills", "skill-x-1.0.0.zip")));
  const a = new Uint8Array(fs.readFileSync(path.join(dir, "connectors", "x-1.0.0-linux-x64.zip")));
  const b = new Uint8Array(fs.readFileSync(path.join(dir, "skills", "skill-x-1.0.0.zip")));
  assert.deepEqual(a, BYTES);
  assert.deepEqual(b, BYTES);
  await mock.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("filesystem failure → download failure, tmp cleaned, no final artifact", async () => {
  const mock = await startMock(200, BYTES);
  const dir = tmpDir("fsfail");
  const failing: ArtifactSink = {
    async stage() {
      throw new Error("disk full");
    },
    async finalize() {
      throw new Error("never reached");
    },
    async abort(rel) {
      // cleanup still runs best-effort
      await fs.promises.unlink(path.join(dir, `${rel}.tmp`)).catch(() => undefined);
    },
  };
  await assert.rejects(
    downloadArtifact("t", CONN_KEY, failing, mock.url),
    (e: unknown) => e instanceof DownloadError && e.kind === "sink",
  );
  assert.ok(!fs.existsSync(path.join(dir, "connectors", "conn-a-1.0.0-linux-x64.zip")), "no final artifact");
  const leftovers: string[] = [];
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.endsWith(".tmp")) leftovers.push(f);
  assert.deepEqual(leftovers, [], "no leftover tmp");
  await mock.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("finalize failure → abort cleanup, no final artifact", async () => {
  const mock = await startMock(200, BYTES);
  const dir = tmpDir("finalfail");
  let staged = "";
  const failFinalize: ArtifactSink = {
    async stage(rel) {
      staged = rel;
      await fs.promises.writeFile(path.join(dir, `${rel}.tmp`), BYTES);
    },
    async finalize() {
      throw new Error("rename denied");
    },
    async abort(rel) {
      await fs.promises.unlink(path.join(dir, `${rel}.tmp`)).catch(() => undefined);
    },
  };
  await assert.rejects(
    downloadArtifact("t", CONN_KEY, failFinalize, mock.url),
    (e: unknown) => e instanceof DownloadError && e.kind === "sink",
  );
  assert.equal(staged, "connectors/conn-a-1.0.0-linux-x64.zip");
  assert.ok(!fs.existsSync(path.join(dir, "connectors", "conn-a-1.0.0-linux-x64.zip")), "no final artifact");
  assert.ok(!fs.existsSync(path.join(dir, `${staged}.tmp`)), "tmp cleaned after finalize failure");
  await mock.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Tauri sink refuses to operate outside the Tauri runtime", async () => {
  // In the node test environment __TAURI_INTERNALS__ is absent → the sink is
  // inert; downloads through it fail as sink errors (no insecure fallback).
  assert.equal(inTauriRuntime(), false);
  const sink = createTauriArtifactSink();
  await assert.rejects(sink.stage("connectors/a.zip", BYTES));
  await assert.rejects(sink.finalize("connectors/a.zip"));
});

test("duplicate-click guard: downloading state suppresses new downloads", () => {
  assert.equal(shouldStartDownload(undefined), true);
  assert.equal(shouldStartDownload({ status: "idle", message: null }), true);
  assert.equal(shouldStartDownload({ status: "downloading", message: null }), false);
  assert.equal(shouldStartDownload({ status: "success", message: null }), true);
  assert.equal(shouldStartDownload({ status: "error", message: "x" }), true);
});

function catalogItem(overrides: Partial<MCPCatalogItem>): MCPCatalogItem {
  return {
    id: "revit-mcp",
    name: "Revit Connector",
    version: "1.0.0",
    description: "",
    package_url: "connectors/revit-mcp-1.0.0-windows-x64.zip",
    ...overrides,
  };
}

test("mergeLiveIntegrity: live catalog's sha256/size_bytes win over a stale cached `expected`", () => {
  // This is the actual bug: a page's `expected` came from a localStorage
  // catalog cache written before the server republished this exact version —
  // the STALE claim, not the CURRENT one, must never reach CP20's install
  // verification.
  const expected = { connector_id: "revit-mcp", version: "1.0.0", sha256: "STALE_SHA", size_bytes: 111 };
  const live = [catalogItem({ sha256: "FRESH_SHA", package_size_bytes: 30647558 })];
  const merged = mergeLiveIntegrity(expected, live);
  assert.equal(merged.sha256, "FRESH_SHA");
  assert.equal(merged.size_bytes, 30647558);
});

test("mergeLiveIntegrity: no match in the live catalog (removed, or live fetch fell back to cache) passes `expected` through unchanged", () => {
  const expected = { connector_id: "ghost-mcp", version: "9.9.9", sha256: "X", size_bytes: 1 };
  const merged = mergeLiveIntegrity(expected, [catalogItem({ id: "revit-mcp" })]);
  assert.equal(merged.sha256, "X");
  assert.equal(merged.size_bytes, 1);

  const mergedEmpty = mergeLiveIntegrity(expected, []);
  assert.equal(mergedEmpty.sha256, "X");
  assert.equal(mergedEmpty.size_bytes, 1);
});

test("mergeLiveIntegrity: matches on id AND version — a different published version never overrides the one actually being installed", () => {
  const expected = { connector_id: "revit-mcp", version: "1.0.0", sha256: "V1_SHA", size_bytes: 100 };
  const live = [catalogItem({ version: "1.1.0", sha256: "V1_1_SHA", package_size_bytes: 200 })];
  const merged = mergeLiveIntegrity(expected, live);
  assert.equal(merged.sha256, "V1_SHA");
  assert.equal(merged.size_bytes, 100);
});

test("user-facing messages are generic (no internals)", () => {
  for (const kind of ["auth", "forbidden", "not-found", "server", "network", "sink"] as const) {
    const msg = userMessage(new DownloadError(kind, "internal detail that must not surface"));
    assert.ok(!msg.includes("internal"), msg);
    assert.ok(msg.length > 0, msg);
  }
  assert.equal(userMessage(new Error("boom")), "The download could not be completed.");
});

test("memory sink: success only after finalize", async () => {
  const mock = await startMock(200, BYTES);
  const sink = createMemorySink();
  const res = await downloadArtifact("t", CONN_KEY, sink, mock.url);
  assert.equal(res.bytes.length, BYTES.length);
  assert.ok(sink.artifacts.has(res.rel), "artifact recorded only after finalize");
  await mock.close();
});

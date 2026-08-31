// Track C-8 — Desktop marketplace download integration tests.
// Real HTTP mock server + real filesystem sink (node:fs, tmp dir).

import { test } from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  DownloadError,
  connectorArtifactKey,
  createNodeArtifactSink,
  downloadArtifact,
  skillArtifactKey,
  type ArtifactSink,
} from "./marketplace.ts";
import { detectPlatform } from "./platform.ts";

const CONN_KEY = connectorArtifactKey("conn-a", "1.0.0", "linux", "x64");
const SKILL_KEY = skillArtifactKey("code-reviewer", "1.0.0");
const ARTIFACT_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01, 0xff, 0xfe]);

interface MockCtl {
  status: number;
  body: Uint8Array | null;
  truncate: boolean; // send partial body then destroy the socket
  requests: { url: string; auth: string | null }[];
}

function startMock(): Promise<{ url: string; ctl: MockCtl; close: () => Promise<void> }> {
  const ctl: MockCtl = { status: 200, body: ARTIFACT_BYTES, truncate: false, requests: [] };
  const server = http.createServer((req, res) => {
    ctl.requests.push({ url: req.url ?? "", auth: req.headers.authorization ?? null });
    const status = ctl.status;
    if (ctl.truncate) {
      res.writeHead(status, { "Content-Type": "application/octet-stream" });
      res.write(ctl.body ? ctl.body.slice(0, 4) : Buffer.alloc(0));
      res.destroy(); // socket dies mid-body
      return;
    }
    res.writeHead(status, { "Content-Type": "application/octet-stream" });
    res.end(ctl.body ? Buffer.from(ctl.body) : Buffer.alloc(0));
  });
  return new Promise<{ url: string; ctl: MockCtl; close: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        ctl,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

function tmpDir(tag: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `c8-${tag}-`));
  return d;
}

const nodeFs = {
  mkdir: async (p: string, o: { recursive: true }): Promise<void> => { await fs.promises.mkdir(p, o); },
  writeFile: (p: string, d: Uint8Array) => fs.promises.writeFile(p, d),
  rename: (a: string, b: string) => fs.promises.rename(a, b),
  unlink: (p: string) => fs.promises.unlink(p),
};

async function expectNoArtifact(dir: string, filename: string) {
  assert.ok(!fs.existsSync(path.join(dir, filename)), "final artifact must not exist");
  // no leftover staging files
  const leftovers: string[] = [];
  const walk = (d: string) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (f.name.endsWith(".tmp")) leftovers.push(p); } };
  walk(dir);
  assert.deepEqual(leftovers, [], `no leftover tmp files: ${leftovers}`);
}

test("authorized connector download: 200 → saved exact bytes", async () => {
  const mock = await startMock();
  const dir = tmpDir("conn-ok");
  const sink: ArtifactSink = createNodeArtifactSink(dir, nodeFs);
  const res = await downloadArtifact("tok", CONN_KEY, sink, mock.url);
  assert.equal(res.filename, "conn-a-1.0.0-linux-x64.zip");
  assert.equal(res.rel, "connectors/conn-a-1.0.0-linux-x64.zip");
  const saved = new Uint8Array(fs.readFileSync(path.join(dir, res.rel)));
  assert.deepEqual(saved, ARTIFACT_BYTES, "exact bytes");
  await expectNoArtifact(dir, "connectors/nothing-else");
  await mock.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("authorized skill download: 200 → saved exact bytes", async () => {
  const mock = await startMock();
  const dir = tmpDir("skill-ok");
  const sink: ArtifactSink = createNodeArtifactSink(dir, nodeFs);
  const res = await downloadArtifact("tok", SKILL_KEY, sink, mock.url);
  assert.equal(res.filename, "skill-code-reviewer-1.0.0.zip");
  assert.equal(res.rel, "skills/skill-code-reviewer-1.0.0.zip");
  const saved = new Uint8Array(fs.readFileSync(path.join(dir, res.rel)));
  assert.deepEqual(saved, ARTIFACT_BYTES);
  await mock.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("401 → typed auth failure, no artifact, no further requests", async () => {
  const mock = await startMock();
  mock.ctl.status = 401;
  const dir = tmpDir("auth");
  const sink: ArtifactSink = createNodeArtifactSink(dir, nodeFs);
  await assert.rejects(
    downloadArtifact("tok", CONN_KEY, sink, mock.url),
    (e: unknown) => e instanceof DownloadError && e.kind === "auth",
  );
  await expectNoArtifact(dir, "connectors/conn-a-1.0.0-linux-x64.zip");
  assert.equal(mock.ctl.requests.length, 1, "client must not retry or bypass a 401");
  assert.ok(mock.ctl.requests[0].auth?.startsWith("Bearer "), "session bearer sent");
  await mock.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("403 → typed forbidden failure, no artifact, no bypass attempts", async () => {
  const mock = await startMock();
  mock.ctl.status = 403;
  const dir = tmpDir("forbidden");
  const sink: ArtifactSink = createNodeArtifactSink(dir, nodeFs);
  await assert.rejects(
    downloadArtifact("tok", CONN_KEY, sink, mock.url),
    (e: unknown) => e instanceof DownloadError && e.kind === "forbidden",
  );
  await expectNoArtifact(dir, "connectors/conn-a-1.0.0-linux-x64.zip");
  // authorization boundary: the failed request stays failed — exactly one
  // request to the marketplace, no alternate URL, no object-key guessing
  assert.equal(mock.ctl.requests.length, 1);
  assert.ok(mock.ctl.requests[0].url.includes("/artifacts/connectors/conn-a/"));
  await mock.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("404 → typed not-found failure, no artifact", async () => {
  const mock = await startMock();
  mock.ctl.status = 404;
  const dir = tmpDir("nf");
  const sink: ArtifactSink = createNodeArtifactSink(dir, nodeFs);
  await assert.rejects(
    downloadArtifact("tok", CONN_KEY, sink, mock.url),
    (e: unknown) => e instanceof DownloadError && e.kind === "not-found",
  );
  await expectNoArtifact(dir, "connectors/conn-a-1.0.0-linux-x64.zip");
  await mock.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("500 (integrity/server failure) → typed server failure, artifact rejected", async () => {
  const mock = await startMock();
  mock.ctl.status = 500; // server checksum mismatch → fail-closed 500
  const dir = tmpDir("integrity");
  const sink: ArtifactSink = createNodeArtifactSink(dir, nodeFs);
  await assert.rejects(
    downloadArtifact("tok", CONN_KEY, sink, mock.url),
    (e: unknown) => e instanceof DownloadError && e.kind === "server",
  );
  await expectNoArtifact(dir, "connectors/conn-a-1.0.0-linux-x64.zip");
  await mock.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("interrupted download (partial body) → failure, no valid artifact, tmp cleaned", async () => {
  const mock = await startMock();
  mock.ctl.truncate = true;
  const dir = tmpDir("interrupted");
  const sink: ArtifactSink = createNodeArtifactSink(dir, nodeFs);
  await assert.rejects(
    downloadArtifact("tok", CONN_KEY, sink, mock.url),
    (e: unknown) => e instanceof DownloadError && e.kind === "network",
  );
  await expectNoArtifact(dir, "connectors/conn-a-1.0.0-linux-x64.zip");
  await mock.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("server 404 wins over stale local identity (no fallback path guessing)", async () => {
  const mock = await startMock();
  mock.ctl.status = 404;
  const dir = tmpDir("stale");
  const sink: ArtifactSink = createNodeArtifactSink(dir, nodeFs);
  // local catalog said version 2.0.0, server has only 1.0.0 → 404, typed
  await assert.rejects(
    downloadArtifact("tok", connectorArtifactKey("conn-a", "2.0.0", "linux", "x64"), sink, mock.url),
    (e: unknown) => e instanceof DownloadError && e.kind === "not-found",
  );
  assert.equal(mock.ctl.requests.length, 1, "no fallback storage-path guessing");
  await mock.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("platform detection maps to server vocabulary", () => {
  assert.deepEqual(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), { os: "windows", arch: "x64" });
  assert.deepEqual(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), { os: "macos", arch: "x64" });
  assert.deepEqual(detectPlatform("Mozilla/5.0 (X11; Linux x86_64)"), { os: "linux", arch: "x64" });
  assert.deepEqual(detectPlatform("", { platform: "Linux", architecture: "arm64" }), { os: "linux", arch: "arm64" });
  assert.deepEqual(detectPlatform("garbage"), { os: "linux", arch: "x64" }, "unknown → safe default");
});

test("artifact keys follow the server's canonical published vocabulary", () => {
  assert.equal(
    connectorArtifactKey("revit-mcp", "1.0.0", "windows", "x64"),
    "connectors/revit-mcp/1.0.0/windows-x64/revit-mcp-1.0.0-windows-x64.zip",
  );
  assert.equal(
    skillArtifactKey("code-reviewer", "2.0.0"),
    "skills/code-reviewer/2.0.0/skill-code-reviewer-2.0.0.zip",
  );
});

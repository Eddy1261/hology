#!/usr/bin/env python3
"""Stage the language runtimes AI CONNECT ships to `src-tauri/runtime/`.

WHY THIS EXISTS
---------------
Every connector package shipped source-only: no interpreter, no dependencies. The
gateway spawned a bare `python` / `node.exe` off PATH, so on a clean Windows machine a
connector either failed to spawn at all or died on its first `import`. The small package
sizes were not "Python compresses well" — the dependencies simply were not there.

The runtime is a PLATFORM concern, installed once, not something each connector carries:
a per-package copy would duplicate ~45 MB across every connector, and — more importantly —
there would be no single ABI for the native wheels connectors ship (pywin32, comtypes,
better-sqlite3's `.node`) to be built against. Connector packages vendor their own
DEPENDENCIES against the versions pinned here; they never carry an interpreter.

The gateway resolves these at `<install root>/runtime/<lang>/` — see
`process_manager::resolve_runtime_bin`, which prefers, in order: the `AICONNECT_*_BIN`
override, this bundled runtime, then PATH.

PINS
----
Both archives are verified against a digest pinned IN THIS FILE, not against a checksum
fetched next to the download. A checksum served from the same host as the artifact
proves only that the transfer completed.

Node 22 is chosen for its ABI (127): better-sqlite3 publishes a win32-x64 prebuild for
it, so the Revit connector's only native dependency resolves without a compiler on the
user's machine. Changing NODE here means re-vendoring that prebuild.

Run:  python3 apps/desktop/stage-runtimes.py [--force]
Then: pnpm tauri build   (tauri.conf.json bundles `runtime/**/*` as a resource)
"""
from __future__ import annotations

import argparse
import hashlib
import io
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEST = HERE / "src-tauri" / "runtime"

NODE_VERSION = "v22.21.1"
NODE_URL = f"https://nodejs.org/dist/{NODE_VERSION}/node-{NODE_VERSION}-win-x64.zip"
NODE_SHA256 = "3c624e9fbe07e3217552ec52a0f84e2bdc2e6ffa7348f3fdfb9fbf8f42e23fcf"
# Only the interpreter: npm, corepack and the headers are build-time tooling that a
# connector never invokes, and they are most of the archive.
NODE_MEMBER = f"node-{NODE_VERSION}-win-x64/node.exe"

PYTHON_VERSION = "3.12.10"
PYTHON_URL = (
    f"https://www.python.org/ftp/python/{PYTHON_VERSION}/"
    f"python-{PYTHON_VERSION}-embed-amd64.zip"
)
PYTHON_SHA256 = "4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3"

# NO SEMANTIC EMBEDDER IS STAGED, deliberately. This used to vendor
# `fastembed==0.8.0` + onnxruntime for the bundled interpreter (~109 MB after
# pruning) and copy `embed_helper.py` beside it, which also committed the app to
# a ~130 MB model download on first use.
#
# Removed because it was measured and did not earn the weight. Connector-shipped
# ALIAS text reaches the same tools lexically: across all seven connectors it is
# worth +8.2 pt recall@1 and +6.9 pt weighted coverage for 29.9 KB, where the
# whole ONNX stack bought +4.4 / +1.9. Roughly 23,000x the bytes for half the
# gain. See docs/audit/MULTI-CONNECTOR-RETRIEVAL.md, parts 3 and 4.
#
# Nothing breaks without it: `SemanticRuntime` degrades to lexical-only when no
# embed binary resolves, which is what EVERY packaged install already did — the
# old default was a `CARGO_MANIFEST_DIR` path baked from the build machine, so
# the helper was never found in the field regardless.
#
# The gateway's semantic code has since been REMOVED outright, not merely left
# unstaged: `AICONNECT_EMBED_BIN` no longer resolves anything, and there is no
# hybrid ranking left to feed. Retrieval is BM25 over tool text plus
# connector-shipped aliases. Restoring a staging step here would no longer be
# enough to bring embeddings back.


def fetch(url: str, expect_sha256: str) -> bytes:
    print(f"  downloading {url}")
    with urllib.request.urlopen(url, timeout=300) as r:  # noqa: S310 - pinned https
        blob = r.read()
    got = hashlib.sha256(blob).hexdigest()
    if got != expect_sha256:
        sys.exit(
            f"CHECKSUM MISMATCH for {url}\n"
            f"  expected {expect_sha256}\n  got      {got}\n"
            f"Refusing to stage. If the upstream release was legitimately re-cut, update "
            f"the pin in this file deliberately — never to make an error go away."
        )
    print(f"  sha256 ok ({len(blob) / 1e6:.1f} MB)")
    return blob


def stage_node(force: bool) -> None:
    out_dir = DEST / "node"
    exe = out_dir / "node.exe"
    if exe.is_file() and not force:
        print(f"node: already staged ({exe.stat().st_size / 1e6:.1f} MB) — use --force to refresh")
        return
    print(f"node {NODE_VERSION}:")
    blob = fetch(NODE_URL, NODE_SHA256)
    out_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        if NODE_MEMBER not in z.namelist():
            sys.exit(f"'{NODE_MEMBER}' not in the archive — the dist layout changed")
        exe.write_bytes(z.read(NODE_MEMBER))
    print(f"  staged {exe} ({exe.stat().st_size / 1e6:.1f} MB)")


def stage_python(force: bool) -> None:
    out_dir = DEST / "python"
    exe = out_dir / "python.exe"
    if exe.is_file() and not force:
        print(f"python: already staged — use --force to refresh")
        return
    print(f"python {PYTHON_VERSION} (embeddable):")
    blob = fetch(PYTHON_URL, PYTHON_SHA256)
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        z.extractall(out_dir)
    if not exe.is_file():
        sys.exit("python.exe not produced — the embeddable layout changed")
    # The embeddable distribution ships an isolated `sys.path` and `import site`
    # disabled. That is what we want: a connector must resolve its dependencies from
    # the `_vendor/` directory IT ships, never from whatever happens to be installed
    # on the machine. Connectors put `_vendor` on sys.path explicitly in their entry
    # script, so nothing here needs to edit the ._pth.
    total = sum(p.stat().st_size for p in out_dir.rglob("*") if p.is_file())
    print(f"  staged {out_dir} ({total / 1e6:.1f} MB, {len(list(out_dir.rglob('*')))} files)")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true", help="re-download even if present")
    args = ap.parse_args()
    DEST.mkdir(parents=True, exist_ok=True)
    stage_node(args.force)
    stage_python(args.force)
    print("\nRuntimes staged. `pnpm tauri build` will bundle them as app resources;")
    print("the gateway finds them at <install root>/runtime/<lang>/.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

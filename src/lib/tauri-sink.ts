// Tauri filesystem sink (Track C-9) — the real Desktop persistence boundary
// for the C-8 download client.
//
// The Tauri shell is a PERSISTENCE SINK ONLY: it stores bytes the server has
// already authorized + integrity-verified. It never decides entitlement,
// never verifies checksums, never touches storage backends. Commands:
// artifact_stage / artifact_finalize / artifact_abort (src-tauri/src/lib.rs),
// which validate + confine `rel` (connectors/<file> | skills/<file>) to the
// artifact root and finalize atomically (tmp → rename).
//
// Outside the Tauri runtime (browser dev/tests) this sink refuses to operate
// — downloads surface as sink failures rather than silently falling back to
// an insecure mode.

import { invoke } from "@tauri-apps/api/core";
import type { ArtifactSink } from "./marketplace.ts";

export function inTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function createTauriArtifactSink(): ArtifactSink {
  return {
    async stage(rel, bytes) {
      if (!inTauriRuntime()) throw new Error("Tauri runtime required");
      await invoke("artifact_stage", { rel, bytes });
    },
    async finalize(rel) {
      if (!inTauriRuntime()) throw new Error("Tauri runtime required");
      await invoke("artifact_finalize", { rel });
    },
    async abort(rel) {
      if (!inTauriRuntime()) throw new Error("Tauri runtime required");
      await invoke("artifact_abort", { rel }).catch(() => undefined);
    },
  };
}

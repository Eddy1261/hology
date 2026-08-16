// Remote catalog (S3 metadata) — separate from gateway state.

import { state } from "./state.ts";
import { loadCatalog, refreshCatalog } from "../catalog.ts";
import { catlog } from "../catdiag.ts";

export const catalog = {
  /** Startup/login: cache-first — stale data renders immediately, a
   *  background refresh replaces it via the onRefresh callback when it lands.
   *  Never blocks startup on S3. */
  async load(): Promise<void> {
    const prev = state.catalogState;
    const r = await loadCatalog(undefined, (index, st) => {
      void catlog(`[catalog] state transition (bg) ${prev} -> ${st} items=${index.length}`);
      state.mcpCatalog = index;
      state.catalogState = st;
    });
    state.mcpCatalog = r.index;
    state.catalogState = r.state;
    void catlog(`[catalog] state transition ${prev} -> ${r.state} items=${r.index.length}`);
  },
  /** Manual refresh: force remote fetch, fall back to cache on failure. */
  async refresh(): Promise<void> {
    const prev = state.catalogState;
    const r = await refreshCatalog();
    state.mcpCatalog = r.index;
    state.catalogState = r.state;
    void catlog(`[catalog] state transition ${prev} -> ${r.state} items=${r.index.length}`);
  },
};

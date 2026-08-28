// P5R: MCP sync feedback — visible, honest result of a manual sync.
// Consumes the ACTUAL existing state after a refresh; never fabricates
// success when the sync failed.

export interface SyncInput {
  online: boolean;
  catalogConfigured: boolean;
  catalogFailed: boolean;
  installed: number;
}

export interface SyncFeedback {
  kind: "ok" | "offline" | "catalog";
  text: string;
}

export function syncFeedback(input: SyncInput): SyncFeedback {
  if (!input.online) {
    return { kind: "offline", text: "You're offline. The connector list may not be up to date." };
  }
  if (!input.catalogConfigured || input.catalogFailed) {
    return {
      kind: "catalog",
      text: "Catalog unavailable. Showing only installed connectors.",
    };
  }
  return {
    kind: "ok",
    text:
      input.installed > 0
        ? `All connectors up to date. ${input.installed} installed.`
        : "All connectors up to date. Install your first one to get started.",
  };
}

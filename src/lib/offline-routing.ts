// R1: local-layer routing decision (pure — no Tauri/API imports so node:test
// can exercise it directly).
//
// `online` = state.online = loopback gateway /health probe result
// (persistence availability). NOT internet status, NOT JWT status.
//
// Local CRUD uses the offline layer ONLY when the gateway cannot serve
// persistence. A healthy gateway always takes the HTTP path — application
// errors surface, they never switch the persistence owner (a live gateway
// holds redb; a second writer must never be attempted).

export function shouldUseOfflineLayer(online: boolean, inTauri: boolean): boolean {
  return !online && inTauri;
}

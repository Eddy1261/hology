// Stale-response guard for list refreshes.
//
// Every `refresh()` in this directory is `state.X = await fetch(...)`, which is
// last-SETTLING-wins — and several independent producers call each one during a
// normal session: startup hydration, the 3s gateway-recovery loop, a page's
// mount/focus handler, and the refresh that every connector action issues when
// it finishes. They overlap, so the SLOWEST response wins regardless of age.
//
// Concretely: click Connect, alt-tab away and back. The focus handler starts
// refresh A; Connect finishes and starts refresh B; B returns the running
// connector quickly, A returns the pre-enable snapshot slowly and overwrites it.
// The UI then shows the connector as disconnected while it is running.
//
// `context.load` already avoids this by re-checking the active project id after
// its await. This is the same idea for refreshes with no such natural key.

export interface RefreshSlot {
  /** True while no NEWER response has been applied. Call once, immediately
   *  before writing state; a false result means a fresher response already
   *  landed and this one must be dropped. */
  isNewest(): boolean;
  /** True when nothing newer is in flight — the condition for clearing a
   *  shared loading flag, which otherwise gets cleared by whichever request
   *  finishes first while the others are still running. */
  isLast(): boolean;
}

export interface LatestGuard {
  begin(): RefreshSlot;
}

export function createLatestGuard(): LatestGuard {
  let issued = 0;
  let applied = 0;
  return {
    begin(): RefreshSlot {
      const seq = ++issued;
      return {
        isNewest() {
          if (seq <= applied) return false;
          applied = seq;
          return true;
        },
        isLast() {
          return seq === issued;
        },
      };
    },
  };
}

<script setup lang="ts">
import { getCurrentWindow } from "@tauri-apps/api/window";

const inTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
// getCurrentWindow() throws outside the Tauri runtime (it reads
// __TAURI_INTERNALS__.metadata). In plain-browser dev/E2E the titlebar
// renders but window controls are no-ops.
const appWindow = inTauri ? getCurrentWindow() : null;

async function minimize() {
  // P2-06: never let a window-API failure become an unhandled rejection.
  try {
    await appWindow?.minimize();
  } catch {
    /* window API unavailable/denied — no-op */
  }
}

async function close() {
  try {
    await appWindow?.close();
  } catch {
    /* window API unavailable/denied — no-op */
  }
}
</script>

<template>
  <!-- Custom titlebar: no native decorations (tauri.conf.json decorations:false).
       Background intentionally inherits the ac-panel bg (--color-bg) — no border,
       so the titlebar and the app read as one surface. The whole bar is a drag
       region; the buttons stop propagation so clicks never become drags. -->
  <header
    data-tauri-drag-region
    class="h-[25px] shrink-0 flex items-center justify-between select-none"
    style="background: var(--color-bg)"
  >
    <!-- Left side is empty drag surface (logo removed by product request). -->
    <div class="flex items-center h-full pl-3 min-w-0"></div>

    <div class="flex items-center h-full">
      <button
        type="button"
        class="titlebar-btn"
        aria-label="Minimize"
        @click.stop="minimize"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" stroke-width="1.2" />
        </svg>
      </button>
      <button
        type="button"
        class="titlebar-btn titlebar-close"
        aria-label="Close"
        @click.stop="close"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" stroke-width="1.2" />
          <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" stroke-width="1.2" />
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.titlebar-btn {
  width: 42px;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--color-muted, #8b93a7);
  transition: background-color 0.12s ease, color 0.12s ease;
}

.titlebar-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--color-fg, #f4f4f5);
}

.titlebar-close:hover {
  background: #c42b1c;
  color: white;
}
/* Corner seam fix: the panel is rounded only at the BOTTOM (flat top, capped
   by the titlebar); the header carries the TOP radius + a painted bg so the
   two form one coherent rounded shape with no backdrop sliver at any corner,
   in either theme. */
@media (min-width: 640px) {
  header {
    border-top-left-radius: 18px;
    border-top-right-radius: 18px;
  }
}
:global(body.tauri-shell) header {
  border-top-left-radius: 18px;
  border-top-right-radius: 18px;
}
</style>

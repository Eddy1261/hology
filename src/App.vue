<script setup lang="ts">
import TitleBar from "./components/TitleBar.vue";
import Toasts from "./components/Toasts.vue";
</script>

<template>
  <div class="h-full w-full flex items-stretch justify-center bg-black">
    <!-- Custom titlebar is a SEPARATE strip above the app panel. The shell
         is a flex column filling the window exactly: titlebar (shrink-0) +
         panel (flex-1 min-h-0) — the panel fills everything below the bar,
         so its bottom is never clipped behind overflow:hidden. In Tauri the
         explicit 540px panel rule overrides flex-1; elsewhere it fills. -->
    <div class="flex flex-col w-full h-full max-w-[430px]">
      <TitleBar class="w-full shrink-0" />
      <!-- Fixed compact utility panel: target 398×540, min 360 / max 430 -->
      <div class="ac-panel relative bg-bg text-fg overflow-hidden flex flex-col border-transparent flex-1 min-h-0">
        <router-view />
        <Toasts />
      </div>
    </div>
  </div>
</template>

<style scoped>
.ac-panel {
  /* Never 100vw: viewport width units introduce the scrollbar-width
     overflow edge lines. Height comes from flex-1 min-h-0 (fills below the
     titlebar, no bottom clipping); the desktop window sizes it explicitly
     via the tauri-shell / media rules. */
  width: 100%;
}
@media (min-width: 640px) {
  .ac-panel {
    width: 398px;
    height: 540px;
    border-width: 0px;
    border-radius: 0 0 18px 18px;
    box-shadow: 0 24px 90px -24px rgba(0, 0, 0, 0.9);
  }
}
/* P2-04: the real Tauri window (398×540) is below the 640px media query, so
   the card treatment never applied in the desktop shell. The tauri-shell
   body flag (main.ts) applies the same card look there. Flat top: the
   TitleBar caps the panel, so only the bottom corners are rounded. */
:global(body.tauri-shell) .ac-panel {
  width: 398px;
  /* NO fixed height: the shell flex column (TitleBar shrink-0 + panel
     flex-1 min-h-0) makes the panel track the actual available viewport —
     window height minus the 25px titlebar — at any window size. */
  border-width: 0px;
  border-radius: 0 0 18px 18px;
  box-shadow: 0 24px 90px -24px rgba(0, 0, 0, 0.9);
}
</style>

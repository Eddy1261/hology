<script setup lang="ts">
import mascotUrl from "../assets/mascot.webp";
withDefaults(defineProps<{ size?: number }>(), { size: 150 });
</script>

<template>
  <div
    class="relative shrink-0 flex items-center justify-center pointer-events-none select-none"
    :style="{ width: size + 'px', height: size + 'px' }"
    aria-hidden="true"
  >
    <!-- robot render (3D mascot, bundled webp) -->
    <img
      :src="mascotUrl"
      alt=""
      class="w-full h-full object-contain pointer-events-none select-none"
      draggable="false"
      loading="eager"
      decoding="sync"
    />
  </div>
</template>

<style scoped>
img {
  transform: translateZ(0);
  backface-visibility: hidden;
}
</style>

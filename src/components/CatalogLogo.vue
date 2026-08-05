<script setup lang="ts">
import { ref, watch } from "vue";
import { logoVisible } from "../lib/catalog-logo.ts";
import IconTile from "./ui/IconTile.vue";

const props = withDefaults(
  defineProps<{
    src?: string;
    name: string;
    size?: number;
  }>(),
  { size: 42 },
);

// Reactive error state: a broken logo_url hides the <img> and shows the
// IconTile fallback (never display:none-with-v-if-still-true).
const failed = ref(false);

// Reset on identity change (connector id / url) so a corrected logo retries.
watch(
  () => [props.src, props.name],
  () => {
    failed.value = false;
  },
);
</script>

<template>
  <img
    v-if="logoVisible(src, failed)"
    :src="src"
    :alt="name"
    loading="lazy"
    class="rounded-[10px] object-cover bg-panel shrink-0"
    :style="{ width: `${size}px`, height: `${size}px` }"
    @error="failed = true"
  />
  <IconTile v-else :glyph="(name ?? '?')[0]" color="#3b82f6" :size="size" />
</template>

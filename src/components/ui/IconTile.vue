<script setup lang="ts">
withDefaults(defineProps<{ glyph: string; color: string; size?: number }>(), { size: 40 });
</script>

<template>
  <div
    class="rounded-[10px] flex items-center justify-center font-bold text-white shrink-0"
    :style="{
      width: size + 'px',
      height: size + 'px',
      background: color,
      fontSize: size * 0.4 + 'px',
      fontFamily: glyph.length > 1 ? 'var(--font-mono)' : 'var(--font-sans)',
      boxShadow: `0 4px 14px -6px ${color}`,
    }"
  >
    {{ glyph }}
  </div>
</template>

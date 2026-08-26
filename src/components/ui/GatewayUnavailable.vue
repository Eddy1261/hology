<script setup lang="ts">
// FE-8 P2: shared "gateway unavailable" state for data pages.
// Pattern was repeated 3× (Sessions, Skills, SessionDetail) — extracted.
import EmptyState from "./EmptyState.vue";
import ACButton from "./ACButton.vue";

defineProps<{ icon?: string; body?: string }>();
const emit = defineEmits<{ retry: [] }>();
</script>

<template>
  <div class="py-10" role="status">
    <EmptyState
      :icon="icon ?? 'activity'"
      title="Gateway unavailable"
      :body="body ?? 'AI Connect can\u2019t reach the gateway right now. Make sure the app is running and try again.'"
    >
      <ACButton size="sm" @click="emit('retry')">Retry</ACButton>
    </EmptyState>
  </div>
</template>

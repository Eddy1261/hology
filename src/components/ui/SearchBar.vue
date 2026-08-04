<script setup lang="ts">
import Icon from "./Icon.vue";
defineProps<{ modelValue: string; placeholder?: string }>();
defineEmits<{ "update:modelValue": [string] }>();
</script>

<template>
  <div
    class="flex items-center gap-2 h-10 px-3 rounded-[10px] bg-card border border-border focus-within:border-primary/50 transition-colors"
  >
    <Icon name="search" :size="16" class="text-faint shrink-0" />
    <input
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      :placeholder="placeholder"
      class="bg-transparent outline-none text-[13px] w-full placeholder:text-faint text-fg"
    />
  </div>
</template>

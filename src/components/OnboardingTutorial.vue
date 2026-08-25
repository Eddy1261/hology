<script setup lang="ts">
// First-use onboarding overlay. Compact centered dialog over a dimmed
// backdrop; vertical layout (image above text); exactly 3 slides;
// NEXT / NEXT / START; × and Esc close; focus managed.

import { ref, watch, nextTick, computed } from "vue";
import { TUTORIAL_SLIDES, buttonLabel, nextSlide } from "../lib/tutorial.ts";
import { TUTORIAL_ARTWORK } from "../lib/tutorial-artwork.ts";
import ACButton from "./ui/ACButton.vue";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const current = ref(0);
const dialogEl = ref<HTMLElement | null>(null);

// artwork + copy composed per slide (pure logic stays testable in tutorial.ts)
const slides = computed(() =>
  TUTORIAL_SLIDES.map((s, i) => ({ ...s, image: TUTORIAL_ARTWORK[i] })),
);

watch(
  () => props.open,
  (open) => {
    if (open) {
      current.value = 0;
      void nextTick(() => dialogEl.value?.focus());
    }
  },
);

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return;
  if (e.key === "Escape") {
    e.preventDefault();
    emit("close");
  }
}

function advance() {
  if (buttonLabel(current.value) === "START") {
    emit("close");
    return;
  }
  current.value = nextSlide(current.value);
}
</script>

<template>
  <Teleport to="body">
    <Transition name="tut-fade">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        style="background: rgba(0, 0, 0, 0.55)"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tut-title"
        @keydown="onKeydown"
      >
        <div
          ref="dialogEl"
          tabindex="-1"
          class="tut-card w-full max-w-[380px] rounded-2xl bg-panel border border-border-strong shadow-2xl p-5 outline-none max-h-[90vh] overflow-y-auto"
        >
          <!-- P5R: no close-X — the tutorial is completed by progressing
               through the flow; the final START action leaves it. -->
          <!-- vertical layout: artwork above text with proper breathing room -->
          <div
            class="flex items-center justify-center h-36 rounded-xl bg-card border border-border overflow-hidden mb-4.5"
            aria-hidden="true"
          >
            <img
              :src="slides[current].image"
              :alt="slides[current].alt"
              class="w-full h-full object-cover"
              draggable="false"
            />
          </div>

          <h2 id="tut-title" class="text-[18px] font-bold text-fg">
            {{ TUTORIAL_SLIDES[current].title }}
          </h2>
          <p class="text-[13px] text-muted mt-2 leading-relaxed min-h-[44px]">
            {{ TUTORIAL_SLIDES[current].description }}
          </p>

          <!-- pagination indicators (status only, not controls) -->
          <div class="flex items-center gap-1.5 mt-4" aria-hidden="true">
            <span
              v-for="(_, i) in TUTORIAL_SLIDES"
              :key="i"
              class="w-1.5 h-1.5 rounded-full transition-colors"
              :class="i === current ? 'bg-primary' : 'bg-faint'"
            />
          </div>

          <div class="mt-4 flex justify-end">
            <ACButton size="sm" @click="advance">
              {{ buttonLabel(current) }}
            </ACButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.tut-card {
  position: relative;
}
.tut-fade-enter-active,
.tut-fade-leave-active {
  transition: opacity 0.18s ease;
}
.tut-fade-enter-active .tut-card,
.tut-fade-leave-active .tut-card {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.tut-fade-enter-from,
.tut-fade-leave-to {
  opacity: 0;
}
.tut-fade-enter-from .tut-card,
.tut-fade-leave-to .tut-card {
  opacity: 0;
  transform: translateY(8px);
}
</style>

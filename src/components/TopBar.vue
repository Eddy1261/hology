<script setup lang="ts">
import { useRouter } from "vue-router";
import Icon from "./ui/Icon.vue";
import { state } from "../lib/store";
import { theme } from "../lib/theme";
import logoUrl from "../assets/logo.webp";
import logoDarkUrl from "../assets/logo-dark.webp";
const router = useRouter();
</script>

<template>
  <header
    class="relative h-14 shrink-0 flex items-center justify-between px-3 bg-bg"
  >
    <button
      @click="state.drawerOpen = true"
      class="w-9 h-9 flex items-center justify-center rounded-lg text-primary-hi hover:bg-white/5"
      aria-label="Open menu"
    >
      <Icon name="menu" :size="20" />
    </button>
    <button
      @click="router.push('/app')"
      class="absolute left-1/2 -translate-x-1/2 flex items-center"
      aria-label="AI CONNECT home"
    >
      <img
        :src="theme.mode === 'light' ? logoDarkUrl : logoUrl"
        alt="AI CONNECT"
        class="h-8"
        :class="theme.mode === 'light' ? '' : 'mix-blend-lighten'"
        draggable="false"
      />
    </button>
    <div class="flex items-center gap-1.5">
      <button
        @click="router.push('/app/help')"
        class="w-9 h-9 flex items-center justify-center rounded-full text-primary-hi hover:bg-primary-dim"
        aria-label="Help"
      >
        <Icon name="help" :size="18" />
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter, useRoute } from "vue-router";
import Icon from "./ui/Icon.vue";
import ConfirmDialog from "./ui/ConfirmDialog.vue";
import { theme } from "../lib/theme";
import logoUrl from "../assets/logo.webp";
import logoDarkUrl from "../assets/logo-dark.webp";
import { state, auth } from "../lib/store";

const router = useRouter();
const route = useRoute();

const nav = [
  { to: "/app", label: "Home", icon: "grid" },
  { to: "/app/projects", label: "Projects", icon: "database" },
  { to: "/app/mcp", label: "Connectors", icon: "cube" },
  { to: "/app/skills", label: "Skills", icon: "doc" },
  { to: "/app/help", label: "Help", icon: "help" },
  { to: "/app/settings", label: "Settings", icon: "gear" },
];

function go(to: string) {
  router.push(to);
  state.drawerOpen = false;
}
const confirmSignOut = ref(false);
function doSignOut() {
  confirmSignOut.value = false;
  auth.logout();
  state.drawerOpen = false;
  router.push("/");
}
const isActive = (to: string) =>
  to === "/app" ? route.path === "/app" : route.path.startsWith(to);
</script>

<template>
  <Transition name="drawer">
    <div v-if="state.drawerOpen" class="absolute inset-0 z-50">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-[2px]" @click="state.drawerOpen = false" />
      <nav
        class="drawer-panel absolute left-0 top-0 h-full w-[248px] bg-panel border-r border-border-strong flex flex-col p-3"
      >
        <div class="flex items-center px-2 h-14">
          <img
            :src="theme.mode === 'light' ? logoDarkUrl : logoUrl"
            alt="AI CONNECT"
            class="h-8"
            :class="theme.mode === 'light' ? '' : 'mix-blend-lighten'"
            draggable="false"
          />
        </div>
        <div class="flex flex-col gap-0.5 mt-1">
          <button
            v-for="n in nav"
            :key="n.to"
            :aria-label="n.label"
            @click="go(n.to)"
            class="flex items-center gap-3 h-10 px-3 rounded-[10px] text-[13.5px] font-medium transition-colors"
            :class="
              isActive(n.to)
                ? 'bg-primary-dim text-primary-hi'
                : 'text-muted hover:text-fg hover:bg-white/5'
            "
          >
            <Icon :name="n.icon" :size="18" />
            {{ n.label }}
          </button>
        </div>
        <div class="mt-auto pt-3 border-t border-border flex flex-col gap-0.5">
          <button
            @click="confirmSignOut = true"
            class="flex items-center gap-3 h-9 px-3 rounded-[10px] text-[13px] text-danger hover:bg-danger/10"
          >
            <Icon name="back" :size="16" /> Sign Out
          </button>
        </div>
      </nav>

      <ConfirmDialog
        :open="confirmSignOut"
        title="Sign out?"
        body="You will be signed out of this device. Your projects and connectors stay on this machine."
        confirm-label="Sign out"
        danger
        @confirm="doSignOut"
        @cancel="confirmSignOut = false"
      />
    </div>
  </Transition>
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.2s ease;
}
.drawer-enter-active .drawer-panel,
.drawer-leave-active .drawer-panel {
  transition: transform 0.26s cubic-bezier(0.16, 1, 0.3, 1);
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
.drawer-enter-from .drawer-panel,
.drawer-leave-to .drawer-panel {
  transform: translateX(-100%);
}
</style>

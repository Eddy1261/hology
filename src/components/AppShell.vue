<script setup lang="ts">
import TopBar from "./TopBar.vue";
import NavDrawer from "./NavDrawer.vue";
</script>

<template>
  <div class="flex flex-col h-full">
    <TopBar />
    <main class="flex-1 min-h-0 overflow-y-auto scroll-area">
      <router-view v-slot="{ Component }">
        <component :is="Component" class="page-enter" :key="$route.path" />
      </router-view>
    </main>
    <NavDrawer />
  </div>
</template>

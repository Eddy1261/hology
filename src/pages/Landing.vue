<script setup lang="ts">
import { useRouter } from "vue-router";
import RobotMascot from "../components/RobotMascot.vue";
import ACButton from "../components/ui/ACButton.vue";
const router = useRouter();
</script>

<template>
  <div class="page-enter flex flex-col h-full px-6 py-8">
    <div class="flex-1 flex flex-col items-center justify-center text-center">
      <RobotMascot :size="200" />
      <h1 class="text-[28px] font-bold leading-[1.12] mt-4">
        Your AI.<br />Connected to<br /><span class="text-primary">Everything.</span>
      </h1>
    </div>

    <div class="flex flex-col gap-2.5">
      <ACButton block @click="router.push('/signup')">Get Started</ACButton>
      <ACButton block variant="ghost" @click="router.push('/login')">Sign In</ACButton>
    </div>
  </div>
</template>

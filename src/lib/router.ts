import { createRouter, createWebHistory } from "vue-router";
import { isAuthed } from "./store";
import { setPendingAuthRoute } from "./auth-redirect.ts";
import AppShell from "../components/AppShell.vue";

const routes = [
  { path: "/", component: () => import("../pages/Landing.vue"), meta: { public: true } },
  { path: "/login", component: () => import("../pages/Login.vue"), meta: { public: true } },
  { path: "/signup", component: () => import("../pages/Signup.vue"), meta: { public: true } },
  { path: "/payment", component: () => import("../pages/Payment.vue"), meta: { public: true } },
  {
    path: "/app",
    component: AppShell,
    children: [
      { path: "", component: () => import("../pages/Dashboard.vue") },
      { path: "projects", component: () => import("../pages/Projects.vue") },
      { path: "workspace", component: () => import("../pages/AIWorkspace.vue") },
      { path: "mcp", component: () => import("../pages/MCPCollection.vue") },
      { path: "mcp/:id", component: () => import("../pages/MCPGuide.vue") },
      { path: "skills", component: () => import("../pages/Skills.vue") },
      { path: "help", component: () => import("../pages/Help.vue") },
      { path: "settings", component: () => import("../pages/Settings.vue") },
    ],
  },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach((to) => {
  if (!to.meta.public && !isAuthed.value) {
    // P5/P2-03: remember the denied protected route so a successful restore
    // (or form login) can return the user to their original target.
    setPendingAuthRoute(to.fullPath);
    return "/login";
  }
  return true;
});

// P5R: theme state — Dark ↔ Light, single source shared by the footer theme
// button and Settings → Appearance. Persisted (localStorage). The theme is
// PURELY visual: it never touches state.online or any connectivity state.

import { reactive } from "vue";

export type Theme = "dark" | "light";

const KEY = "aiconnect.theme";

function storedTheme(): Theme {
  if (typeof localStorage === "undefined") return "dark";
  return localStorage.getItem(KEY) === "light" ? "light" : "dark";
}

export const theme = reactive<{ mode: Theme }>({ mode: storedTheme() });

export function applyTheme(): void {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("light", theme.mode === "light");
}

export function toggleTheme(): void {
  theme.mode = theme.mode === "dark" ? "light" : "dark";
  if (typeof localStorage !== "undefined") localStorage.setItem(KEY, theme.mode);
  applyTheme();
}

export function setTheme(mode: Theme): void {
  if (theme.mode === mode) return;
  theme.mode = mode;
  if (typeof localStorage !== "undefined") localStorage.setItem(KEY, mode);
  applyTheme();
}

applyTheme();

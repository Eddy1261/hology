<script setup lang="ts">
// Icon registry backed by lucide-vue-next. Internal names are stable at the
// call sites; the mapping below is pure vector-art backing. Unknown names
// fall back to Box (never blank).
import {
  Menu,
  HelpCircle,
  Plus,
  RefreshCw,
  MoreVertical,
  Search,
  ChevronRight,
  ChevronDown,
  Activity,
  Moon,
  Bell,
  Settings,
  X,
  Check,
  ArrowRight,
  Link2,
  Box,
  Terminal,
  Database,
  LayoutGrid,
  Upload,
  SquarePen,
  Trash2,
  ArrowLeft,
  FileText,
  Lock,
  Sparkles,
  Download,
  Copy,
  Power,
  Unplug,
} from "lucide-vue-next";
import type { Component } from "vue";

const registry: Record<string, Component> = {
  menu: Menu,
  help: HelpCircle,
  plus: Plus,
  refresh: RefreshCw,
  more: MoreVertical,
  search: Search,
  chevron: ChevronRight,
  chevronDown: ChevronDown,
  activity: Activity,
  moon: Moon,
  bell: Bell,
  gear: Settings,
  x: X,
  check: Check,
  download: Download,
  copy: Copy,
  arrow: ArrowRight,
  link: Link2,
  cube: Box,
  terminal: Terminal,
  database: Database,
  grid: LayoutGrid,
  upload: Upload,
  edit: SquarePen,
  trash: Trash2,
  back: ArrowLeft,
  doc: FileText,
  lock: Lock,
  spark: Sparkles,
  power: Power,
  disconnect: Unplug,
};

const props = defineProps<{ name: string; size?: number }>();
const Comp = registry[props.name] ?? Box;
</script>

<template>
  <component :is="Comp" :size="size ?? 18" aria-hidden="true" />
</template>

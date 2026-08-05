// Shared reactive state — the single source of truth for the frontend.
// Services (store/*) mutate it; pages read it. Never duplicate backend
// storage here — state mirrors gateway/context-store state after refresh.

import { reactive, computed } from "vue";
import type { ConnectorInfo, ContextEntity, ProjectInfo, SessionInfo } from "../gateway.ts";
import type { CatalogState, MCPCatalogItem } from "../catalog.ts";
import type {
  User,
  Subscription,
  Plan,
  MCPServer,
  MCPApp,
  Skill,
  FAQItem,
  ConnStatus,
} from "../types.ts";

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    period: "month",
    features: ["1 connection", "1 active session", "Community skills"],
  },
  {
    id: "pro",
    name: "Pro",
    price: 1.5,
    period: "month",
    highlight: true,
    features: ["Unlimited connections", "Concurrent sessions", "Priority sync"],
  },
];

const FAQ: FAQItem[] = [
  {
    q: "What does AI Connect do?",
    a: "AI Connect lets your AI assistant, like ChatGPT, Claude, or Cursor, read and work with your engineering software. For example, you can ask your AI to inspect a Revit model, extract layers from an AutoCAD drawing, or analyze a QGIS project, all from one app.",
  },
  {
    q: "Do I need to install anything on my computer?",
    a: "Just the AI Connect desktop app. The connectors run in the background automatically. You don't need to use the terminal or write any code.",
  },
  {
    q: "How do I get started?",
    a: "After you sign in, open Connectors from the bottom menu. Browse the available connectors, pick the software you use, and click Install. Each connector has a step-by-step guide to help you set it up.",
  },
  {
    q: "How do I connect my AI agent?",
    a: "Go to the Help page and select your AI agent, like Claude, Cursor, or ChatGPT. You'll find a step-by-step guide with the commands you need. You only have to do this once.",
  },
  {
    q: "Where do the connectors come from?",
    a: "All connectors come from the AI Connect catalog. Browse Connectors, pick the software you need, and install it. No manual setup required.",
  },
  {
    q: "How do I install a connector?",
    a: "Open Connectors, find the software you want, and click Install. The connector downloads and sets itself up automatically. After that, click Connect to make it available to your AI.",
  },
  {
    q: "What can my AI actually do with AI Connect?",
    a: "Once connected, your AI can read and work with your engineering files. You can ask it to inspect models, extract data, generate reports, or automate repetitive tasks. For example, you could say 'list all window types in this Revit project' or 'export all layers from this AutoCAD drawing.'",
  },
  {
    q: "How do I get better results from my AI?",
    a: "The way you write your prompt makes a big difference. Be specific about what you want, mention the software you're using, and describe the output you expect. For example, instead of 'analyze this drawing,' try 'list all structural columns in this Revit model and export them as a CSV with column ID, level, and material.' The more detail you give, the better your AI can help.",
  },
  {
    q: "My AI isn't responding. What should I check?",
    a: "First, make sure AI Connect is open and shows 'Online' on the Dashboard. Then check that your AI agent is connected by going to the Help page and following the guide for your agent. If a connector shows as offline, try clicking the Refresh button on the Dashboard.",
  },
  {
    q: "How do I manage my subscription?",
    a: "Go to Settings, then Subscription. You can see your current plan, renewal date, and remaining days. To change plans or cancel, click Manage Subscription.",
  },
];

interface State {
  user: User | null;
  online: boolean;
  /** Resolved gateway base URL. Mirrors `gatewayUrl` from gateway.ts,
   *  which is a plain module `let` and therefore invisible to Vue's
   *  reactivity. Components that DISPLAY the endpoint (the setup and
   *  endpoints cards) need the resolved value, and the app mounts before
   *  `resolveGatewayUrl()` has settled — so a non-reactive read would
   *  freeze the pre-resolution default into copy-paste instructions. */
  gatewayBaseUrl: string;
  subscription: Subscription;
  /** Authoritative JWT/session entitlements (UI display only — never local authz). */
  entitlements: string[];
  selectedPlan: string | null;
  servers: MCPServer[];
  apps: MCPApp[];
  /** Raw gateway connector list — the LOCAL truth for the merge view model. */
  localConnectors: ConnectorInfo[];
  /** Remote catalog metadata (S3) — what CAN be installed. */
  mcpCatalog: MCPCatalogItem[];
  /** Remote catalog availability (distinct from "empty"). */
  catalogState: CatalogState;
  /** F1.1: project registry metadata (lightweight, no entity contents). */
  projects: ProjectInfo[];
  /** F1.1: active project = gateway routing state; re-read from backend. */
  activeProjectId: string | null;
  /** W3: UI-selected session for the AI workspace. FRONTEND-ONLY selection
   *  state — the gateway/context-store remain authoritative for session
   *  data. Never a second session database. */
  activeSessionId: string | null;
  /** Canonical sessions: raw gateway SessionInfo (backend-authoritative).
   *  NO synthetic seed — empty until the first successful refresh. */
  sessions: SessionInfo[];
  /** FE-8: in-flight fetch flags — pages render loading, never fake empty. */
  sessionsLoading: boolean;
  skillsLoading: boolean;
  mcpLoading: boolean;
  skills: Skill[];
  /** Phase D: Workspace Context view/cache (Context Store stays
   *  authoritative). Null = never loaded; [] = loaded empty. */
  context: ContextEntity[] | null;
  contextLoading: boolean;
  contextError: string | null;
  /** UI/cache metadata — epoch ms of the last SUCCESSFUL Context refresh. */
  contextLastUpdated: number | null;
  faq: FAQItem[];
  drawerOpen: boolean;
  toasts: { id: number; text: string; kind: "ok" | "error" }[];
}

export const state = reactive<State>({
  // Real auth (Checkpoint B): no demo account. restore() on startup re-logs-in.
  user: null,
  online: false,
  // Same default as gateway.ts DEFAULT_GATEWAY_URL; main.ts overwrites it
  // with the resolved value once resolveGatewayUrl() has run.
  gatewayBaseUrl: "http://127.0.0.1:8788",
  // Subscription: NO synthetic default. "unknown" until the first successful
  // billing refresh — never masquerade as active/Pro before authoritative data.
  subscription: {
    plan: "",
    status: "unknown",
    renews: "",
    daysRemaining: null,
  },
  entitlements: [],
  selectedPlan: "pro",
  // Live catalog comes from the gateway (Checkpoint C); empty until refresh().
  servers: [],
  apps: [],
  localConnectors: [],
  // Remote catalog (S3 metadata) + its availability state (Checkpoint: MCP Collection refactor).
  mcpCatalog: [],
  catalogState: "not-configured",
  // F1.1: projects + active project (lightweight metadata; backend authoritative).
  projects: [],
  activeProjectId: null,
  // W3: UI session selection (frontend-only).
  activeSessionId: null,
  // Canonical sessions: raw gateway data; no seed — empty until refresh.
  sessions: [],
  // Real skills come from the context store (Checkpoint E); empty until refresh.
  sessionsLoading: false,
  skillsLoading: false,
  mcpLoading: false,
  skills: [],
  context: null,
  contextLoading: false,
  contextError: null,
  contextLastUpdated: null,
  faq: FAQ,
  drawerOpen: false,
  toasts: [],
});

let toastId = 0;
export function toast(text: string, kind: "ok" | "error" = "ok") {
  const id = ++toastId;
  state.toasts.push({ id, text, kind });
  setTimeout(() => {
    const i = state.toasts.findIndex((t) => t.id === id);
    if (i >= 0) state.toasts.splice(i, 1);
  }, 3200);
}

export const isAuthed = computed(() => state.user !== null);

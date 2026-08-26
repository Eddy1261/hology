<script setup lang="ts">
import { ref, computed } from "vue";
import { state } from "../lib/store";
import TutorialStepperCard, { type TutorialStep } from "./TutorialStepperCard.vue";

// AI Local Logos
import OpencodeLogo from "../assets/logoai/Ailocal/Opencode.png";
import AntigravityLogo from "../assets/logoai/Ailocal/Antigravity.png";
import ClaudecodeLogo from "../assets/logoai/Ailocal/Claudecode.png";
import CodexLogo from "../assets/logoai/Ailocal/Codex.png";
import CursorLogo from "../assets/logoai/Ailocal/Cursor.png";
import HermesLogo from "../assets/logoai/Ailocal/Hermes.png";

// AI Web Logos
import ChatgptLogo from "../assets/logoai/Aiweb/chatgpt.png";
import ClaudeWebLogo from "../assets/logoai/Aiweb/claude-logo.png";
import GrokLogo from "../assets/logoai/Aiweb/grok-logo.webp";

export type ModeId = "local" | "web";
export type LocalServiceId = "opencode" | "codex" | "antigravity" | "claude_code" | "cursor" | "hermes";
export type WebServiceId = "chatgpt" | "claude_web" | "grok";
export type ServiceId = LocalServiceId | WebServiceId;

const activeMode = ref<ModeId>("local");
const selectedService = ref<ServiceId>("opencode");
const currentStep = ref(1);

// Hosted web AI services (ChatGPT, Claude.ai, Grok) run on remote cloud servers —
// they can never reach a loopback address. They need the Cloudflare tunnel's
// public aggregate root. For Claude Web and Grok, this fronts an OAuth bridge (DCR + sign-in).
const PUBLIC_TUNNEL_MCP_URL = "https://tunnel.aiconnect.fun/mcp";
const CLAUDE_WEB_MCP_URL = PUBLIC_TUNNEL_MCP_URL;
const GROK_MCP_URL = PUBLIC_TUNNEL_MCP_URL;

interface ServiceItem {
  id: ServiceId;
  name: string;
  label: string;
  logo: string;
  category: "local" | "web";
}

const localServices: ServiceItem[] = [
  { id: "opencode", name: "OpenCode", label: "OpenCode", logo: OpencodeLogo, category: "local" },
  { id: "codex", name: "Codex", label: "Codex", logo: CodexLogo, category: "local" },
  { id: "antigravity", name: "Antigravity", label: "Antigravity", logo: AntigravityLogo, category: "local" },
  { id: "claude_code", name: "Claude Code", label: "Claude", logo: ClaudecodeLogo, category: "local" },
  { id: "cursor", name: "Cursor", label: "Cursor", logo: CursorLogo, category: "local" },
  { id: "hermes", name: "Hermes", label: "Hermes", logo: HermesLogo, category: "local" },
];

const webServices: ServiceItem[] = [
  { id: "chatgpt", name: "ChatGPT", label: "ChatGPT", logo: ChatgptLogo, category: "web" },
  { id: "claude_web", name: "Claude Web", label: "Claude", logo: ClaudeWebLogo, category: "web" },
  { id: "grok", name: "Grok", label: "Grok", logo: GrokLogo, category: "web" },
];

const currentServices = computed(() => {
  return activeMode.value === "local" ? localServices : webServices;
});

function switchMode(mode: ModeId) {
  activeMode.value = mode;
  selectedService.value = mode === "local" ? "opencode" : "chatgpt";
  currentStep.value = 1;
}

// COMPUTED, not a module constant: every endpoint below is copy-paste setup
// text the user pastes into an external agent, and the gateway is not
// guaranteed to be on 8788 — it falls back to an OS-assigned port when that
// one is taken. Baking the default in produced instructions that silently
// never connect. `state.gatewayBaseUrl` is the resolved base.
const stepsConfig = computed<Record<ServiceId, { title: string; steps: TutorialStep[] }>>(() => {
  const base = state.gatewayBaseUrl;
  const LOCAL_MCP_URL = `${base}/mcp`;
  return {
  // --- LOCAL AI SERVICES ---
  opencode: {
    title: "OpenCode CLI Setup Tutorial",
    steps: [
      {
        title: "Activate the MCP Server",
        description: `Ensure the local AiConnect Gateway daemon is running on your machine at ${base}.`,
        command: `curl -s ${base}/health`,
        tip: "The gateway status indicator confirms if the daemon is reachable.",
      },
      {
        title: "Install OpenCode CLI",
        description: "Make sure you have the OpenCode CLI installed and available in your terminal.",
        command: "opencode --version",
        tip: "If OpenCode is not installed, install with npm: npm install -g opencode-ai",
      },
      {
        title: "Register AIConnect MCP Server",
        description: `Register the AI CONNECT gateway as a remote MCP server in OpenCode. In the interactive prompt, enter Name: aiconnect, Type: remote, and URL: ${LOCAL_MCP_URL}.`,
        command: "opencode mcp add",
        tip: "Use aiconnect as the server name and register the AI CONNECT MCP endpoint as a remote server.",
      },
      {
        title: "Verify MCP Connection",
        description: "Confirm that AI CONNECT is connected and its engineering tools are available in OpenCode.",
        command: "opencode mcp list",
        tip: "You should see aiconnect in the configured MCP servers and its connection should be healthy.",
      },
      {
        title: "Run an AI CONNECT Prompt",
        description: 'Prompt OpenCode to use AI CONNECT tools to perform an action in your connected engineering software. In your OpenCode session, enter a prompt such as: "Use AI CONNECT to inspect the active model and summarize the project elements."',
        command: "opencode",
        tip: "OpenCode will use the AI CONNECT MCP server to access the engineering tools exposed by the local gateway.",
      },
    ],
  },
  codex: {
    title: "Codex CLI & IDE Setup Tutorial",
    steps: [
      {
        title: "Activate the MCP Server",
        description: `Ensure the local AiConnect Gateway daemon is running on your machine at ${base}.`,
        command: `curl -s ${base}/health`,
        tip: "The gateway status indicator confirms if the daemon is reachable.",
      },
      {
        title: "Install Codex CLI / Bridge",
        description: "Make sure you have the Codex CLI environment installed and authenticated.",
        command: "codex --version",
        tip: "If not installed, install via npm: npm install -g @openai/codex",
      },
      {
        title: "Register AiConnect connector",
        description: "Register the universal gateway endpoint with Codex.",
        command: `codex mcp add aiconnect ${LOCAL_MCP_URL}`,
        tip: "This exposes all active connectors in a single step.",
      },
      {
        title: "Verify Discovered Tools",
        description: "Confirm that active engineering tools are detected by Codex.",
        command: "codex mcp list",
        tip: "You should see tools corresponding to Revit, AutoCAD, etc.",
      },
      {
        title: "Run Automation Prompt",
        description: "Prompt Codex to generate scripts and execute actions in your models.",
        command: "codex 'Generate drawing export automation script'",
        tip: "Codex will execute tools securely through the local gateway.",
      },
    ],
  },
  antigravity: {
    title: "Antigravity Integration Tutorial",
    steps: [
      {
        title: "Activate the MCP Server",
        description: `Ensure the local AiConnect Gateway daemon is running on your machine at ${base}.`,
        command: `curl -s ${base}/health`,
        tip: "The gateway status indicator confirms if the daemon is reachable.",
      },
      {
        title: "Register AiConnect connector in Antigravity",
        description: "Run the official Antigravity command to register the universal gateway endpoint.",
        command: `agy mcp add aiconnect ${LOCAL_MCP_URL}`,
        tip: "This links all active connectors (AutoCAD, Revit, QGIS, etc.) in a single step.",
      },
      {
        title: "Verify Connected Tools",
        description: "List all discovered MCP tools inside your Antigravity environment to confirm active status.",
        command: "agy mcp list",
        tip: "You should see tools corresponding to your enabled connectors.",
      },
      {
        title: "Configure Agent Capabilities",
        description: "Select which connector capabilities you want to grant to your Antigravity agent.",
        command: "",
        tip: "Skills and memory entities are shared seamlessly.",
      },
      {
        title: "Invoke Tools from Agent Prompt",
        description: "Prompt your agent naturally to execute actions in your engineering software.",
        command: "agy 'Extract the layers from the active drawing and summarize'",
        tip: "Antigravity will automatically route tool calls through the AiConnect Gateway.",
      },
    ],
  },
  claude_code: {
    title: "Claude Code (CLI) Integration Tutorial",
    steps: [
      {
        title: "Activate the MCP Server",
        description: `Ensure the local AiConnect Gateway daemon is running on your machine at ${base}.`,
        command: `curl -s ${base}/health`,
        tip: "The gateway status indicator confirms if the daemon is reachable.",
      },
      {
        title: "Check Claude Code Installation",
        description: "Ensure you have the Claude Code CLI installed and authenticated in your terminal.",
        command: "claude --version",
        tip: "If not installed, install it via: npm install -g @anthropic-ai/claude-code",
      },
      {
        title: "Add AiConnect Gateway to Claude Code",
        description: "Add the AiConnect connector endpoint to your Claude Code environment.",
        command: `claude mcp add aiconnect ${LOCAL_MCP_URL}`,
        tip: "Claude Code will automatically discover all active tools exposed by the gateway.",
      },
      {
        title: "Start Claude Code Session",
        description: "Launch Claude Code in your project directory and start using connector tools.",
        command: "claude",
        tip: "Type /mcp inside Claude Code to verify that 'aiconnect' is connected with a green dot.",
      },
      {
        title: "Prompt with Engineering Tools",
        description: "Ask Claude Code to inspect models, extract geometry, or generate schedules.",
        command: "claude 'Inspect active Revit document and list all window types'",
        tip: "Claude executes actions securely via the local gateway.",
      },
    ],
  },
  cursor: {
    title: "Cursor IDE Setup Tutorial",
    steps: [
      {
        title: "Activate the MCP Server",
        description: `Ensure the local AiConnect Gateway daemon is running on your machine at ${base}.`,
        command: `curl -s ${base}/health`,
        tip: "Check that the status is healthy.",
      },
      {
        title: "Open Cursor MCP Settings",
        description: "In Cursor IDE, open Settings (Ctrl+, / Cmd+,) ➔ Features ➔ MCP Servers.",
        command: "",
        tip: "Or edit .cursor/mcp.json in your project workspace directory.",
      },
      {
        title: "Add AiConnect Gateway Configuration",
        description: "Paste this configuration block into your project's .cursor/mcp.json file.",
        command: JSON.stringify(
          {
            mcpServers: {
              aiconnect: {
                url: LOCAL_MCP_URL,
              },
            },
          },
          null,
          2
        ),
        tip: "Cursor will show a green status light next to 'aiconnect'.",
      },
      {
        title: "Verify Tools in Cursor Composer",
        description: "Open Cursor Composer (Ctrl+I / Cmd+I) and confirm AiConnect tools are listed.",
        command: "",
        tip: "Cursor Composer seamlessly integrates MCP tool definitions.",
      },
      {
        title: "Prompt Composer with Tools",
        description: "Ask Cursor Composer to modify or inspect your CAD/BIM drawings.",
        command: "Ask: 'Analyze structural layout and check compliance'",
        tip: "AiConnect executes CAD tool calls in real time.",
      },
    ],
  },
  hermes: {
    title: "Hermes Autonomous Agent Setup Tutorial",
    steps: [
      {
        title: "Activate the MCP Server",
        description: `Ensure the local AiConnect Gateway daemon is running on your machine at ${base}.`,
        command: `curl -s ${base}/health`,
        tip: "The gateway status indicator confirms if the daemon is reachable.",
      },
      {
        title: "Configure Hermes MCP Endpoint",
        description: "Register the AiConnect gateway URL in your Hermes agent configuration.",
        command: `hermes config set mcp.aiconnect.url ${LOCAL_MCP_URL}`,
        tip: "Hermes stores tool endpoints in ~/.hermes/config.json.",
      },
      {
        title: "Test Gateway Handshake",
        description: "Verify that Hermes can query available tools from the gateway.",
        command: "hermes mcp ping",
        tip: "Look for a 200 OK response from the gateway.",
      },
      {
        title: "Enable Skills & Workflows",
        description: "Select which engineering skills you want Hermes to utilize autonomously.",
        command: "",
        tip: "Hermes can chain multiple CAD/BIM tools into automated multi-step workflows.",
      },
      {
        title: "Execute Autonomous Task",
        description: "Launch an autonomous task run with Hermes.",
        command: "hermes run 'Generate room schedule report from CAD and save to CSV'",
        tip: "Hermes will run the task and write results directly to your project.",
      },
    ],
  },

  // --- WEB AI SERVICES ---
  chatgpt: {
    title: "ChatGPT Web Custom MCP Setup",
    steps: [
      {
        title: "Turn on the Public Tunnel",
        description: "ChatGPT Web runs on OpenAI's servers, not your machine — it needs the Public Tunnel toggle (Gateway Endpoints) turned on, not just the local daemon.",
        command: `curl -s ${base}/health`,
        tip: "The local gateway must be running AND the Public Tunnel toggle must be on, or OpenAI servers cannot reach your machine.",
      },
      {
        title: "Open ChatGPT Settings",
        description: "In ChatGPT Web, open Settings ➔ Connected Apps / Custom MCP, or configure Custom Actions.",
        command: PUBLIC_TUNNEL_MCP_URL,
        tip: `Enter ${PUBLIC_TUNNEL_MCP_URL} or copy the live Public Tunnel URL from the Gateway Endpoints card on your Dashboard. Do not use 127.0.0.1.`,
      },
      {
        title: "Configure Authentication",
        description: "Select the authentication method required by your ChatGPT integration.",
        command: "",
        tip: "If using the live session URL (/t/<secret>/mcp) from Gateway Endpoints, the token is in the path — choose 'None' / No Auth. If using the stable root URL, use OAuth.",
      },
      {
        title: "Select Active Engineering Connectors",
        description: "Pick which engineering software tools you want ChatGPT to have access to.",
        command: "",
        tip: "You can toggle connectors on or off in the Dashboard at any time.",
      },
      {
        title: "Prompt ChatGPT with Tools",
        description: "Start chatting with ChatGPT and ask it to read, analyze, or automate CAD/BIM tasks.",
        command: "Ask: 'List all architectural layers and summarize room parameters'",
        tip: "Public tunnel tokens reset every hour or when the app is closed. If ChatGPT loses connection, click Renew Tunnel in Gateway Endpoints and update the URL.",
      },
    ],
  },
  claude_web: {
    title: "Claude Web Integration Setup",
    steps: [
      {
        title: "Turn on the Public Tunnel",
        description: "Claude Web runs on Anthropic's servers, not your machine — it needs the Public Tunnel toggle (Gateway Endpoints) turned on, not just the local daemon.",
        command: `curl -s ${base}/health`,
        tip: "The local gateway must be running AND the Public Tunnel toggle must be on, or Claude has no session to sign in to.",
      },
      {
        title: "Open Claude Web Settings",
        description: "In Claude Web, navigate to Settings ➔ Connectors ➔ Add custom connector.",
        command: "",
        tip: "No manual OAuth Client ID is needed — AiConnect registers one automatically.",
      },
      {
        title: "Add Gateway Server Endpoint",
        description: "Provide the AiConnect tunnel endpoint URL — this is publicly reachable, unlike the loopback address used for local tools.",
        command: CLAUDE_WEB_MCP_URL,
        tip: "Do not use the 127.0.0.1 address here — Claude's hosted servers cannot reach your machine directly.",
      },
      {
        title: "Sign in when prompted",
        description: "Claude will redirect you to a sign-in page to link this connector to your AiConnect account.",
        command: "",
        tip: "Sign in with the same email or Google account as this desktop app, so Claude binds to your active tunnel session.",
      },
      {
        title: "Prompt Claude Web",
        description: "Chat with Claude Web to interact with your CAD/BIM projects.",
        command: "Ask: 'Inspect drawing metadata and extract schedules'",
        tip: "Claude Web will invoke AiConnect tools in real time through the tunnel.",
      },
    ],
  },
  grok: {
    title: "Grok Web Integration Setup",
    steps: [
      {
        title: "Turn on the Public Tunnel",
        description: "Grok Web runs on remote cloud servers, not your machine — it needs the Public Tunnel toggle (Gateway Endpoints) turned on, not just the local daemon.",
        command: `curl -s ${base}/health`,
        tip: "The local gateway must be running AND the Public Tunnel toggle must be on, or Grok has no session to reach.",
      },
      {
        title: "Open Grok Settings",
        description: "In Grok Web, navigate to Settings ➔ Connectors / Custom Tools ➔ Add custom connector.",
        command: "",
        tip: "No manual OAuth Client ID is needed — AiConnect Dynamic Client Registration (DCR) handles it automatically.",
      },
      {
        title: "Add Gateway Server Endpoint",
        description: "Provide the AiConnect tunnel endpoint URL — this connects Grok to your local engineering tools via the secure cloud relay.",
        command: GROK_MCP_URL,
        tip: "Do not use the 127.0.0.1 address here — Grok's hosted servers cannot reach your machine directly.",
      },
      {
        title: "Sign in when prompted",
        description: "Grok will redirect you to an authorization page to link this connector to your AiConnect account.",
        command: "",
        tip: "Sign in with the same email or Google account as this desktop app, so Grok binds to your active tunnel session.",
      },
      {
        title: "Prompt Grok Web",
        description: "Chat with Grok Web to interact with your CAD/BIM models and engineering tools.",
        command: "Ask: 'Inspect active project elements and summarize engineering properties'",
        tip: "Grok Web will invoke AiConnect tools in real time through the tunnel.",
      },
    ],
  },
  };
});

function selectService(id: ServiceId) {
  selectedService.value = id;
  currentStep.value = 1;
}


// Drag to scroll logic for horizontal tiles
const scrollContainer = ref<HTMLElement | null>(null);
let isDown = false;
let startX = 0;
let scrollLeft = 0;
let hasDragged = false;

function onMouseDown(e: MouseEvent) {
  if (!scrollContainer.value) return;
  isDown = true;
  hasDragged = false;
  startX = e.pageX - scrollContainer.value.offsetLeft;
  scrollLeft = scrollContainer.value.scrollLeft;
}

function onMouseLeave() {
  isDown = false;
}

function onMouseUp() {
  isDown = false;
}

function onMouseMove(e: MouseEvent) {
  if (!isDown || !scrollContainer.value) return;
  e.preventDefault();
  const x = e.pageX - scrollContainer.value.offsetLeft;
  const walk = (x - startX) * 1.4;
  if (Math.abs(walk) > 4) {
    hasDragged = true;
  }
  scrollContainer.value.scrollLeft = scrollLeft - walk;
}

function handleTileClick(id: ServiceId) {
  if (!hasDragged) {
    selectService(id);
  }
}

const activeConfig = computed(() => stepsConfig.value[selectedService.value] || stepsConfig.value.opencode);
</script>

<template>
  <div class="flex flex-col gap-3.5 w-full mb-4">
    <!-- Header Subtitle & Segmented Toggle Switch -->
    <div class="flex flex-col items-center gap-2 pt-1">
      <h2 class="text-[13.5px] font-bold text-fg tracking-wide">How To Connect With</h2>

      <!-- Pill Toggle (AI Local | AI Web) -->
      <div class="rounded-full p-1 bg-panel border border-border flex items-center gap-1 select-none shadow-xs">
        <button
          @click="switchMode('local')"
          class="rounded-full px-4 py-1 text-[12px] font-semibold transition-all cursor-pointer"
          :class="[
            activeMode === 'local'
              ? 'bg-card text-fg shadow-xs border border-border/80'
              : 'text-muted hover:text-fg'
          ]"
        >
          AI Local
        </button>

        <button
          @click="switchMode('web')"
          class="rounded-full px-4 py-1 text-[12px] font-semibold transition-all cursor-pointer"
          :class="[
            activeMode === 'web'
              ? 'bg-card text-fg shadow-xs border border-border/80'
              : 'text-muted hover:text-fg'
          ]"
        >
          AI Web
        </button>
      </div>
    </div>

    <!-- Dynamic AI Logo Tiles Row (1-Line Scrollable with Drag & Centering) -->
    <div
      ref="scrollContainer"
      @mousedown="onMouseDown"
      @mouseleave="onMouseLeave"
      @mouseup="onMouseUp"
      @mousemove="onMouseMove"
      class="flex items-center gap-2.5 px-4 py-2 overflow-x-auto select-none w-full cursor-grab active:cursor-grabbing scroll-smooth [&::-webkit-scrollbar]:hidden"
      :class="currentServices.length <= 4 ? 'justify-center' : 'justify-start'"
      style="scrollbar-width: none; -ms-overflow-style: none;"
    >
      <button
        v-for="s in currentServices"
        :key="s.id"
        @click="handleTileClick(s.id)"
        class="w-[72px] h-[70px] rounded-2xl bg-card border-2 flex flex-col items-center justify-center transition-all cursor-pointer shadow-xs shrink-0 group relative px-1 py-1.5"
        :class="[
          selectedService === s.id
            ? 'border-primary ring-2 ring-primary/30 scale-105 bg-primary-dim z-10'
            : 'border-border hover:border-border-strong hover:bg-card-hover'
        ]"
        :title="s.name"
      >
        <!-- Logo Image container -->
        <div class="w-8 h-8 rounded-xl bg-panel flex items-center justify-center border border-border/80 overflow-hidden p-0.5 group-hover:scale-105 transition-transform shrink-0 pointer-events-none">
          <img :src="s.logo" :alt="s.name" class="w-full h-full object-contain pointer-events-none" />
        </div>
        <!-- Fully readable Label without truncation -->
        <span class="text-[8px] font-bold text-muted mt-1 tracking-tight text-center leading-tight pointer-events-none">
          {{ s.label }}
        </span>
      </button>
    </div>

    <!-- Subtitle instruction -->
    <p class="text-[12px] text-muted text-center">Tap any service above to see connection tutorials</p>

    <!-- Connect Tutorial Stepper Card -->
    <TutorialStepperCard
      title="Connect Tutorial"
      :steps="activeConfig.steps"
      v-model="currentStep"
    />
  </div>
</template>

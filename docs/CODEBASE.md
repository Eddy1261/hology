# AI CONNECT — Codebase Context

Compact **398×675** desktop-companion app for managing AI ↔ MCP connections. **Vue 3 + vue-router + Vite + Tailwind v4**, Tauri shell (sidecar-spawns the repo's Rust gateway, `apps/gateway`). All product data is mocked behind the service layer in `lib/store.ts`; the one real integration so far is the gateway `/health` probe (`lib/gateway.ts`, Checkpoint A of frontend-integration-plan).

## Stack & tooling
- **Runtime:** Vue 3.5 (`<script setup lang="ts">` SFCs), vue-router 4
- **Build:** Vite 8 + `@vitejs/plugin-vue`, Tailwind CSS v4 via `@tailwindcss/vite`
- **Fonts:** Inter (UI) + JetBrains Mono (endpoints, tool logs, metadata) via Google Fonts `@import`
- **Alias:** `@` → `src`
- **Dev server:** already running on `$PORT` (8443); `pnpm build` to verify

> Note: the project was converted from the original React scaffold to Vue at the start of this build. `vite.config.ts` still contains Figma's React-oriented helper plugins (error-overlay replay, refresh-boundary fallback, make-kit) — they're inert for `.vue` files and safe to leave.

## Directory map
```
src/
├── main.ts                 # createApp + router + index.css, mounts #root
├── App.vue                 # fixed 398×675 panel shell + <router-view> + <Toasts>
├── index.css               # font import, Tailwind, @theme design tokens, keyframes
├── lib/
│   ├── router.ts           # routes + auth guard (redirect /app/* → /login)
│   ├── store.ts            # reactive state + mock services + toast helper
│   └── types.ts            # domain types
├── components/
│   ├── AppShell.vue        # TopBar + scroll area + NavDrawer (layout for /app/*)
│   ├── TopBar.vue          # ☰ · AI CONNECT · ?
│   ├── NavDrawer.vue       # slide-in nav + account/subscription/sign-out
│   ├── ServerCard.vue      # connected-server card (toggle, overflow menu, confirm)
│   ├── MCPListItem.vue     # available-app row (Connect → guide)
│   ├── RobotMascot.vue     # SVG brand mascot + orbit rings
│   ├── Toasts.vue          # bottom toast stack
│   └── ui/                 # primitives
│       ├── ACButton.vue  Toggle.vue  Sheet.vue  ConfirmDialog.vue
│       ├── SearchBar.vue  TextField.vue  StatusDot.vue  IconTile.vue
│       ├── Icon.vue        # single inline-SVG icon set keyed by name
│       └── EmptyState.vue
├── pages/                  # one file per route
│   ├── Landing.vue  Login.vue  Signup.vue  Payment.vue
│   ├── Dashboard.vue  Sessions.vue  SessionDetail.vue
│   ├── MCPCollection.vue  MCPGuide.vue  Skills.vue  Help.vue  Settings.vue
└── imports/                # original PRD + reference screenshot (read-only)
```

## Routing (`lib/router.ts`)
| Path | Page | Access |
|---|---|---|
| `/` | Landing | public |
| `/login`, `/signup`, `/payment` | Auth flow | public |
| `/app` | Dashboard | **guarded** |
| `/app/sessions`, `/app/session/:id` | Sessions / detail | guarded |
| `/app/mcp`, `/app/mcp/:id` | Collection / **connect guide** | guarded |
| `/app/skills`, `/app/help`, `/app/settings` | — | guarded |

`/app/*` is a child layout under `AppShell`. `beforeEach` redirects unauthenticated users to `/login`. There's a **pre-seeded demo account** (`demo@aiconnect.app`) in the store so the app is explorable without signing in.

## State & services (`lib/store.ts`) — the single source of truth
UI never calls APIs inline; everything reads/writes `state` and calls mock services.

- **`state`** (reactive): `user`, `online`, `subscription`, `servers[]`, `apps[]` (catalog), `sessions[]`, `skills[]`, `faq[]`, `drawerOpen`, `toasts[]`
- **`auth`** — `login` / `signup` (simulated latency + validation), `logout`
- **`mcp`** — `connect` (disconnected→connecting→connected, pushes a server + toast), `addCustom`, `testConnection`, `disconnect` (removes server and **returns a card to Available** — re-adds a catalog entry for seeded/custom servers with no existing one)
- **`endSession`**, **`toast(text, kind)`**
- Computed: `isAuthed`, `activeServers`
- Constants: `PLANS`, `FAQ`

## Key flows
- **Connect an MCP:** Collection card *or* dashboard `Connect` → **guide page** (`/app/mcp/:id`, per-MCP tutorial) → guide's Connect runs `mcp.connect` → dashboard. Each MCP has its own tutorial so custom connect steps can be added later.
- **Disconnect:** ServerCard ⋮ menu → **ConfirmDialog** → server removed, card reappears under Available.
- **Auth:** Landing → Signup (account + plan in one flow) → Payment (loading/success/error/retry) → app; or Login.
- **Destructive actions** (disconnect, end session, delete skill) all route through `ConfirmDialog`.

## Design system (`index.css` `@theme` tokens)
Near-black surfaces + single AI-CONNECT blue accent; status is **always label + dot**, never color alone.
- Surfaces: `bg #06080c`, `panel`, `card`, `card-hover`, `border`, `border-strong`
- Text: `fg`, `muted`, `faint`
- Accent: `primary #3b82f6`, `primary-hi`, `primary-dim`
- Status: `ok` (green), `danger` (red), `warn` (amber)
- Fonts: `--font-sans` (Inter), `--font-mono` (JetBrains Mono); `--radius-card`
- Animations: `page-enter`, `spin`, `pulse`, `ac-orbit`; custom `.scroll-area` scrollbars

Use these tokens as Tailwind utilities (`bg-card`, `text-muted`, `border-border`, etc.). The panel is fixed 398×675 on desktop (≥640px) and fills the viewport on narrow screens.

## Conventions
- Build UI as `.vue` SFCs with `<script setup lang="ts">`; use existing `ui/` primitives before writing custom markup.
- Prefer bottom **`Sheet`** (drawer) for detail/creation flows to preserve context; **`ConfirmDialog`** for anything destructive.
- Add icons by extending the `paths` map in `ui/Icon.vue` (24×24 stroke paths).
- Double-quote strings containing apostrophes (single-quote apostrophes break the build).

## Known stubs / gaps
- Settings "Manage Account" / "Manage Connection" are toast placeholders (no destination screens).
- Dashboard refresh spins but doesn't refetch (no live source).
- Skill `.md` import is a placeholder button.
- Notifications/appearance toggles are local-only.

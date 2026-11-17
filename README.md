# AI CONNECT

Desktop companion app untuk mengelola koneksi **AI ↔ MCP (Model Context Protocol)** dalam satu panel ringkas 398×675.

Aplikasi ini memudahkan pengguna menghubungkan asisten AI (ChatGPT, Claude, Cursor, Codex, dan lainnya) dengan berbagai MCP connector, memantau sesi kerja AI, mengatur proyek & workspace, serta mengelola skills yang aktif. Seluruh alur utama tersedia: onboarding tutorial, autentikasi (login, signup, pembayaran), dashboard konektor, koleksi MCP beserta panduan koneksi per-MCP, AI workspace/session, skills, help, dan settings. Data produk di-mock di belakang service layer (`src/lib/store/`), sementara integrasi nyata yang sudah berjalan adalah health probe gateway (`src/lib/gateway.ts`).

## Anggota Kelompok — K2

| No | Nama | NIM |
|----|------|-----|
| 1 | Abdul Halim Edi Rahmansyah | 23/516603/TK/56796 |
| 2 | Reza Hanif Firmansyah | 23/522571/TK/57700 |

## Tautan Proyek

| Resource | Tautan | Status |
|----------|--------|--------|
| Web App (Deployed) | [Buka Web App (Placeholder)](https://placeholder-webapp-url.example.com) | Placeholder — ganti dengan URL deploy |
| Video Demo | [Tonton Video Demo (Placeholder)](https://placeholder-video-url.example.com) | Placeholder — ganti dengan link video |
| Laporan Proyek | [Buka Folder Google Drive](https://drive.google.com/drive/folders/1Uajg6uu6cwekXDKAz5xhMoPCuvA-V5Oq?usp=sharing) | Aktif |

## Struktur Folder dan File

```
hology/
├── docs/
│   └── CODEBASE.md                  # catatan konteks & arsitektur codebase
├── e2e/                             # pengujian end-to-end (Playwright)
│   ├── global-setup.ts
│   ├── helpers.ts
│   ├── scripts/
│   │   ├── install-browser-libs.sh
│   │   └── start-auth.sh
│   └── tests/
│       ├── auth.existing-user.spec.ts
│       ├── mcp.collection.spec.ts
│       ├── onboarding.new-user.spec.ts
│       ├── shell.scroll.spec.ts
│       ├── workspace.project-selection.spec.ts
│       ├── workspace.session-selection.spec.ts
│       ├── _probe.spec.ts
│       └── _smoke.spec.ts
├── src/                             # aplikasi frontend (Vue 3)
│   ├── assets/                      # logo, maskot, font, artwork tutorial
│   │   ├── fonts/
│   │   ├── logoai/                  # logo AI lokal & web (Ailocal/Aiweb)
│   │   ├── tutorial/                # ilustrasi slide onboarding
│   │   ├── logo.webp
│   │   ├── logo-dark.webp
│   │   └── mascot.webp
│   ├── components/                  # komponen UI aplikasi
│   │   ├── ui/                      # primitif UI (ACButton, Sheet, Toggle, dll.)
│   │   ├── AppShell.vue
│   │   ├── TopBar.vue
│   │   ├── NavDrawer.vue
│   │   ├── ServerCard.vue
│   │   ├── MCPListItem.vue
│   │   ├── AgentSetupCard.vue
│   │   ├── GatewayEndpointsCard.vue
│   │   ├── OnboardingTutorial.vue
│   │   ├── ProjectSelector.vue
│   │   ├── TitleBar.vue
│   │   ├── Toasts.vue
│   │   └── ... (komponen lain)
│   ├── imports/                     # PRD & referensi desain (read-only)
│   ├── lib/                         # logika aplikasi & service layer
│   │   ├── store/                   # reactive state + mock services
│   │   │   ├── auth.ts
│   │   │   ├── billing.ts
│   │   │   ├── catalog.ts
│   │   │   ├── context.ts
│   │   │   ├── downloads.ts
│   │   │   ├── latest.ts
│   │   │   ├── mcp.ts
│   │   │   ├── projects.ts
│   │   │   ├── sessions.ts
│   │   │   ├── skills.ts
│   │   │   ├── state.ts
│   │   │   └── index.ts
│   │   ├── router.ts                # route + auth guard
│   │   ├── gateway.ts               # integrasi gateway sidecar (health probe)
│   │   ├── types.ts                 # tipe domain
│   │   ├── theme.ts / ui-state.ts   # tema & state UI
│   │   ├── workspace.ts             # logika workspace/session
│   │   └── ... (modul + unit test *.test.ts)
│   ├── pages/                       # satu file per route
│   │   ├── Landing.vue
│   │   ├── Login.vue
│   │   ├── Signup.vue
│   │   ├── Payment.vue
│   │   ├── Dashboard.vue
│   │   ├── AIWorkspace.vue
│   │   ├── Projects.vue
│   │   ├── MCPCollection.vue
│   │   ├── MCPGuide.vue
│   │   ├── Skills.vue
│   │   ├── Help.vue
│   │   └── Settings.vue
│   ├── App.vue                      # shell panel 398×675 + router-view
│   ├── index.css                    # font, Tailwind, design token (@theme)
│   └── main.ts
├── src-tauri/                       # shell desktop (Tauri 2 / Rust)
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   └── offline.rs               # layer data lokal saat offline
│   ├── capabilities/
│   ├── gen/schemas/
│   ├── icons/
│   ├── windows/hooks.nsh
│   ├── tauri.conf.json
│   └── trust-store.default.json
├── index.html
├── package.json
├── playwright.config.ts
├── tsconfig.json
├── vite.config.ts
├── stage-gateway-sidecar.ps1 / .sh  # staging sidecar gateway
├── stage-sdk.ps1 / .sh              # staging SDK
├── stage-runtimes.py                # staging runtime (Node & Python)
└── README.md
```


## Teknologi yang Digunakan

| Kategori | Teknologi |
|----------|-----------|
| Bahasa | TypeScript 5.7, Rust |
| Frontend | Vue 3.5 (Composition API, `<script setup lang="ts">`), vue-router 4 |
| Build tool | Vite 8 + `@vitejs/plugin-vue`, pnpm |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`), design token kustom `@theme` |
| Desktop shell | Tauri 2 (Rust) — spawn gateway sidecar, keychain, OAuth PKCE |
| Backend/sidecar | Gateway Rust (Cargo: tokio, serde, keyring, ureq, redb/context-store) |
| Ikon & Markdown | lucide-vue-next, marked |
| Font | Inter (UI), JetBrains Mono (mono), Plus Jakarta Sans (aset lokal) |
| Testing | Playwright (E2E), Node test runner (`node --experimental-strip-types`) |
| Tooling | mise, PowerShell/Shell staging scripts |

## Dokumentasi Kode & Cara Menjalankan

### 1. Prasyarat
- **Node.js** & **pnpm** (`pnpm@11.24.0` sesuai `packageManager` di `package.json`)
- **Rust & Cargo + Tauri CLI** (opsional, diperlukan jika membangun/menjalankan desktop shell di `src-tauri/`)

### 2. Instalasi & Perintah Utama
```bash
# Install dependensi frontend
pnpm install

# Menjalankan dev server frontend (Vite)
pnpm dev

# Type-checking TypeScript & Vue SFC
pnpm typecheck

# Build produksi frontend
pnpm build

# Preview hasil build produksi
pnpm preview

# Menjalankan unit test (Node test runner)
pnpm test

# Menjalankan pengujian E2E (Playwright)
pnpm e2e

# Menjalankan / membangun desktop app (Tauri)
pnpm tauri dev
pnpm tauri build
```

### 3. Arsitektur & Alur Kode
- **Entry & Shell (`src/main.ts`, `src/App.vue`):** Menginisialisasi aplikasi Vue 3, router, dan design system Tailwind v4 dalam panel utama berukuran `398×675` beserta komponen toast global (`Toasts.vue`).
- **Routing & Auth Guard (`src/lib/router.ts`):**
  - **Rute publik:** `/`, `/login`, `/signup`, `/payment`
  - **Rute terproteksi (`/app/*`, dibungkus `AppShell.vue`):** `/app` (`Dashboard`), `/app/projects` (`Projects`), `/app/workspace` (`AIWorkspace`), `/app/mcp` (`MCPCollection`), `/app/mcp/:id` (`MCPGuide`), `/app/skills` (`Skills`), `/app/help` (`Help`), dan `/app/settings` (`Settings`).
  - `router.beforeEach` memeriksa `isAuthed`; pengguna yang belum terautentikasi diarahkan ke `/login` dan rute tujuan sebelumnya disimpan melalui `setPendingAuthRoute`.
- **State & Service Layer (`src/lib/store/`):**
  - `src/lib/store/index.ts` menjadi barrel export untuk state reaktif terpusat (`state`, `isAuthed`, `PLANS`, `toast`) dan modul layanan domain (`auth`, `billing`, `catalog`, `projects`, `context`, `sessions`, `skills`, `mcp`, `gateway`).
- **Gateway Client & Desktop Shell (`src/lib/gateway.ts`, `src-tauri/src/`):**
  - `src/lib/gateway.ts` menangani komunikasi ke gateway sidecar lokal (default `http://127.0.0.1:8788`, dapat di-override lewat `VITE_GATEWAY_URL`, atau di-resolve dinamis via `resolveGatewayUrl()` saat berjalan di Tauri).
  - `src-tauri/src/lib.rs` dan `src-tauri/src/offline.rs` mengatur spawn gateway sidecar, penyimpanan kredensial di OS keychain (`keyring`), autentikasi Google OAuth PKCE loopback, serta layer akses data lokal saat offline.

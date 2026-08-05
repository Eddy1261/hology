// Runtime configuration — env-overridable, drop-in values (no code change
// needed to point at a different backend or swap the Google OAuth client).
//
//   VITE_AUTH_SERVICE_URL   cloud auth-service base (default local dev)
//   VITE_GOOGLE_CLIENT_ID   Google OAuth client id (installed-app, PKCE)
//   VITE_BILLING_URL        cloud billing-service base (default local dev)
//   VITE_MARKETPLACE_URL    marketplace-api base (C-8 artifact downloads;
//                           default matches marketplace main.rs)

export const authServiceUrl: string =
  (import.meta.env ? (import.meta.env.VITE_AUTH_SERVICE_URL as string | undefined) : undefined) ??
  "https://api.aiconnect.fun";

export const billingServiceUrl: string =
  (import.meta.env ? (import.meta.env.VITE_BILLING_URL as string | undefined) : undefined) ??
  "https://api.aiconnect.fun";

/** Marketplace API base (C-8 artifact downloads). Default = marketplace-api */
export const marketplaceUrl: string =
  (import.meta.env ? (import.meta.env.VITE_MARKETPLACE_URL as string | undefined) : undefined) ??
  "https://api.aiconnect.fun";

// Loopback callback port for the Tauri OAuth bridge (src-tauri/src/lib.rs
// google_login command). Source of truth for the Google flow lives in the
// RUST command (bundled client id + redirect uri) — the frontend never
// duplicates it (B4: single source of truth).

// Remote MCP catalog — metadata only, NEVER the marketplace itself.
// Configurable per environment; NO baked-in production URL beyond the
// default below. Unset → catalog is "not configured" (unavailable) and the
// collection still renders locally-installed connectors.
//
// XCUT-009: the old default (`/artifacts/catalog.json`) 404s — the
// marketplace's `/artifacts/*` route only serves `connectors/`, `skills/`,
// and `catalog/` KEYS (e.g. `/artifacts/catalog/index.json`), never a bare
// `catalog.json`. `/catalog/connectors` is the marketplace's actual
// catalog-index route (apps/marketplace-api/src/lib.rs `router()`), so
// default there. NOTE: that route returns `{id, name, latest_version}` per
// connector, not the fuller `MCPCatalogItem` shape (description, package_url,
// sha256, platforms) this client parses — closing that gap needs either a
// server route that returns the flat shape in one call, or reworking
// fetchCatalogRemote to fan out to `/catalog/connectors/{id}`. Out of scope
// here (see AUTH-004/CONN-007/XCUT-009 fix pass notes).
export const catalogUrl: string =
  (import.meta.env ? (import.meta.env.VITE_MCP_CATALOG_URL as string | undefined) : undefined) ??
  "https://api.aiconnect.fun/catalog/connectors";

// Cache TTL hours (default 12h, within the 6–24h spec range).
export const catalogTtlHours: number = Number(
  import.meta.env ? import.meta.env.VITE_MCP_CATALOG_TTL_HOURS : 12,
) || 12;

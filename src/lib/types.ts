export type ConnStatus = "connected" | "connecting" | "disconnected" | "error";

export interface User {
  email: string;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  period: "month" | "year";
  features: string[];
  highlight?: boolean;
}

export interface Subscription {
  plan: string;
  status: "active" | "expired" | "none" | "unknown";
  renews: string;
  daysRemaining: number | null;
  /** Set when the status CHECK itself failed (network/upstream down), cleared
   *  on success. Distinguishes "you have no subscription" from "we could not
   *  ask" — previously both surfaced identically as status "unknown". */
  error?: string;
}

export interface MCPServer {
  id: string;
  name: string;
  description: string;
  version: string;
  endpoint: string;
  status: ConnStatus;
  enabled: boolean;
  capabilities: string;
  uptime: string;
  lastUsed: string;
  icon: string; // letter glyph
  color: string;
  /** Tunnel exposure (Checkpoint C) */
  exposed?: boolean;
  publicUrl?: string | null;
}

export interface MCPApp {
  id: string;
  name: string;
  description: string;
  category: string;
  status: ConnStatus;
  icon: string;
  color: string;
}

export interface SessionEvent {
  time: string;
  tool: string;
}

export interface Session {
  id: string;
  serverName: string;
  status: ConnStatus;
  toolsAvailable: number;
  duration: string;
  events: SessionEvent[];
  /** F2: backend Session.project_id — display-only; the global ProjectSelector
   *  remains the primary project control. No context contents here. */
  projectId: string | null;
}

export interface Skill {
  id: string;
  name: string;
  file: string;
  updated: string;
  enabled: boolean;
  included: boolean;
  has_content: boolean;
  description: string;
  content: string;
}

export interface FAQItem {
  q: string;
  a: string;
}

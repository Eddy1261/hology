// Store barrel — preserves the historical `../lib/store` import surface so
// pages and main.ts need zero changes. State lives in ./state; each service
// owns its domain mutations.

export { state, toast, isAuthed, PLANS } from "./state.ts";
export { mcp, gateway } from "./mcp.ts";
export { auth } from "./auth.ts";
export { billing } from "./billing.ts";
export { catalog } from "./catalog.ts";
export { projects } from "./projects.ts";
export { context } from "./context.ts";
export { sessions, endSession, toSessionView } from "./sessions.ts";
export { skills } from "./skills.ts";

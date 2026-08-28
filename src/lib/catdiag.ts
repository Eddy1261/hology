// TEMPORARY packaged diagnostic channel (catalog + download): route [catalog]
// / [download] lines to BOTH the console AND a file under the app data dir
// via the `diag` Tauri command, so packaged WebView2 runs are diagnosable
// (release console is hidden).
//
// Log-only — app logic is unchanged. Never logs secrets/JWTs/artifact bytes.

import { invoke } from "@tauri-apps/api/core";
import { inTauriRuntime } from "./tauri-sink.ts";

type Channel = "catalog-diagnostics" | "download-diagnostics" | "connect-diagnostics";

function fmt(parts: unknown[]): string {
  return parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ");
}

async function write(file: Channel, line: string): Promise<void> {
  console.info(line);
  if (inTauriRuntime()) {
    try {
      await invoke("diag", { file, lines: [line] });
    } catch {
      /* file logging best-effort */
    }
  }
}

function errLine(prefix: string, err: unknown): string {
  const name = err instanceof Error ? err.name : typeof err;
  const message = err instanceof Error ? err.message : String(err);
  const stack =
    err instanceof Error && err.stack ? String(err.stack).split("\n").slice(0, 6).join(" | ") : "";
  return `${prefix} err=${name} ${message}${stack ? " stack=" + stack : ""}`;
}

export async function catlog(...parts: unknown[]): Promise<void> {
  await write("catalog-diagnostics", fmt(parts));
}
export async function catlogErr(prefix: string, err: unknown): Promise<void> {
  await write("catalog-diagnostics", errLine(prefix, err));
}
export async function catlogD(...parts: unknown[]): Promise<void> {
  await write("download-diagnostics", fmt(parts));
}
export async function catlogErrD(prefix: string, err: unknown): Promise<void> {
  await write("download-diagnostics", errLine(prefix, err));
}
export async function catlogC(...parts: unknown[]): Promise<void> {
  await write("connect-diagnostics", fmt(parts));
}
export async function catlogErrC(prefix: string, err: unknown): Promise<void> {
  await write("connect-diagnostics", errLine(prefix, err));
}

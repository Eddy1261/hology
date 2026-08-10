export function paymentReturnPath(from: unknown): string {
  if (typeof from !== "string") return "/app";
  return from.startsWith("/app") || from === "/signup" ? from : "/app";
}

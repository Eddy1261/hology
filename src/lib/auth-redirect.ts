// P5/P2-03: auth deep-link preservation — minimal, pure, testable.
//
// When the router guard redirects an unauthenticated user to /login, the
// originally requested protected route is captured here. After a successful
// session restore (or form login) the captured route is consumed so the user
// lands back where they were headed — never silently dumped on /app.

let pendingAuthRoute: string | null = null;

/** Guard hook: remember the protected route the user was denied. */
export function setPendingAuthRoute(fullPath: string | null): void {
  pendingAuthRoute = fullPath;
}

/** Consume (once) the route captured during an auth redirect. */
export function takePendingAuthRoute(): string | null {
  const p = pendingAuthRoute;
  pendingAuthRoute = null;
  return p;
}

/** Resolve where a freshly-authenticated user should land. */
export function postAuthTarget(pending: string | null): string {
  return pending ?? "/app";
}

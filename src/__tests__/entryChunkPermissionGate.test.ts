import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { SRC, chain, eagerGraph } from "./support/eagerGraph";

/**
 * WEB-PERF-062. App.tsx wraps the admin and account routes in ProtectedRoute,
 * so ProtectedRoute is eager, and its static import of usePermission put
 * useSecurityContext and all of lib/security (the role-permission map in
 * types.ts, permissions.ts, ownership.ts, middleware.ts) in the entry chunk
 * for every visitor. No route sets minRole/permission/anyPermissions today.
 * The permission half is now RoutePermissionGate, behind React.lazy.
 *
 * This fails if any of those modules is statically reachable from main.tsx.
 */
const PROTECTED_ROUTE_ONLY = [
  "components/auth/RoutePermissionGate.tsx",
  "hooks/usePermission.ts",
  "hooks/useSecurityContext.ts",
  "lib/security/index.ts",
  "lib/security/types.ts",
  "lib/security/permissions.ts",
  "lib/security/ownership.ts",
  "lib/security/middleware.ts",
];

describe("entry chunk: route permission gate (WEB-PERF-062)", () => {
  const graph = eagerGraph(join(SRC, "main.tsx"));

  it("still reaches ProtectedRoute itself", () => {
    // Negative control: ProtectedRoute is eager by design. If the walker
    // stopped reaching it, the assertions below would pass vacuously.
    expect(graph.has(join(SRC, "components/ProtectedRoute.tsx"))).toBe(true);
    expect(graph.has(join(SRC, "components/auth/RouteGateScreens.tsx"))).toBe(true);
  });

  it("would catch a static import (walker control)", () => {
    // The lazy target really does import the permission stack, so a static
    // import of it from ProtectedRoute would pull lib/security back in.
    const gate = eagerGraph(join(SRC, "components/auth/RoutePermissionGate.tsx"));
    expect(gate.has(join(SRC, "hooks/usePermission.ts"))).toBe(true);
    expect(gate.has(join(SRC, "lib/security/types.ts"))).toBe(true);
  });

  it.each(PROTECTED_ROUTE_ONLY)("does not statically reach %s", (rel) => {
    const file = join(SRC, rel);
    const reached = graph.has(file) ? chain(graph, file) : "";
    expect(reached, "load it behind ProtectedRoute's lazy RoutePermissionGate").toBe("");
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SRC, chain, eagerGraph } from "./support/eagerGraph";

/**
 * WEB-PERF-063. AuthProvider is in the entry chunk, and it used to hold the
 * bodies of login (local throttle, server lockout, MFA gate), signup, both
 * OAuth calls, password reset and change, email change and resend. Anonymous
 * visitors, most of the traffic, run none of them. They are now
 * src/lib/authActions.ts, reached with a dynamic import on first use.
 *
 * This fails if authActions, or signUpResult (only it needs that), becomes
 * statically reachable from main.tsx again.
 */
const AUTH_ACTIONS_ONLY = ["lib/authActions.ts", "lib/signUpResult.ts"];

describe("entry chunk: auth actions (WEB-PERF-063)", () => {
  const graph = eagerGraph(join(SRC, "main.tsx"));

  it("still reaches AuthContext itself", () => {
    // Negative control: AuthProvider is eager by design. If the walker stopped
    // reaching it, the assertions below would pass vacuously.
    expect(graph.has(join(SRC, "contexts/AuthContext.tsx"))).toBe(true);
  });

  it("would catch a static import (walker control)", () => {
    const actions = eagerGraph(join(SRC, "lib/authActions.ts"));
    expect(actions.has(join(SRC, "lib/signUpResult.ts"))).toBe(true);
  });

  it("AuthContext loads authActions with a dynamic import", () => {
    const ctx = readFileSync(join(SRC, "contexts/AuthContext.tsx"), "utf8");
    expect(ctx).toMatch(/await import\("@\/lib\/authActions"\)/);
  });

  it.each(AUTH_ACTIONS_ONLY)("does not statically reach %s", (rel) => {
    const file = join(SRC, rel);
    const reached = graph.has(file) ? chain(graph, file) : "";
    expect(reached, "reach it through AuthContext's withAuthActions dynamic import").toBe("");
  });
});

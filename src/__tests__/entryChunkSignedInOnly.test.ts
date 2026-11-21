import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { SRC, chain, eagerGraph } from "./support/eagerGraph";

/**
 * WEB-PERF-061. Two app-root components did work for a minority
 * and shipped it to everyone: SessionManager called useSessionTimeout (admin
 * idle policy, with use-toast) for every visitor with `enabled` false, and
 * GuestFavoriteMigrator ran a hook that returns at once without a user. Both
 * now gate on useAuthFlags and lazy-load the part that does the work.
 *
 * This fails if any of those modules is statically reachable from main.tsx
 * again, which is what would put them back in the render-blocking chunk.
 */
const SIGNED_IN_ONLY = [
  "components/auth/AdminSessionTimeout.tsx",
  "hooks/useSessionTimeout.ts",
  "hooks/use-toast.ts",
  "components/GuestFavoriteMigrationRunner.tsx",
  "hooks/useGuestFavoriteMigration.ts",
  "lib/guestFavorites.ts",
  "lib/authReturn.ts",
  "lib/favoriteAnalytics.ts",
];

describe("entry chunk: signed-in-only code (WEB-PERF-061)", () => {
  const graph = eagerGraph(join(SRC, "main.tsx"));

  it("still reaches the gates themselves", () => {
    // Negative control: the gates are eager by design, so if the walker
    // stopped reaching them the assertions below would pass vacuously.
    expect(graph.has(join(SRC, "components/auth/SessionManager.tsx"))).toBe(true);
    expect(graph.has(join(SRC, "components/GuestFavoriteMigrator.tsx"))).toBe(true);
  });

  it("would catch a static import (walker control)", () => {
    // The lazy targets exist and do import the hooks, so a static import of a
    // runner from eager code would pull the hook into this graph.
    const runner = eagerGraph(join(SRC, "components/GuestFavoriteMigrationRunner.tsx"));
    expect(runner.has(join(SRC, "hooks/useGuestFavoriteMigration.ts"))).toBe(true);
    const admin = eagerGraph(join(SRC, "components/auth/AdminSessionTimeout.tsx"));
    expect(admin.has(join(SRC, "hooks/useSessionTimeout.ts"))).toBe(true);
  });

  it.each(SIGNED_IN_ONLY)("does not statically reach %s", (rel) => {
    const file = join(SRC, rel);
    const reached = graph.has(file) ? chain(graph, file) : "";
    expect(reached, "load it behind a lazy() boundary gated on useAuthFlags").toBe("");
  });
});

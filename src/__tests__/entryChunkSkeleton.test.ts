import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { SRC, chain, eagerGraph } from "./support/eagerGraph";

/**
 * WEB-PERF-060. ProtectedRoute is eager and imported Spinner from
 * loading-skeleton.tsx, which put the whole skeleton file (5.5 KB raw) in the
 * entry chunk: rollup puts a module that both the entry and lazy chunks use in
 * the entry. Spinner now lives in ui/spinner.tsx. This walks the static import
 * graph from src/main.tsx (lazy `import()` calls are not followed, which is
 * exactly the entry/lazy split) and fails if loading-skeleton.tsx is reachable.
 */
describe("entry chunk (WEB-PERF-060)", () => {
  const graph = eagerGraph(join(SRC, "main.tsx"));
  const skeleton = join(SRC, "components/ui/loading-skeleton.tsx");

  it("walks a real graph", () => {
    // Negative control for the walker: if it stopped resolving imports, the
    // assertion below would pass vacuously. ProtectedRoute and the spinner are
    // both eager today.
    expect(graph.has(join(SRC, "components/ProtectedRoute.tsx"))).toBe(true);
    expect(graph.has(join(SRC, "components/ui/spinner.tsx"))).toBe(true);
  });

  it("does not statically reach loading-skeleton.tsx", () => {
    const reached = graph.has(skeleton) ? chain(graph, skeleton) : "";
    expect(reached, "import Spinner from @/components/ui/spinner in eager code").toBe("");
  });
});

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/**
 * WEB-PERF-060. ProtectedRoute is eager and imported Spinner from
 * loading-skeleton.tsx, which put the whole skeleton file (5.5 KB raw) in the
 * entry chunk: rollup puts a module that both the entry and lazy chunks use in
 * the entry. Spinner now lives in ui/spinner.tsx. This walks the static import
 * graph from src/main.tsx (lazy `import()` calls are not followed, which is
 * exactly the entry/lazy split) and fails if loading-skeleton.tsx is reachable.
 */
const ROOT = resolve(__dirname, "..", "..");
const SRC = join(ROOT, "src");
const EXTS = ["", ".tsx", ".ts", "/index.tsx", "/index.ts"];

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null; // a package; not our concern here
  for (const ext of EXTS) {
    const p = base + ext;
    if (existsSync(p) && /\.(tsx?|ts)$/.test(p)) return p;
  }
  return null;
}

/** Static `import ... from` / `export ... from` / bare `import "x"`; never `import("x")`. */
const STATIC = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^;]*?\s+from\s+)?["']([^"']+)["']/g;

function eagerGraph(entry: string): Map<string, string> {
  const parent = new Map<string, string>([[entry, ""]]);
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift() as string;
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(STATIC)) {
      // `import type` and `export type` are erased; they put nothing in a chunk.
      if (/^\s*(?:import|export)\s+type\s/.test(m[0].replace(/^\n/, ""))) continue;
      const target = resolveImport(file, m[1]);
      if (target && !parent.has(target)) {
        parent.set(target, file);
        queue.push(target);
      }
    }
  }
  return parent;
}

function chain(graph: Map<string, string>, file: string): string {
  const out: string[] = [];
  for (let f = file; f; f = graph.get(f) as string) out.unshift(relative(ROOT, f));
  return out.join(" -> ");
}

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

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/**
 * The static import graph from an entry file: what rollup is forced to put in
 * that entry's chunk, or a chunk it preloads. Lazy `import()` calls are not
 * followed, which is exactly the entry/lazy split. Packages are not followed
 * either; this is about our own modules.
 *
 * Shared by the entry-chunk tests (WEB-PERF-060, WEB-PERF-061).
 */
export const ROOT = resolve(__dirname, "..", "..", "..");
export const SRC = join(ROOT, "src");
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

/** Map of each reachable file to the file that first imported it ("" for the entry). */
export function eagerGraph(entry: string): Map<string, string> {
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

/** "src/main.tsx -> src/App.tsx -> ..." for a reachable file, for a failure message. */
export function chain(graph: Map<string, string>, file: string): string {
  const out: string[] = [];
  for (let f = file; f; f = graph.get(f) as string) out.unshift(relative(ROOT, f));
  return out.join(" -> ");
}

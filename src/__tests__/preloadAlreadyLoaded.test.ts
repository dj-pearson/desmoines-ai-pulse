// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ConfigEnv, Plugin, UserConfig } from "vite";
import type { OutputBundle, OutputChunk } from "rollup";
import viteConfig, {
  dropAlreadyLoadedDeps,
  preloadAlreadyLoaded,
  staticImportClosure,
} from "../../vite.config";

/**
 * WEB-PERF-066. Vite lists, for every dynamic import, the target chunk and its
 * whole static closure, excluding only the importing chunk itself. Anything
 * the importer statically imports is already evaluated before its import()
 * can run, so the entry's 160 preload arrays naming vendor-react,
 * vendor-react-ecosystem and vendor-supabase (which index.html loads first)
 * were bytes on the critical path that preloaded nothing.
 *
 * scripts/check-bundle-budget.mjs checks the built entry for the same thing,
 * which is what catches the plugin-ordering failure this file cannot.
 */

function chunk(fileName: string, imports: string[]): OutputChunk {
  return { type: "chunk", fileName, imports } as unknown as OutputChunk;
}

const BUNDLE: OutputBundle = {
  "assets/index.js": chunk("assets/index.js", ["assets/vendor-react.js", "assets/vendor-supabase.js"]),
  "assets/vendor-react.js": chunk("assets/vendor-react.js", []),
  "assets/vendor-supabase.js": chunk("assets/vendor-supabase.js", ["assets/vendor-react.js"]),
  "assets/Events.js": chunk("assets/Events.js", ["assets/vendor-react.js", "assets/badge.js"]),
  "assets/badge.js": chunk("assets/badge.js", ["assets/vendor-react.js"]),
  "assets/EventMap.js": chunk("assets/EventMap.js", ["assets/badge.js", "assets/leaflet.js"]),
  "assets/leaflet.js": chunk("assets/leaflet.js", []),
};

const importsOf = (f: string) => {
  const c = BUNDLE[f];
  return c && c.type === "chunk" ? c.imports : undefined;
};

/** Runs the plugin's generateBundle the way Rollup would, then returns the resolver. */
function primed(bundle: OutputBundle) {
  const trim = preloadAlreadyLoaded();
  const hook = trim.plugin.generateBundle as { handler: (o: unknown, b: OutputBundle) => void };
  hook.handler({}, bundle);
  return trim.resolveDependencies;
}

describe("staticImportClosure", () => {
  it("walks static imports transitively and includes the start", () => {
    expect([...staticImportClosure(importsOf, "assets/index.js")].sort()).toEqual([
      "assets/index.js",
      "assets/vendor-react.js",
      "assets/vendor-supabase.js",
    ]);
  });

  it("terminates on a cycle", () => {
    const cyclic = (f: string) => (f === "a" ? ["b"] : f === "b" ? ["a"] : []);
    expect([...staticImportClosure(cyclic, "a")].sort()).toEqual(["a", "b"]);
  });
});

describe("dropAlreadyLoadedDeps", () => {
  it("keeps order and removes only loaded files", () => {
    expect(dropAlreadyLoadedDeps(["x", "a", "y", "b"], new Set(["a", "b"]))).toEqual(["x", "y"]);
  });
});

describe("preloadAlreadyLoaded (WEB-PERF-066)", () => {
  it("drops the entry's own static imports from an entry-hosted preload list", () => {
    const resolve = primed(BUNDLE);
    const deps = ["assets/Events.js", "assets/vendor-react.js", "assets/badge.js"];
    expect(resolve("assets/Events.js", deps, { hostId: "assets/index.js", hostType: "js" })).toEqual([
      "assets/Events.js",
      "assets/badge.js",
    ]);
  });

  it("drops what a lazy host already loaded, and keeps what it does not have", () => {
    const resolve = primed(BUNDLE);
    const deps = ["assets/EventMap.js", "assets/badge.js", "assets/vendor-react.js", "assets/leaflet.js"];
    expect(resolve("assets/EventMap.js", deps, { hostId: "assets/Events.js", hostType: "js" })).toEqual([
      "assets/EventMap.js",
      "assets/leaflet.js",
    ]);
  });

  it("leaves HTML preloads and unknown hosts alone", () => {
    const resolve = primed(BUNDLE);
    const deps = ["assets/vendor-react.js", "assets/vendor-supabase.js"];
    expect(resolve("assets/index.js", deps, { hostId: "index.html", hostType: "html" })).toEqual(deps);
    expect(resolve("assets/x.js", deps, { hostId: "assets/missing.js", hostType: "js" })).toEqual(deps);
  });

  it("is a no-op, not a broken preload, before the bundle is captured", () => {
    const deps = ["assets/Events.js", "assets/vendor-react.js"];
    expect(
      preloadAlreadyLoaded().resolveDependencies("assets/Events.js", deps, {
        hostId: "assets/index.js",
        hostType: "js",
      })
    ).toEqual(deps);
  });

  it("is wired into the production config, with the capture ordered before Vite's", () => {
    const resolved = (
      typeof viteConfig === "function"
        ? (viteConfig as (env: ConfigEnv) => UserConfig)({ command: "build", mode: "production" })
        : viteConfig
    ) as UserConfig;
    const modulePreload = resolved.build?.modulePreload;
    expect(typeof modulePreload === "object" && typeof modulePreload.resolveDependencies).toBe("function");
    const plugin = (resolved.plugins ?? [])
      .flat()
      .find((p): p is Plugin => !!p && typeof p === "object" && "name" in p && p.name === "preload-already-loaded");
    expect(plugin).toBeDefined();
    expect((plugin?.generateBundle as { order?: string } | undefined)?.order).toBe("pre");
  });
});

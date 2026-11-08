// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ConfigEnv, UserConfig } from "vite";
import type { OutputBundle, OutputChunk } from "rollup";
import viteConfig, {
  CRITICAL_PATH_CHUNKS,
  HEAVY_PRELOAD_BYTES,
  findHeavyPreloads,
} from "../../vite.config";

/**
 * WEB-PERF-068. remove-lazy-preloads warns when index.html preloads a chunk
 * over HEAVY_PRELOAD_BYTES. vendor-supabase (~216 KB raw) is preloaded on
 * purpose, so the warning fired on every good build. These tests hold both
 * halves: the critical-path vendors are quiet, and anything else that heavy
 * on the preload list is still reported.
 */

function chunk(fileName: string, name: string, bytes: number): OutputChunk {
  return { type: "chunk", fileName, name, code: "x".repeat(bytes) } as unknown as OutputChunk;
}

const HEAVY = HEAVY_PRELOAD_BYTES + 1;

const BUNDLE: OutputBundle = {
  "assets/vendor-supabase-AAA.js": chunk("assets/vendor-supabase-AAA.js", "vendor-supabase", 221_000),
  "assets/vendor-react-BBB.js": chunk("assets/vendor-react-BBB.js", "vendor-react", HEAVY),
  "assets/vendor-react-ecosystem-CCC.js": chunk("assets/vendor-react-ecosystem-CCC.js", "vendor-react-ecosystem", 60_000),
  "assets/HeroCityLite-DDD.js": chunk("assets/HeroCityLite-DDD.js", "HeroCityLite", 800_000),
  "assets/vendor-react-three-EEE.js": chunk("assets/vendor-react-three-EEE.js", "vendor-react-three", HEAVY),
  "assets/small-FFF.js": chunk("assets/small-FFF.js", "small", 4_000),
};

const link = (file: string) => `<link rel="modulepreload" crossorigin href="/assets/${file}">\n`;

const NORMAL_HTML =
  link("vendor-react-BBB.js") + link("vendor-react-ecosystem-CCC.js") + link("vendor-supabase-AAA.js") + link("small-FFF.js");

describe("findHeavyPreloads (WEB-PERF-068)", () => {
  it("reports nothing for a normal build's preload list", () => {
    expect(findHeavyPreloads(NORMAL_HTML, BUNDLE)).toEqual([]);
  });

  it("still reports a heavy non-critical chunk preloaded from the HTML", () => {
    const found = findHeavyPreloads(NORMAL_HTML + link("HeroCityLite-DDD.js"), BUNDLE);
    expect(found).toEqual([{ fileName: "HeroCityLite-DDD.js", bytes: 800_000 }]);
  });

  it("exempts by chunk name, not filename prefix", () => {
    // "vendor-react-three" starts with "vendor-react" but is not a critical
    // vendor; a prefix match would hide it.
    expect(findHeavyPreloads(link("vendor-react-three-EEE.js"), BUNDLE).map((f) => f.fileName)).toEqual([
      "vendor-react-three-EEE.js",
    ]);
  });

  it("reports vendor-supabase when it is not exempt (negative control)", () => {
    // Proves the normal-build case is quiet because of the exemption, not
    // because the regex missed the link or the size was misread.
    const found = findHeavyPreloads(NORMAL_HTML, BUNDLE, HEAVY_PRELOAD_BYTES, []);
    expect(found.map((f) => f.fileName).sort()).toEqual(["vendor-react-BBB.js", "vendor-supabase-AAA.js"]);
  });
});

describe("CRITICAL_PATH_CHUNKS matches manualChunks", () => {
  it("names exactly the chunks manualChunks forces", () => {
    const resolved =
      typeof viteConfig === "function"
        ? (viteConfig as (env: ConfigEnv) => UserConfig)({ command: "build", mode: "production" })
        : viteConfig;
    const output = (resolved as UserConfig).build?.rollupOptions?.output;
    const fn = (Array.isArray(output) ? output[0]?.manualChunks : output?.manualChunks) as unknown as (
      id: string
    ) => string | undefined;
    const ids = [
      "react/index.js",
      "react-dom/client.js",
      "scheduler/index.js",
      "react-router/dist/index.js",
      "@tanstack/react-query/build/modern/index.js",
      "@supabase/supabase-js/dist/index.mjs",
      "date-fns/format.mjs",
      "three/build/three.module.js",
    ].map((p) => `/repo/node_modules/${p}`);
    const forced = new Set(ids.map((id) => fn(id)).filter((n): n is string => Boolean(n)));
    expect([...forced].sort()).toEqual([...CRITICAL_PATH_CHUNKS].sort());
  });
});

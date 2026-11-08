// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ConfigEnv, UserConfig } from "vite";
import viteConfig from "../../vite.config";

/**
 * WEB-PERF-064. A manual chunk is all-or-nothing: the moment any route needs
 * one module from it, that route downloads every module in it. That is only a
 * fair trade for libraries every page already loads before it can render
 * (React, the router and query client, Supabase) and for one deliberately
 * isolated editor bundle. Everything else should travel with the chunk that
 * imports it.
 *
 * Three libraries were forced together and each cost every route: Radix
 * (vendor-ui), three.js/recharts/d3, and last date-fns (vendor-dates, fetched
 * by 114 of 159 lazy imports and skewing Rollup's grouping of app modules).
 * vite.config.ts records the measurements. This asserts the rule against the
 * real manualChunks function, so re-adding a forced chunk for any of them
 * fails here rather than in a bundle diff nobody runs.
 */

type ManualChunks = (id: string) => string | undefined;

function manualChunks(): ManualChunks {
  const resolved =
    typeof viteConfig === "function"
      ? (viteConfig as (env: ConfigEnv) => UserConfig)({ command: "build", mode: "production" })
      : viteConfig;
  const output = (resolved as UserConfig).build?.rollupOptions?.output;
  const fn = Array.isArray(output) ? output[0]?.manualChunks : output?.manualChunks;
  if (typeof fn !== "function") throw new Error("manualChunks is not a function in vite.config.ts");
  return (id) => (fn as unknown as ManualChunks)(id) ?? undefined;
}

const nm = (path: string) => `/repo/node_modules/${path}`;

describe("manualChunks (WEB-PERF-064)", () => {
  const chunkFor = manualChunks();

  it("still forces the critical-path vendors", () => {
    // Positive control: if the lookup above broke and returned undefined for
    // everything, the assertions below would pass vacuously.
    expect(chunkFor(nm("react/index.js"))).toBe("vendor-react");
    expect(chunkFor(nm("react-router/dist/index.js"))).toBe("vendor-react-ecosystem");
    expect(chunkFor(nm("@supabase/supabase-js/dist/index.mjs"))).toBe("vendor-supabase");
  });

  it.each([
    ["date-fns", nm("date-fns/format.mjs")],
    ["date-fns locale", nm("date-fns/locale/en-US.mjs")],
    ["date-fns-tz", nm("date-fns-tz/dist/esm/formatInTimeZone/index.js")],
    ["radix", nm("@radix-ui/react-dialog/dist/index.mjs")],
    ["three", nm("three/build/three.module.js")],
    ["recharts", nm("recharts/es6/index.js")],
    ["lucide", nm("lucide-react/dist/esm/icons/map.js")],
  ])("leaves %s to Rollup", (_name, id) => {
    expect(chunkFor(id)).toBeUndefined();
  });
});

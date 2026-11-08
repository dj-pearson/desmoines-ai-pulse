import { defineConfig, loadEnv, Plugin } from "vite";
import type { OutputBundle } from "rollup";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "node:fs";
import { componentTagger } from "lovable-tagger";
import { visualizer } from "rollup-plugin-visualizer";

/**
 * Fail the build with a usable message when index.html's %VAR% placeholders
 * have nothing to interpolate (WEB-CI-022).
 *
 * index.html contains `<link rel="preconnect" href="%VITE_SUPABASE_URL%">`.
 * Vite substitutes %VAR% placeholders from env; with the var unset the literal
 * survives into the HTML, vite's own build-html plugin calls decodeURI() on the
 * attribute, and "%VI" is an invalid percent-escape — so the build dies with:
 *
 *     [vite:build-html] URI malformed
 *
 * and a stack inside a vite chunk. Nothing in that output mentions an
 * environment variable, so the natural first guesses are a corrupt dependency
 * tree or a Node version mismatch. CI and Cloudflare Pages inject the vars, so
 * this only ever bites a fresh clone or automation without the full env —
 * exactly the people least equipped to recognise it.
 *
 * Checked against index.html rather than a hardcoded list so a new placeholder
 * is covered automatically.
 */
function assertHtmlEnvPlaceholders(loadedEnv: Record<string, string>): Plugin {
  return {
    name: "assert-html-env-placeholders",
    enforce: "pre",
    // buildStart, NOT transformIndexHtml: vite:build-html parses index.html
    // (and throws on the bad escape) before the pre-transform pipeline runs, so
    // a transformIndexHtml hook here never got the chance to fire. Reading the
    // file directly at buildStart is guaranteed to run first.
    buildStart() {
      const htmlPath = path.resolve(__dirname, "index.html");
      if (!fs.existsSync(htmlPath)) return;
      const html = fs.readFileSync(htmlPath, "utf8");

      const placeholders = [...html.matchAll(/%([A-Z][A-Z0-9_]*)%/g)]
        .map((m) => m[1])
        // Vite's own build-time token, replaced by injectBuildTimestamp below.
        .filter((name) => name !== "BUILD_TIMESTAMP");

      const missing = [...new Set(placeholders)].filter(
        (name) => !process.env[name] && !loadedEnv[name],
      );

      if (missing.length > 0) {
        this.error(
          `\n\nMissing required environment variable(s): ${missing.join(", ")}\n\n` +
            `index.html interpolates them as %VAR% placeholders. Without a value the\n` +
            `literal "%${missing[0]}%" reaches vite's HTML parser, which calls decodeURI()\n` +
            `on it and fails with the unhelpful "[vite:build-html] URI malformed".\n\n` +
            `Set them in .env (see .env.example) or export them before building.\n`,
        );
      }
    },
  };
}

// Custom plugin to inject build timestamp for cache busting
function injectBuildTimestamp(): Plugin {
  return {
    name: "inject-build-timestamp",
    transformIndexHtml(html) {
      return html.replace("__BUILD_TIMESTAMP__", new Date().toISOString());
    },
  };
}

/**
 * The manual chunks every page loads before it can render (React, the router
 * and query client, Supabase). manualChunks below returns exactly these names,
 * and src/__tests__/manualChunks.test.ts pins that the two agree.
 */
export const CRITICAL_PATH_CHUNKS: readonly string[] = [
  "vendor-react",
  "vendor-react-ecosystem",
  "vendor-supabase",
];

export const HEAVY_PRELOAD_BYTES = 150 * 1024;

/**
 * Chunks over the threshold that an HTML page preloads (WEB-PERF-068).
 *
 * vendor-supabase is ~216 KB raw and is preloaded from index.html on purpose,
 * so without the exemption this reported it on every good build and the one
 * warning meant to catch a lazy chunk on first paint read as noise. The
 * critical-path vendors are not unbudgeted: check-bundle-budget totals every
 * JS file index.html references and fails when that grows. Matched on the
 * chunk's name (the manual-chunk name), not a filename prefix, so
 * "vendor-react" cannot also exempt a future "vendor-react-whatever".
 */
export function findHeavyPreloads(
  html: string,
  bundle: OutputBundle,
  thresholdBytes: number = HEAVY_PRELOAD_BYTES,
  exempt: readonly string[] = CRITICAL_PATH_CHUNKS
): { fileName: string; bytes: number }[] {
  const out: { fileName: string; bytes: number }[] = [];
  for (const m of html.matchAll(/<link rel="modulepreload"[^>]*href="\/(assets\/[^"]+)"/g)) {
    const chunk = bundle[m[1]];
    if (!chunk || chunk.type !== "chunk" || exempt.includes(chunk.name)) continue;
    const bytes = Buffer.byteLength(chunk.code);
    if (bytes > thresholdBytes) out.push({ fileName: m[1].slice("assets/".length), bytes });
  }
  return out;
}

// Custom plugin to remove heavy lazy-loaded chunks from preload list
function removeLazyPreloads(): Plugin {
  return {
    name: "remove-lazy-preloads",
    enforce: "post",
    /**
     * MUST run in generateBundle, NOT transformIndexHtml.
     *
     * Vite injects <link rel="modulepreload"> during the build-html plugin's
     * generateBundle, which is AFTER every transformIndexHtml hook has run —
     * including hooks declared with order:"post". So the previous
     * transformIndexHtml implementation was rewriting HTML that did not yet
     * contain a single preload link, and silently did nothing for the life of
     * the file. The regexes were never the problem; they match the emitted
     * markup exactly (verified). Every production build shipped ~440KB gzipped
     * of 3D engine, rich-text editor, Recharts and D3 preloads on first paint.
     *
     * Editing the emitted asset here is the only stage where those links exist.
     *
     * WEB-PERF-042: stripping the HINT was only half of it. A forced manual
     * chunk is also a hard dependency edge, so Rollup emitted a bare
     * `import "./vendor-three.js"` into every route chunk and the browser
     * fetched it anyway - preload link or not. vendor-three, vendor-recharts
     * and vendor-d3 are no longer forced (see manualChunks below), so those
     * three patterns are now dead. They stay listed because a future manual
     * chunk under any of those names would need the same treatment, and
     * because the stripped === 0 warning below only means something if the
     * remaining patterns - vendor-maps, vendor-editor, HeroCityLite - still
     * match. HeroCityLite is the important one now: Three.js travels with it,
     * so that chunk is ~800 KB and must never be preloaded.
     */
    generateBundle(_options, bundle) {
      const PATTERNS = [
        /<link rel="modulepreload"[^>]*vendor-maps[^>]*>\s*/g,
        /<link rel="modulepreload"[^>]*vendor-three[^>]*>\s*/g,
        /<link rel="modulepreload"[^>]*vendor-editor[^>]*>\s*/g,
        /<link rel="modulepreload"[^>]*vendor-recharts[^>]*>\s*/g,
        /<link rel="modulepreload"[^>]*vendor-d3[^>]*>\s*/g,
        /<link rel="modulepreload"[^>]*HeroCityLite[^>]*>\s*/g,
        /<link rel="modulepreload"[^>]*HeroCity[^>]*>\s*/g,
      ];

      let stripped = 0;
      for (const asset of Object.values(bundle)) {
        if (asset.type !== "asset" || !asset.fileName.endsWith(".html")) continue;
        let html = String(asset.source);
        for (const re of PATTERNS) {
          html = html.replace(re, () => {
            stripped++;
            return "";
          });
        }
        asset.source = html;
      }

      // Loud on regression. This used to warn when it stripped NOTHING, which
      // was a proxy for "the chunk names changed". Since WEB-PERF-042 removed
      // the forced vendor-three / vendor-recharts / vendor-d3 chunks there is
      // usually nothing left to strip, so that condition now fires on success -
      // a warning on every good build, which is how people learn to ignore
      // warnings. It asserts the actual budget instead: nothing heavy may be
      // preloaded from the entry HTML, whatever it happens to be called,
      // except the critical-path vendors (WEB-PERF-068, see findHeavyPreloads).
      for (const asset of Object.values(bundle)) {
        if (asset.type !== "asset" || !asset.fileName.endsWith(".html")) continue;
        for (const { fileName, bytes } of findHeavyPreloads(String(asset.source), bundle)) {
          this.warn(
            `remove-lazy-preloads: ${fileName} is ${(bytes / 1024).toFixed(0)} KB ` +
              `and is preloaded from ${asset.fileName}. That is first-paint ` +
              `weight - add a pattern above or stop forcing it into a chunk.`
          );
        }
      }
      void stripped;
    },
  };
}

/**
 * Drop preload deps the importing chunk has already loaded (WEB-PERF-066).
 *
 * For every dynamic import Vite lists the target chunk plus its whole static
 * import closure, and only excludes the importing chunk itself. Everything the
 * importer statically imports is already evaluated by the time its code can
 * reach the import() call, so naming it again preloads nothing; it is bytes
 * in the importer. In the entry that meant vendor-react, vendor-react-ecosystem
 * and vendor-supabase in almost every one of its 160 __vite__mapDeps arrays,
 * though index.html loads all three before the entry runs. Lazy chunks that
 * import further lazy chunks carry the same repeats for their own imports.
 *
 * Only deps in the HOST's static closure go. Trimming deps that the target
 * would discover itself (for example keeping only direct deps) is a different
 * trade: it turns one parallel preload batch into a waterfall per level.
 */
export function staticImportClosure(
  importsOf: (fileName: string) => readonly string[] | undefined,
  start: string
): Set<string> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const file = stack.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    stack.push(...(importsOf(file) ?? []));
  }
  return seen;
}

export function dropAlreadyLoadedDeps(
  deps: readonly string[],
  loaded: ReadonlySet<string>
): string[] {
  return deps.filter((dep) => !loaded.has(dep));
}

/**
 * resolveDependencies is called from inside vite:build-import-analysis's
 * generateBundle with only (url, deps, { hostId }), not the chunk graph, so a
 * plugin captures the bundle first. order "pre" puts its generateBundle ahead
 * of Vite's. If that ever stops holding, resolveDependencies returns deps
 * unchanged (a no-op, never a broken preload), and check-bundle-budget's
 * "already loaded" assertion fails the build check.
 */
export function preloadAlreadyLoaded(): {
  plugin: Plugin;
  resolveDependencies: (
    url: string,
    deps: string[],
    context: { hostId: string; hostType: "html" | "js" }
  ) => string[];
} {
  let bundle: OutputBundle | undefined;
  const closures = new Map<string, Set<string>>();
  const importsOf = (fileName: string) => {
    const out = bundle?.[fileName];
    return out && out.type === "chunk" ? out.imports : undefined;
  };
  return {
    plugin: {
      name: "preload-already-loaded",
      apply: "build",
      generateBundle: {
        order: "pre",
        handler(_options, outputBundle) {
          bundle = outputBundle;
          closures.clear();
        },
      },
    },
    resolveDependencies(_url, deps, { hostId, hostType }) {
      if (!bundle || hostType !== "js" || !importsOf(hostId)) return deps;
      let loaded = closures.get(hostId);
      if (!loaded) {
        loaded = staticImportClosure(importsOf, hostId);
        closures.set(hostId, loaded);
      }
      return dropAlreadyLoadedDeps(deps, loaded);
    },
  };
}

// https://vitejs.dev/config/
// Force rebuild: 2025-01-18
export default defineConfig(({ command, mode }) => {
  // Vite only exposes .env values on `import.meta.env` inside app code, so the
  // config has to load them itself to validate index.html placeholders.
  const loadedEnv = loadEnv(mode, process.cwd(), "");
  const preloadTrim = preloadAlreadyLoaded();
  return {
  base: "/",
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    assertHtmlEnvPlaceholders(loadedEnv), // Fail clearly on missing %VAR% (WEB-CI-022)
    injectBuildTimestamp(), // Add timestamp to prevent HTML caching
    removeLazyPreloads(), // Remove vendor-maps/vendor-three from preload list
    preloadTrim.plugin, // Captures the bundle for modulePreload below (WEB-PERF-066)
    react({
      babel: {
        plugins: [
          [
            "babel-plugin-react-remove-properties",
            { properties: ["data-testid"] },
          ],
        ],
      },
    }),
    command === "serve" && componentTagger(),
    // Bundle analyzer - run with ANALYZE=true npm run build.
    //
    // `open` is opt-out rather than hardcoded true: an analyzer that always
    // launches a browser cannot be run from CI, from a container, or by an
    // agent, which means the measurement behind WEB-PERF-020's budget was only
    // ever available to someone sitting at the machine. ANALYZE_OPEN=false
    // keeps the report and skips the browser.
    process.env.ANALYZE === "true" &&
      visualizer({
        open: process.env.ANALYZE_OPEN !== "false",
        filename: "dist/stats.html",
        gzipSize: true,
        brotliSize: true,
      }),
    // Machine-readable twin of the same report. The HTML is for reading; this
    // is what lets a script answer "what is actually in the entry chunk"
    // without a human scrubbing a treemap.
    process.env.ANALYZE === "true" &&
      visualizer({
        open: false,
        filename: "dist/stats.json",
        template: "raw-data",
        gzipSize: true,
        brotliSize: true,
      }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Generate hidden sourcemaps for production debugging
    // Upload to error tracking service but don't deploy publicly
    sourcemap: mode === "production" ? "hidden" : true,
    outDir: "dist",
    assetsDir: "assets",
    cssCodeSplit: true,
    minify: "esbuild", // Use esbuild - faster and more reliable than terser
    target: "es2020",
    // WEB-PERF-066: drop preload deps the importing chunk already loaded.
    modulePreload: { resolveDependencies: preloadTrim.resolveDependencies },
    // No esbuild options here: `build.esbuild` isn't a Vite option, so the
    // drop list that sat here was ignored and every console.* shipped. It
    // lives at the top level now (see `esbuild` below this block).
    rollupOptions: {
      output: {
        // Improved code splitting - group related modules to reduce chunk count
        // and improve caching while avoiding circular dependencies
        manualChunks: (id) => {
          // React core - MUST be first, highest priority.
          // This ensures React is always available before any other code.
          //
          // Matched on "node_modules/<pkg>/", not a bare includes("/react/"): that
          // substring also matches @tiptap/react, @sentry/react, @use-gesture/react
          // and @floating-ui/react-dom, so those packages and the modules they drag
          // in landed in vendor-react. vendor-react then imported vendor-ui,
          // vendor-three and vendor-recharts - circular chunks, which the browser
          // resolves by evaluating vendor-ui before React's exports are assigned:
          // "Cannot read properties of undefined (reading 'forwardRef')", and a
          // site stuck on the loading spinner.
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/")
          ) {
            return "vendor-react";
          }

          // React ecosystem - depends on vendor-react
          if (
            id.includes("react-router") ||
            id.includes("@tanstack/react-query")
          ) {
            return "vendor-react-ecosystem";
          }

          // Supabase - auth and database
          if (id.includes("@supabase/")) {
            return "vendor-supabase";
          }

          // Radix primitives are deliberately NOT forced into one chunk.
          //
          // They used to be: `if (id.includes("@radix-ui/")) return "vendor-ui"`.
          // One manual chunk is all-or-nothing - the moment ANY primitive is
          // reachable from the entry, every other primitive in the app ships with
          // it. Measured: entry + vendor-ui was 189.6 + 55.1 = 244.7 KB gz; letting
          // Rollup place each primitive with its importer gives an entry of 152.4
          // KB and no vendor-ui at all, because the primitives only a lazy page
          // needs now travel with that page. Critical path 308.8 -> 282.3 KB.
          //
          // The cost is chunk count, 120 -> 147. That is a fair trade over HTTP/2,
          // and the prerenderer already strips runtime-injected modulepreloads so
          // the extra chunks do not become eager first-paint downloads.
          //
          // The risk this could have reintroduced is the circular-chunk crash
          // described above - a chunk evaluating before React assigns its exports,
          // giving "Cannot read properties of undefined (reading 'forwardRef')" and
          // a site stuck on the spinner. Checked rather than assumed: the smoke
          // suite mounts every public route in App.tsx and is 80 passed.

          // Three.js, recharts and d3 are deliberately NOT forced into chunks,
          // for the same all-or-nothing reason spelled out for Radix above.
          //
          // vendor-three carried the comment "separate chunk so it's only loaded
          // when HeroCityLite renders". MEASURED: the opposite happened. A forced
          // chunk becomes a hard dependency edge, so Rollup emitted a bare
          // `import "./vendor-three.js"` into EVERY route chunk - the browser had
          // to fetch and evaluate it before running the page module. Three.js
          // shipped on every route, including /acceptable-use-policy, a page of
          // prose whose own code is 2.7 KB gz. Same for vendor-recharts and
          // vendor-d3, which are only reached by lazy admin analytics.
          //
          // Per-route JS beyond the entry chunks, gzipped, before -> after:
          //   /acceptable-use-policy  323.8 -> 3.1
          //   / (home)                287.5 -> 77.2
          //   /events                 472.4 -> 268.8
          //   /restaurants            449.5 -> 246.0
          //   /restaurants/:id        454.9 -> 251.2
          //   /playgrounds            396.3 -> 192.8
          // The entry itself is unchanged at ~185 KB gz. Three.js now travels
          // with HeroCityLite's own dynamic chunk, which is what the original
          // comment wanted; recharts and d3 travel with the admin pages.
          //
          // Removing a manual chunk cannot reintroduce the circular-chunk crash
          // described above - that failure comes from forcing modules together,
          // not from letting Rollup place them.

          // Maps - Leaflet (DO NOT BUNDLE - causes preload issues)
          // By returning undefined, we let each lazy-loaded map component
          // have its own chunk, preventing premature loading
          if (id.includes("leaflet") || id.includes("react-leaflet")) {
            // Don't bundle - let dynamic imports create separate chunks
            return undefined;
          }

          // Charts: see the note above. The comment here used to say "Don't
          // bundle together to avoid circular deps / Let Vite handle them
          // naturally" while the code immediately below it did the opposite.
          // Now the code matches the comment.

          // Forms and validation - DO NOT manually chunk these
          // react-hook-form, zod, and @hookform/resolvers have circular dependency
          // issues when bundled together, causing TDZ (Temporal Dead Zone) errors
          // at runtime ("Cannot access 'X' before initialization").
          // Let Vite handle them automatically via its own code-splitting.

          // No vendor-editor chunk (WEB-PERF-067). Tiptap and prosemirror were
          // forced together "to isolate the editor", and the only thing that
          // imports them, cms/RichTextEditor.tsx, is already lazy, so the chunk
          // isolated nothing. What it did instead: Rollup moves an unassigned
          // dependency of a forced chunk's modules INTO that chunk, and
          // fast-equals is a dependency of both @tiptap/react and recharts
          // (via react-smooth). So every recharts page - AdminAgents,
          // AdminAnalyticsPage, AdminRefunds, CampaignAnalytics - imported the
          // whole editor (~122 KB gz) for one 1 KB equality helper. The
          // includes("tiptap") test also caught src/components/cms/
          // tiptap-styles.css, which put AdminArticleEditor's own stylesheet
          // in the chunk and dragged it there too.
          // Measured with scripts/measure-route-preload.mjs, gz summed over
          // the 137 lazy imports in App.tsx: unused passengers 614.8 -> 0,
          // routes 9,743 -> 9,121, critical path unchanged at 176.0. Only
          // those five routes moved, each 123-125 KB lighter:
          //     AdminArticleEditor 230.6 -> 105.3   AdminAnalytics 392.6 -> 269.2
          //     AdminAgents 309.2 -> 185.9   AdminRefunds 291.9 -> 168.6
          //     CampaignAnalytics 288.7 -> 165.4
          // Tiptap now travels with RichTextEditor's own lazy chunk.
          // Pinned by src/__tests__/manualChunks.test.ts.

          // No date-fns chunk (WEB-PERF-064). `if (id.includes("date-fns"))
          // return "vendor-dates"` was the last library forced together that is
          // not on every page's critical path, and it failed the same way the
          // Radix and three.js chunks above did: 36 KB minified / 10.3 KB gz of
          // date-fns and date-fns-tz, every function any page uses, fetched by
          // 114 of the 159 lazy imports. Worse than its own size, the forced
          // chunk skewed how Rollup grouped and merged the app's shared modules,
          // so routes that format no date at all still preloaded
          // eventsHubQuery, restaurantHours, tonightPairings and useCampaigns.
          //
          // Per-route JS beyond the critical path, gzipped, summed over every
          // lazy route in App.tsx, one build each way:
          //     all 131 routes      11,779 -> 10,840 KB  (-938; 78 better, 36 worse)
          //     the 89 public ones   6,033 ->  5,727 KB  (-306)
          //     /pricing 73.3 -> 52.4   /contact 90.2 -> 66.7   /auth 106.5 -> 83.0
          //     /articles 107.4 -> 96.8   /restaurants/:id 160.9 -> 155.8
          //     /events/:id 174.8 -> 170.4   / 78.8 -> 77.9
          // The worse 36 are 0.5-5.5 KB each (/hotels 102.8 -> 108.3 is the
          // largest): Rollup's experimentalMinChunkSize merge, below, now folds
          // a different set of small shared modules into chunks those routes
          // import. That over-fetch exists either way; this change moves less of
          // it onto fewer routes (WEB-PERF-065 then turned the merge off).
          // Critical path unchanged (174.9 -> 175.0 KB).
          // Pinned by src/__tests__/manualChunks.test.ts.

          // No lucide-react chunk. Forcing every icon into one vendor-icons
          // chunk put icons only /admin uses on the critical path of every
          // page; left alone, each icon ships with the chunk that imports it.

          // DON'T create vendor-misc - let Vite handle remaining node_modules automatically
          // This prevents bundling issues with lazy-loaded libraries

          // Don't bundle anything else - let Vite's automatic code splitting handle it
          return undefined;
        },
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        // No chunk merging (WEB-PERF-065). 1 is Rollup's default: it folds
        // away only chunks with no code at all. Any larger value merges small
        // chunks into a chunk their importers share, and every route that
        // imports the merged chunk then downloads all of it - modules it never
        // reaches included. With 1000 here, /hotels fetched eventsHubQuery,
        // useEventLanding and useProximitySearch; /trip-planner carried 28.8 KB
        // gz it never ran.
        //
        // History, so nobody re-tunes this blind. 20000 put every small lazy
        // module in the ENTRY (AdminGscCallback, useMFA, useCampaigns... on
        // every first paint). 1000 got the critical path from 227.5 to 219.3 KB
        // and was the right call against 20000. Measured against no merging,
        // with `node scripts/measure-route-preload.mjs --min-chunk N`, which
        // reads Rollup's module graph so it can tell needed bytes from
        // passengers (gz, sums over the 137 lazy imports in App.tsx):
        //     N       routes sum   of which unused   files   critical path
        //     2000    12,325       3,405             6,232   175.8
        //     1000    10,853       1,892             6,480   174.9  (was here)
        //      500    10,367       1,362             6,600   175.4
        //        1     9,734         615             6,921   176.0  (here now)
        // At 1, 131 routes get lighter and none heavier by more than 0.2 KB:
        //     /restaurants 173.7 -> 152.0   /events 220.3 -> 204.0
        //     /events/:id 168.0 -> 154.6    /restaurants/:id 152.2 -> 139.1
        //     /trip-planner 157.7 -> 131.3  / 76.2 -> 70.5   /hotels 105.9 -> 87.7
        // The 615 left was the forced vendor-editor chunk on admin pages, not
        // merging; WEB-PERF-067 removed it and the unused column is now 0. The cost is 441 more files summed over routes (/ 47 -> 62,
        // /events 130 -> 150), fetched in parallel as one modulepreload batch
        // over HTTP/2, and +1.1 KB on the critical path: the entry's
        // __vite__mapDeps arrays name 79 more chunk files (WEB-PERF-066).
        // scripts/prerender.mjs strips the runtime preload links, so the
        // prerendered HTML does not grow.
        // Pinned by src/__tests__/manualChunks.test.ts.
        experimentalMinChunkSize: 1,
      },
    },
    chunkSizeWarningLimit: 500, // Stricter limit due to better splitting
    // Improve build performance
    reportCompressedSize: false,
  },
  // Optimize dependencies
  // Top level, where Vite reads it: esbuild transforms every module during
  // `vite build`, and `drop` removes console.* and debugger from app code.
  // scripts/check-dist-console.mjs checks the result in dist/assets.
  esbuild: mode === "production" ? { drop: ["console", "debugger"] } : undefined,
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react-router-dom",
      "@tanstack/react-query",
      "@supabase/supabase-js",
      "lucide-react", // Pre-bundle icons for faster dev
    ],
    exclude: [
      "react-leaflet", // Exclude to prevent pre-bundling issues AND loading order problems
      "leaflet", // Exclude to load with maps chunk
      "recharts", // Exclude due to circular dependency issues
      "d3-scale", // Exclude d3 modules to prevent TDZ errors
      "d3-array",
      "d3-shape",
      "d3-interpolate",
    ],
    // Force React to be bundled first
    force: true,
  },
};
});

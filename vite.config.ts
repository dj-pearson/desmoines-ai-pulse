import { defineConfig, loadEnv, Plugin } from "vite";
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

      // Loud on regression: if the chunk names change, this silently stops
      // working again, which is exactly how it went unnoticed before.
      if (stripped === 0) {
        this.warn(
          "remove-lazy-preloads stripped 0 preload links — chunk names may have changed; the critical-path budget is unguarded"
        );
      }
    },
  };
}

// https://vitejs.dev/config/
// Force rebuild: 2025-01-18
export default defineConfig(({ command, mode }) => {
  // Vite only exposes .env values on `import.meta.env` inside app code, so the
  // config has to load them itself to validate index.html placeholders.
  const loadedEnv = loadEnv(mode, process.cwd(), "");
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
    // Drop console.* and debugger statements in production
    ...(mode === "production" && {
      esbuild: {
        drop: ["console", "debugger"],
      },
    }),
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

          // Three.js + React Three Fiber - separate chunk so it's only loaded
          // when HeroCityLite renders (lazy-loaded, deferred via requestIdleCallback).
          // Without this, Three.js gets bundled into the HeroCityLite page chunk
          // which Vite may decide to preload.
          if (
            id.includes("/three/") ||
            id.includes("@react-three/") ||
            id.includes("react-three") ||
            id.includes("react-reconciler")
          ) {
            return "vendor-three";
          }

          // Maps - Leaflet (DO NOT BUNDLE - causes preload issues)
          // By returning undefined, we let each lazy-loaded map component
          // have its own chunk, preventing premature loading
          if (id.includes("leaflet") || id.includes("react-leaflet")) {
            // Don't bundle - let dynamic imports create separate chunks
            return undefined;
          }

          // Charts - Don't bundle together to avoid circular deps
          // Let Vite handle them naturally
          if (id.includes("recharts") && !id.includes("d3")) {
            return "vendor-recharts";
          }

          // D3 utilities - separate from recharts
          if (id.includes("d3-")) {
            return "vendor-d3";
          }

          // Forms and validation - DO NOT manually chunk these
          // react-hook-form, zod, and @hookform/resolvers have circular dependency
          // issues when bundled together, causing TDZ (Temporal Dead Zone) errors
          // at runtime ("Cannot access 'X' before initialization").
          // Let Vite handle them automatically via its own code-splitting.

          // Rich text editing
          if (
            id.includes("tiptap") ||
            id.includes("@tiptap/") ||
            id.includes("prosemirror")
          ) {
            return "vendor-editor";
          }

          // Calendar functionality
          if (id.includes("fullcalendar") || id.includes("@fullcalendar/")) {
            return "vendor-calendar";
          }

          // Date utilities
          if (id.includes("date-fns")) {
            return "vendor-dates";
          }

          // Icons - lucide
          if (id.includes("lucide-react")) {
            return "vendor-icons";
          }

          // DON'T create vendor-misc - let Vite handle remaining node_modules automatically
          // This prevents bundling issues with lazy-loaded libraries

          // Don't bundle anything else - let Vite's automatic code splitting handle it
          return undefined;
        },
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        // Rollup merges any chunk smaller than this into its importer. At the
        // 20000 it used to carry, every small lazy module landed in the ENTRY:
        // src/pages/AdminGscCallback.tsx - an admin OAuth callback - was in the
        // first paint of every visitor, along with useMediaUpload, useMFA,
        // useArticles, useCampaigns, useCampaignNotifications, useSocialFeatures,
        // useProximitySearch and usePushNotifications. All of them are lazy at
        // the source; the bundler put them back.
        //
        // The comment that used to sit here read "prevents tiny preloaded
        // chunks", and that reason no longer holds: scripts/prerender.mjs strips
        // the runtime-injected modulepreload links - 1,110 of them in the last
        // build - so the prerendered HTML carries 4 preloads per route either
        // way. The setting was paying for a problem something else already
        // solves.
        //
        // MEASURED, and it is NOT a smooth curve, so do not "tune" this - test
        // the values you would actually ship:
        //     20000 -> 227.5 KB gz critical path, 149 chunks   (was here)
        //     10000 -> 230.0 KB                 , 186
        //      5000 -> 237.0 KB across SIX chunks, 222
        //      1000 -> 219.3 KB                 , 281          (here now)
        // The trade is explicit: 8.2 KB off every first paint for 132 more
        // chunk files, which a visitor pays for only when they navigate to a
        // route that needs one. Six routes verified in a browser against the
        // built output - no chunk failures, no page errors.
        experimentalMinChunkSize: 1000,
      },
    },
    chunkSizeWarningLimit: 500, // Stricter limit due to better splitting
    // Improve build performance
    reportCompressedSize: false,
  },
  // Optimize dependencies
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

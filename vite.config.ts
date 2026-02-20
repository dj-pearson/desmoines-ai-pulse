import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { visualizer } from "rollup-plugin-visualizer";

// Custom plugin to inject build timestamp for cache busting
function injectBuildTimestamp(): Plugin {
  return {
    name: "inject-build-timestamp",
    transformIndexHtml(html) {
      return html.replace("__BUILD_TIMESTAMP__", new Date().toISOString());
    },
  };
}

// Custom plugin to remove vendor-maps from preload list
function removeMapPreload(): Plugin {
  return {
    name: "remove-map-preload",
    enforce: "post",
    transformIndexHtml(html) {
      // Remove modulepreload for vendor-maps to prevent it loading before React
      return html.replace(
        /<link rel="modulepreload"[^>]*vendor-maps[^>]*>/g,
        "",
      );
    },
  };
}

// https://vitejs.dev/config/
// Force rebuild: 2025-01-18
export default defineConfig(({ command, mode }) => ({
  base: "/",
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    injectBuildTimestamp(), // Add timestamp to prevent HTML caching
    removeMapPreload(), // Remove vendor-maps from preload list
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
    // Bundle analyzer - run with ANALYZE=true npm run build
    process.env.ANALYZE === "true" &&
      visualizer({
        open: true,
        filename: "dist/stats.html",
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
          // React core - MUST be first, highest priority
          // This ensures React is always available before any other code
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/")
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

          // UI Framework - Radix UI primitives (heavily used)
          if (id.includes("@radix-ui/")) {
            return "vendor-ui";
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
        // Prevent preloading of lazy-loaded chunks like maps
        experimentalMinChunkSize: 20000, // 20KB minimum - prevents tiny preloaded chunks
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
      "react-reconciler",
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
}));

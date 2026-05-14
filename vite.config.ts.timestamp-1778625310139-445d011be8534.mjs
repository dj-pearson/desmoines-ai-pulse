// vite.config.ts
import { defineConfig } from "file:///C:/Users/pears/Documents/Des-Moines-Pulse/desmoines-ai-pulse/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/pears/Documents/Des-Moines-Pulse/desmoines-ai-pulse/node_modules/@vitejs/plugin-react/dist/index.js";
import path from "path";
import { componentTagger } from "file:///C:/Users/pears/Documents/Des-Moines-Pulse/desmoines-ai-pulse/node_modules/lovable-tagger/dist/index.js";
import { visualizer } from "file:///C:/Users/pears/Documents/Des-Moines-Pulse/desmoines-ai-pulse/node_modules/rollup-plugin-visualizer/dist/plugin/index.js";
var __vite_injected_original_dirname = "C:\\Users\\pears\\Documents\\Des-Moines-Pulse\\desmoines-ai-pulse";
function injectBuildTimestamp() {
  return {
    name: "inject-build-timestamp",
    transformIndexHtml(html) {
      return html.replace("__BUILD_TIMESTAMP__", (/* @__PURE__ */ new Date()).toISOString());
    }
  };
}
function removeLazyPreloads() {
  return {
    name: "remove-lazy-preloads",
    enforce: "post",
    transformIndexHtml(html) {
      return html.replace(/<link rel="modulepreload"[^>]*vendor-maps[^>]*>/g, "").replace(/<link rel="modulepreload"[^>]*vendor-three[^>]*>/g, "").replace(/<link rel="modulepreload"[^>]*vendor-editor[^>]*>/g, "").replace(/<link rel="modulepreload"[^>]*vendor-recharts[^>]*>/g, "").replace(/<link rel="modulepreload"[^>]*vendor-d3[^>]*>/g, "").replace(/<link rel="modulepreload"[^>]*HeroCityLite[^>]*>/g, "").replace(/<link rel="modulepreload"[^>]*HeroCity[^>]*>/g, "");
    }
  };
}
var vite_config_default = defineConfig(({ command, mode }) => ({
  base: "/",
  server: {
    host: "::",
    port: 8080
  },
  plugins: [
    injectBuildTimestamp(),
    // Add timestamp to prevent HTML caching
    removeLazyPreloads(),
    // Remove vendor-maps/vendor-three from preload list
    react({
      babel: {
        plugins: [
          [
            "babel-plugin-react-remove-properties",
            { properties: ["data-testid"] }
          ]
        ]
      }
    }),
    command === "serve" && componentTagger(),
    // Bundle analyzer - run with ANALYZE=true npm run build
    process.env.ANALYZE === "true" && visualizer({
      open: true,
      filename: "dist/stats.html",
      gzipSize: true,
      brotliSize: true
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    }
  },
  build: {
    // Generate hidden sourcemaps for production debugging
    // Upload to error tracking service but don't deploy publicly
    sourcemap: mode === "production" ? "hidden" : true,
    outDir: "dist",
    assetsDir: "assets",
    cssCodeSplit: true,
    minify: "esbuild",
    // Use esbuild - faster and more reliable than terser
    target: "es2020",
    // Drop console.* and debugger statements in production
    ...mode === "production" && {
      esbuild: {
        drop: ["console", "debugger"]
      }
    },
    rollupOptions: {
      output: {
        // Improved code splitting - group related modules to reduce chunk count
        // and improve caching while avoiding circular dependencies
        manualChunks: (id) => {
          if (id.includes("/react/") || id.includes("/react-dom/") || id.includes("/scheduler/")) {
            return "vendor-react";
          }
          if (id.includes("react-router") || id.includes("@tanstack/react-query")) {
            return "vendor-react-ecosystem";
          }
          if (id.includes("@supabase/")) {
            return "vendor-supabase";
          }
          if (id.includes("@radix-ui/")) {
            return "vendor-ui";
          }
          if (id.includes("/three/") || id.includes("@react-three/") || id.includes("react-three") || id.includes("react-reconciler")) {
            return "vendor-three";
          }
          if (id.includes("leaflet") || id.includes("react-leaflet")) {
            return void 0;
          }
          if (id.includes("recharts") && !id.includes("d3")) {
            return "vendor-recharts";
          }
          if (id.includes("d3-")) {
            return "vendor-d3";
          }
          if (id.includes("tiptap") || id.includes("@tiptap/") || id.includes("prosemirror")) {
            return "vendor-editor";
          }
          if (id.includes("fullcalendar") || id.includes("@fullcalendar/")) {
            return "vendor-calendar";
          }
          if (id.includes("date-fns")) {
            return "vendor-dates";
          }
          if (id.includes("lucide-react")) {
            return "vendor-icons";
          }
          return void 0;
        },
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        // Prevent preloading of lazy-loaded chunks like maps
        experimentalMinChunkSize: 2e4
        // 20KB minimum - prevents tiny preloaded chunks
      }
    },
    chunkSizeWarningLimit: 500,
    // Stricter limit due to better splitting
    // Improve build performance
    reportCompressedSize: false
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
      "lucide-react"
      // Pre-bundle icons for faster dev
    ],
    exclude: [
      "react-leaflet",
      // Exclude to prevent pre-bundling issues AND loading order problems
      "leaflet",
      // Exclude to load with maps chunk
      "recharts",
      // Exclude due to circular dependency issues
      "d3-scale",
      // Exclude d3 modules to prevent TDZ errors
      "d3-array",
      "d3-shape",
      "d3-interpolate"
    ],
    // Force React to be bundled first
    force: true
  }
}));
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxwZWFyc1xcXFxEb2N1bWVudHNcXFxcRGVzLU1vaW5lcy1QdWxzZVxcXFxkZXNtb2luZXMtYWktcHVsc2VcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXHBlYXJzXFxcXERvY3VtZW50c1xcXFxEZXMtTW9pbmVzLVB1bHNlXFxcXGRlc21vaW5lcy1haS1wdWxzZVxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvcGVhcnMvRG9jdW1lbnRzL0Rlcy1Nb2luZXMtUHVsc2UvZGVzbW9pbmVzLWFpLXB1bHNlL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnLCBQbHVnaW4gfSBmcm9tIFwidml0ZVwiO1xyXG5pbXBvcnQgcmVhY3QgZnJvbSBcIkB2aXRlanMvcGx1Z2luLXJlYWN0XCI7XHJcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XHJcbmltcG9ydCB7IGNvbXBvbmVudFRhZ2dlciB9IGZyb20gXCJsb3ZhYmxlLXRhZ2dlclwiO1xyXG5pbXBvcnQgeyB2aXN1YWxpemVyIH0gZnJvbSBcInJvbGx1cC1wbHVnaW4tdmlzdWFsaXplclwiO1xyXG5cclxuLy8gQ3VzdG9tIHBsdWdpbiB0byBpbmplY3QgYnVpbGQgdGltZXN0YW1wIGZvciBjYWNoZSBidXN0aW5nXHJcbmZ1bmN0aW9uIGluamVjdEJ1aWxkVGltZXN0YW1wKCk6IFBsdWdpbiB7XHJcbiAgcmV0dXJuIHtcclxuICAgIG5hbWU6IFwiaW5qZWN0LWJ1aWxkLXRpbWVzdGFtcFwiLFxyXG4gICAgdHJhbnNmb3JtSW5kZXhIdG1sKGh0bWwpIHtcclxuICAgICAgcmV0dXJuIGh0bWwucmVwbGFjZShcIl9fQlVJTERfVElNRVNUQU1QX19cIiwgbmV3IERhdGUoKS50b0lTT1N0cmluZygpKTtcclxuICAgIH0sXHJcbiAgfTtcclxufVxyXG5cclxuLy8gQ3VzdG9tIHBsdWdpbiB0byByZW1vdmUgaGVhdnkgbGF6eS1sb2FkZWQgY2h1bmtzIGZyb20gcHJlbG9hZCBsaXN0XHJcbmZ1bmN0aW9uIHJlbW92ZUxhenlQcmVsb2FkcygpOiBQbHVnaW4ge1xyXG4gIHJldHVybiB7XHJcbiAgICBuYW1lOiBcInJlbW92ZS1sYXp5LXByZWxvYWRzXCIsXHJcbiAgICBlbmZvcmNlOiBcInBvc3RcIixcclxuICAgIHRyYW5zZm9ybUluZGV4SHRtbChodG1sKSB7XHJcbiAgICAgIC8vIFJlbW92ZSBtb2R1bGVwcmVsb2FkIGZvciBsYXp5LWxvYWRlZCB2ZW5kb3IgY2h1bmtzIHRoYXQgYXJlIE5PVFxyXG4gICAgICAvLyBuZWVkZWQgb24gaW5pdGlhbCBwYWdlIGxvYWQuIFRoZXNlIHdpbGwgbG9hZCBvbi1kZW1hbmQgd2hlbiBuZWVkZWQuXHJcbiAgICAgIHJldHVybiBodG1sXHJcbiAgICAgICAgLnJlcGxhY2UoLzxsaW5rIHJlbD1cIm1vZHVsZXByZWxvYWRcIltePl0qdmVuZG9yLW1hcHNbXj5dKj4vZywgXCJcIilcclxuICAgICAgICAucmVwbGFjZSgvPGxpbmsgcmVsPVwibW9kdWxlcHJlbG9hZFwiW14+XSp2ZW5kb3ItdGhyZWVbXj5dKj4vZywgXCJcIilcclxuICAgICAgICAucmVwbGFjZSgvPGxpbmsgcmVsPVwibW9kdWxlcHJlbG9hZFwiW14+XSp2ZW5kb3ItZWRpdG9yW14+XSo+L2csIFwiXCIpXHJcbiAgICAgICAgLnJlcGxhY2UoLzxsaW5rIHJlbD1cIm1vZHVsZXByZWxvYWRcIltePl0qdmVuZG9yLXJlY2hhcnRzW14+XSo+L2csIFwiXCIpXHJcbiAgICAgICAgLnJlcGxhY2UoLzxsaW5rIHJlbD1cIm1vZHVsZXByZWxvYWRcIltePl0qdmVuZG9yLWQzW14+XSo+L2csIFwiXCIpXHJcbiAgICAgICAgLnJlcGxhY2UoLzxsaW5rIHJlbD1cIm1vZHVsZXByZWxvYWRcIltePl0qSGVyb0NpdHlMaXRlW14+XSo+L2csIFwiXCIpXHJcbiAgICAgICAgLnJlcGxhY2UoLzxsaW5rIHJlbD1cIm1vZHVsZXByZWxvYWRcIltePl0qSGVyb0NpdHlbXj5dKj4vZywgXCJcIik7XHJcbiAgICB9LFxyXG4gIH07XHJcbn1cclxuXHJcbi8vIGh0dHBzOi8vdml0ZWpzLmRldi9jb25maWcvXHJcbi8vIEZvcmNlIHJlYnVpbGQ6IDIwMjUtMDEtMThcclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCh7IGNvbW1hbmQsIG1vZGUgfSkgPT4gKHtcclxuICBiYXNlOiBcIi9cIixcclxuICBzZXJ2ZXI6IHtcclxuICAgIGhvc3Q6IFwiOjpcIixcclxuICAgIHBvcnQ6IDgwODAsXHJcbiAgfSxcclxuICBwbHVnaW5zOiBbXHJcbiAgICBpbmplY3RCdWlsZFRpbWVzdGFtcCgpLCAvLyBBZGQgdGltZXN0YW1wIHRvIHByZXZlbnQgSFRNTCBjYWNoaW5nXHJcbiAgICByZW1vdmVMYXp5UHJlbG9hZHMoKSwgLy8gUmVtb3ZlIHZlbmRvci1tYXBzL3ZlbmRvci10aHJlZSBmcm9tIHByZWxvYWQgbGlzdFxyXG4gICAgcmVhY3Qoe1xyXG4gICAgICBiYWJlbDoge1xyXG4gICAgICAgIHBsdWdpbnM6IFtcclxuICAgICAgICAgIFtcclxuICAgICAgICAgICAgXCJiYWJlbC1wbHVnaW4tcmVhY3QtcmVtb3ZlLXByb3BlcnRpZXNcIixcclxuICAgICAgICAgICAgeyBwcm9wZXJ0aWVzOiBbXCJkYXRhLXRlc3RpZFwiXSB9LFxyXG4gICAgICAgICAgXSxcclxuICAgICAgICBdLFxyXG4gICAgICB9LFxyXG4gICAgfSksXHJcbiAgICBjb21tYW5kID09PSBcInNlcnZlXCIgJiYgY29tcG9uZW50VGFnZ2VyKCksXHJcbiAgICAvLyBCdW5kbGUgYW5hbHl6ZXIgLSBydW4gd2l0aCBBTkFMWVpFPXRydWUgbnBtIHJ1biBidWlsZFxyXG4gICAgcHJvY2Vzcy5lbnYuQU5BTFlaRSA9PT0gXCJ0cnVlXCIgJiZcclxuICAgICAgdmlzdWFsaXplcih7XHJcbiAgICAgICAgb3BlbjogdHJ1ZSxcclxuICAgICAgICBmaWxlbmFtZTogXCJkaXN0L3N0YXRzLmh0bWxcIixcclxuICAgICAgICBnemlwU2l6ZTogdHJ1ZSxcclxuICAgICAgICBicm90bGlTaXplOiB0cnVlLFxyXG4gICAgICB9KSxcclxuICBdLmZpbHRlcihCb29sZWFuKSxcclxuICByZXNvbHZlOiB7XHJcbiAgICBhbGlhczoge1xyXG4gICAgICBcIkBcIjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuL3NyY1wiKSxcclxuICAgIH0sXHJcbiAgfSxcclxuICBidWlsZDoge1xyXG4gICAgLy8gR2VuZXJhdGUgaGlkZGVuIHNvdXJjZW1hcHMgZm9yIHByb2R1Y3Rpb24gZGVidWdnaW5nXHJcbiAgICAvLyBVcGxvYWQgdG8gZXJyb3IgdHJhY2tpbmcgc2VydmljZSBidXQgZG9uJ3QgZGVwbG95IHB1YmxpY2x5XHJcbiAgICBzb3VyY2VtYXA6IG1vZGUgPT09IFwicHJvZHVjdGlvblwiID8gXCJoaWRkZW5cIiA6IHRydWUsXHJcbiAgICBvdXREaXI6IFwiZGlzdFwiLFxyXG4gICAgYXNzZXRzRGlyOiBcImFzc2V0c1wiLFxyXG4gICAgY3NzQ29kZVNwbGl0OiB0cnVlLFxyXG4gICAgbWluaWZ5OiBcImVzYnVpbGRcIiwgLy8gVXNlIGVzYnVpbGQgLSBmYXN0ZXIgYW5kIG1vcmUgcmVsaWFibGUgdGhhbiB0ZXJzZXJcclxuICAgIHRhcmdldDogXCJlczIwMjBcIixcclxuICAgIC8vIERyb3AgY29uc29sZS4qIGFuZCBkZWJ1Z2dlciBzdGF0ZW1lbnRzIGluIHByb2R1Y3Rpb25cclxuICAgIC4uLihtb2RlID09PSBcInByb2R1Y3Rpb25cIiAmJiB7XHJcbiAgICAgIGVzYnVpbGQ6IHtcclxuICAgICAgICBkcm9wOiBbXCJjb25zb2xlXCIsIFwiZGVidWdnZXJcIl0sXHJcbiAgICAgIH0sXHJcbiAgICB9KSxcclxuICAgIHJvbGx1cE9wdGlvbnM6IHtcclxuICAgICAgb3V0cHV0OiB7XHJcbiAgICAgICAgLy8gSW1wcm92ZWQgY29kZSBzcGxpdHRpbmcgLSBncm91cCByZWxhdGVkIG1vZHVsZXMgdG8gcmVkdWNlIGNodW5rIGNvdW50XHJcbiAgICAgICAgLy8gYW5kIGltcHJvdmUgY2FjaGluZyB3aGlsZSBhdm9pZGluZyBjaXJjdWxhciBkZXBlbmRlbmNpZXNcclxuICAgICAgICBtYW51YWxDaHVua3M6IChpZCkgPT4ge1xyXG4gICAgICAgICAgLy8gUmVhY3QgY29yZSAtIE1VU1QgYmUgZmlyc3QsIGhpZ2hlc3QgcHJpb3JpdHlcclxuICAgICAgICAgIC8vIFRoaXMgZW5zdXJlcyBSZWFjdCBpcyBhbHdheXMgYXZhaWxhYmxlIGJlZm9yZSBhbnkgb3RoZXIgY29kZVxyXG4gICAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICBpZC5pbmNsdWRlcyhcIi9yZWFjdC9cIikgfHxcclxuICAgICAgICAgICAgaWQuaW5jbHVkZXMoXCIvcmVhY3QtZG9tL1wiKSB8fFxyXG4gICAgICAgICAgICBpZC5pbmNsdWRlcyhcIi9zY2hlZHVsZXIvXCIpXHJcbiAgICAgICAgICApIHtcclxuICAgICAgICAgICAgcmV0dXJuIFwidmVuZG9yLXJlYWN0XCI7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgLy8gUmVhY3QgZWNvc3lzdGVtIC0gZGVwZW5kcyBvbiB2ZW5kb3ItcmVhY3RcclxuICAgICAgICAgIGlmIChcclxuICAgICAgICAgICAgaWQuaW5jbHVkZXMoXCJyZWFjdC1yb3V0ZXJcIikgfHxcclxuICAgICAgICAgICAgaWQuaW5jbHVkZXMoXCJAdGFuc3RhY2svcmVhY3QtcXVlcnlcIilcclxuICAgICAgICAgICkge1xyXG4gICAgICAgICAgICByZXR1cm4gXCJ2ZW5kb3ItcmVhY3QtZWNvc3lzdGVtXCI7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgLy8gU3VwYWJhc2UgLSBhdXRoIGFuZCBkYXRhYmFzZVxyXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKFwiQHN1cGFiYXNlL1wiKSkge1xyXG4gICAgICAgICAgICByZXR1cm4gXCJ2ZW5kb3Itc3VwYWJhc2VcIjtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAvLyBVSSBGcmFtZXdvcmsgLSBSYWRpeCBVSSBwcmltaXRpdmVzIChoZWF2aWx5IHVzZWQpXHJcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoXCJAcmFkaXgtdWkvXCIpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBcInZlbmRvci11aVwiO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIC8vIFRocmVlLmpzICsgUmVhY3QgVGhyZWUgRmliZXIgLSBzZXBhcmF0ZSBjaHVuayBzbyBpdCdzIG9ubHkgbG9hZGVkXHJcbiAgICAgICAgICAvLyB3aGVuIEhlcm9DaXR5TGl0ZSByZW5kZXJzIChsYXp5LWxvYWRlZCwgZGVmZXJyZWQgdmlhIHJlcXVlc3RJZGxlQ2FsbGJhY2spLlxyXG4gICAgICAgICAgLy8gV2l0aG91dCB0aGlzLCBUaHJlZS5qcyBnZXRzIGJ1bmRsZWQgaW50byB0aGUgSGVyb0NpdHlMaXRlIHBhZ2UgY2h1bmtcclxuICAgICAgICAgIC8vIHdoaWNoIFZpdGUgbWF5IGRlY2lkZSB0byBwcmVsb2FkLlxyXG4gICAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICBpZC5pbmNsdWRlcyhcIi90aHJlZS9cIikgfHxcclxuICAgICAgICAgICAgaWQuaW5jbHVkZXMoXCJAcmVhY3QtdGhyZWUvXCIpIHx8XHJcbiAgICAgICAgICAgIGlkLmluY2x1ZGVzKFwicmVhY3QtdGhyZWVcIikgfHxcclxuICAgICAgICAgICAgaWQuaW5jbHVkZXMoXCJyZWFjdC1yZWNvbmNpbGVyXCIpXHJcbiAgICAgICAgICApIHtcclxuICAgICAgICAgICAgcmV0dXJuIFwidmVuZG9yLXRocmVlXCI7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgLy8gTWFwcyAtIExlYWZsZXQgKERPIE5PVCBCVU5ETEUgLSBjYXVzZXMgcHJlbG9hZCBpc3N1ZXMpXHJcbiAgICAgICAgICAvLyBCeSByZXR1cm5pbmcgdW5kZWZpbmVkLCB3ZSBsZXQgZWFjaCBsYXp5LWxvYWRlZCBtYXAgY29tcG9uZW50XHJcbiAgICAgICAgICAvLyBoYXZlIGl0cyBvd24gY2h1bmssIHByZXZlbnRpbmcgcHJlbWF0dXJlIGxvYWRpbmdcclxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcyhcImxlYWZsZXRcIikgfHwgaWQuaW5jbHVkZXMoXCJyZWFjdC1sZWFmbGV0XCIpKSB7XHJcbiAgICAgICAgICAgIC8vIERvbid0IGJ1bmRsZSAtIGxldCBkeW5hbWljIGltcG9ydHMgY3JlYXRlIHNlcGFyYXRlIGNodW5rc1xyXG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIC8vIENoYXJ0cyAtIERvbid0IGJ1bmRsZSB0b2dldGhlciB0byBhdm9pZCBjaXJjdWxhciBkZXBzXHJcbiAgICAgICAgICAvLyBMZXQgVml0ZSBoYW5kbGUgdGhlbSBuYXR1cmFsbHlcclxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcyhcInJlY2hhcnRzXCIpICYmICFpZC5pbmNsdWRlcyhcImQzXCIpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBcInZlbmRvci1yZWNoYXJ0c1wiO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIC8vIEQzIHV0aWxpdGllcyAtIHNlcGFyYXRlIGZyb20gcmVjaGFydHNcclxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcyhcImQzLVwiKSkge1xyXG4gICAgICAgICAgICByZXR1cm4gXCJ2ZW5kb3ItZDNcIjtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAvLyBGb3JtcyBhbmQgdmFsaWRhdGlvbiAtIERPIE5PVCBtYW51YWxseSBjaHVuayB0aGVzZVxyXG4gICAgICAgICAgLy8gcmVhY3QtaG9vay1mb3JtLCB6b2QsIGFuZCBAaG9va2Zvcm0vcmVzb2x2ZXJzIGhhdmUgY2lyY3VsYXIgZGVwZW5kZW5jeVxyXG4gICAgICAgICAgLy8gaXNzdWVzIHdoZW4gYnVuZGxlZCB0b2dldGhlciwgY2F1c2luZyBURFogKFRlbXBvcmFsIERlYWQgWm9uZSkgZXJyb3JzXHJcbiAgICAgICAgICAvLyBhdCBydW50aW1lIChcIkNhbm5vdCBhY2Nlc3MgJ1gnIGJlZm9yZSBpbml0aWFsaXphdGlvblwiKS5cclxuICAgICAgICAgIC8vIExldCBWaXRlIGhhbmRsZSB0aGVtIGF1dG9tYXRpY2FsbHkgdmlhIGl0cyBvd24gY29kZS1zcGxpdHRpbmcuXHJcblxyXG4gICAgICAgICAgLy8gUmljaCB0ZXh0IGVkaXRpbmdcclxuICAgICAgICAgIGlmIChcclxuICAgICAgICAgICAgaWQuaW5jbHVkZXMoXCJ0aXB0YXBcIikgfHxcclxuICAgICAgICAgICAgaWQuaW5jbHVkZXMoXCJAdGlwdGFwL1wiKSB8fFxyXG4gICAgICAgICAgICBpZC5pbmNsdWRlcyhcInByb3NlbWlycm9yXCIpXHJcbiAgICAgICAgICApIHtcclxuICAgICAgICAgICAgcmV0dXJuIFwidmVuZG9yLWVkaXRvclwiO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIC8vIENhbGVuZGFyIGZ1bmN0aW9uYWxpdHlcclxuICAgICAgICAgIGlmIChpZC5pbmNsdWRlcyhcImZ1bGxjYWxlbmRhclwiKSB8fCBpZC5pbmNsdWRlcyhcIkBmdWxsY2FsZW5kYXIvXCIpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBcInZlbmRvci1jYWxlbmRhclwiO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIC8vIERhdGUgdXRpbGl0aWVzXHJcbiAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoXCJkYXRlLWZuc1wiKSkge1xyXG4gICAgICAgICAgICByZXR1cm4gXCJ2ZW5kb3ItZGF0ZXNcIjtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAvLyBJY29ucyAtIGx1Y2lkZVxyXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKFwibHVjaWRlLXJlYWN0XCIpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBcInZlbmRvci1pY29uc1wiO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIC8vIERPTidUIGNyZWF0ZSB2ZW5kb3ItbWlzYyAtIGxldCBWaXRlIGhhbmRsZSByZW1haW5pbmcgbm9kZV9tb2R1bGVzIGF1dG9tYXRpY2FsbHlcclxuICAgICAgICAgIC8vIFRoaXMgcHJldmVudHMgYnVuZGxpbmcgaXNzdWVzIHdpdGggbGF6eS1sb2FkZWQgbGlicmFyaWVzXHJcblxyXG4gICAgICAgICAgLy8gRG9uJ3QgYnVuZGxlIGFueXRoaW5nIGVsc2UgLSBsZXQgVml0ZSdzIGF1dG9tYXRpYyBjb2RlIHNwbGl0dGluZyBoYW5kbGUgaXRcclxuICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XHJcbiAgICAgICAgfSxcclxuICAgICAgICBhc3NldEZpbGVOYW1lczogXCJhc3NldHMvW25hbWVdLVtoYXNoXVtleHRuYW1lXVwiLFxyXG4gICAgICAgIGNodW5rRmlsZU5hbWVzOiBcImFzc2V0cy9bbmFtZV0tW2hhc2hdLmpzXCIsXHJcbiAgICAgICAgZW50cnlGaWxlTmFtZXM6IFwiYXNzZXRzL1tuYW1lXS1baGFzaF0uanNcIixcclxuICAgICAgICAvLyBQcmV2ZW50IHByZWxvYWRpbmcgb2YgbGF6eS1sb2FkZWQgY2h1bmtzIGxpa2UgbWFwc1xyXG4gICAgICAgIGV4cGVyaW1lbnRhbE1pbkNodW5rU2l6ZTogMjAwMDAsIC8vIDIwS0IgbWluaW11bSAtIHByZXZlbnRzIHRpbnkgcHJlbG9hZGVkIGNodW5rc1xyXG4gICAgICB9LFxyXG4gICAgfSxcclxuICAgIGNodW5rU2l6ZVdhcm5pbmdMaW1pdDogNTAwLCAvLyBTdHJpY3RlciBsaW1pdCBkdWUgdG8gYmV0dGVyIHNwbGl0dGluZ1xyXG4gICAgLy8gSW1wcm92ZSBidWlsZCBwZXJmb3JtYW5jZVxyXG4gICAgcmVwb3J0Q29tcHJlc3NlZFNpemU6IGZhbHNlLFxyXG4gIH0sXHJcbiAgLy8gT3B0aW1pemUgZGVwZW5kZW5jaWVzXHJcbiAgb3B0aW1pemVEZXBzOiB7XHJcbiAgICBpbmNsdWRlOiBbXHJcbiAgICAgIFwicmVhY3RcIixcclxuICAgICAgXCJyZWFjdC1kb21cIixcclxuICAgICAgXCJyZWFjdC9qc3gtcnVudGltZVwiLFxyXG4gICAgICBcInJlYWN0LXJvdXRlci1kb21cIixcclxuICAgICAgXCJAdGFuc3RhY2svcmVhY3QtcXVlcnlcIixcclxuICAgICAgXCJAc3VwYWJhc2Uvc3VwYWJhc2UtanNcIixcclxuICAgICAgXCJsdWNpZGUtcmVhY3RcIiwgLy8gUHJlLWJ1bmRsZSBpY29ucyBmb3IgZmFzdGVyIGRldlxyXG4gICAgXSxcclxuICAgIGV4Y2x1ZGU6IFtcclxuICAgICAgXCJyZWFjdC1sZWFmbGV0XCIsIC8vIEV4Y2x1ZGUgdG8gcHJldmVudCBwcmUtYnVuZGxpbmcgaXNzdWVzIEFORCBsb2FkaW5nIG9yZGVyIHByb2JsZW1zXHJcbiAgICAgIFwibGVhZmxldFwiLCAvLyBFeGNsdWRlIHRvIGxvYWQgd2l0aCBtYXBzIGNodW5rXHJcbiAgICAgIFwicmVjaGFydHNcIiwgLy8gRXhjbHVkZSBkdWUgdG8gY2lyY3VsYXIgZGVwZW5kZW5jeSBpc3N1ZXNcclxuICAgICAgXCJkMy1zY2FsZVwiLCAvLyBFeGNsdWRlIGQzIG1vZHVsZXMgdG8gcHJldmVudCBURFogZXJyb3JzXHJcbiAgICAgIFwiZDMtYXJyYXlcIixcclxuICAgICAgXCJkMy1zaGFwZVwiLFxyXG4gICAgICBcImQzLWludGVycG9sYXRlXCIsXHJcbiAgICBdLFxyXG4gICAgLy8gRm9yY2UgUmVhY3QgdG8gYmUgYnVuZGxlZCBmaXJzdFxyXG4gICAgZm9yY2U6IHRydWUsXHJcbiAgfSxcclxufSkpO1xyXG4iXSwKICAibWFwcGluZ3MiOiAi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

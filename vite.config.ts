import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
// Force rebuild: 2025-08-13
export default defineConfig(({ command }) => ({
  base: "/",
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
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
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    sourcemap: false, // Disable sourcemaps in production for smaller files
    outDir: "dist",
    assetsDir: "assets",
    cssCodeSplit: true,
    minify: "esbuild", // Use esbuild - faster and more reliable than terser
    target: "es2020",
    rollupOptions: {
      treeshake: {
        preset: "recommended",
      },
      output: {
        // Simpler chunking strategy to avoid circular dependencies
        manualChunks: (id) => {
          if (id.includes("node_modules")) {
            // Core React bundle
            if (id.includes("react") || id.includes("react-dom") || id.includes("scheduler")) {
              return "vendor-react";
            }
            
            // Router bundle (keep separate from react)
            if (id.includes("react-router")) {
              return "vendor-router";
            }
            
            // Query bundle
            if (id.includes("@tanstack")) {
              return "vendor-query";
            }
            
            // Supabase bundle
            if (id.includes("@supabase")) {
              return "vendor-supabase";
            }
            
            // UI components bundle
            if (id.includes("@radix-ui")) {
              return "vendor-ui";
            }
            
            // Date utilities bundle
            if (id.includes("date-fns")) {
              return "vendor-date";
            }
            
            // Other vendors
            return "vendor-other";
          }
        },
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith(".css")) {
            return "assets/[name]-[hash].css";
          }
          return "assets/[name]-[hash][extname]";
        },
        chunkFileNames: (chunkInfo) => {
          // Ensure all JS chunks have .js extension, not .tsx
          return "assets/[name]-[hash].js";
        },
        entryFileNames: (chunkInfo) => {
          // Ensure all entry files have .js extension, not .tsx
          return "assets/[name]-[hash].js";
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
}));

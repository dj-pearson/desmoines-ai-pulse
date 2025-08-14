import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: "/",
  server: {
    host: "::",
    port: 8080,
    force: true, // Force refresh dependencies
    clearScreen: false,
    fs: {
      strict: false
    }
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    target: "es2020",
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: mode === "production",
        drop_debugger: mode === "production",
      },
    },
    rollupOptions: {
      output: {
        format: "es",
        // Ensure proper asset naming for cache busting
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js", 
        assetFileNames: "assets/[name]-[hash].[ext]",
        manualChunks: {
          // Vendor chunks for better caching
          vendor: ["react", "react-dom"],
          router: ["react-router-dom"],
          ui: ["@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu", "@radix-ui/react-select"],
          query: ["@tanstack/react-query"],
          supabase: ["@supabase/supabase-js"],
          utils: ["date-fns", "clsx", "tailwind-merge"],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router-dom",
      "react-helmet-async",
      "@tanstack/react-query",
      "@supabase/supabase-js",
    ],
    dedupe: ["react", "react-dom", "react-helmet-async", "react-router-dom", "@tanstack/react-query"],
  },
  plugins: [
    react({
      babel: {
        plugins: mode === "production" ? ["babel-plugin-react-remove-properties"] : [],
      },
    }),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    dedupe: ["react", "react-dom", "react-router-dom", "react-helmet-async", "@tanstack/react-query"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared/schema": path.resolve(__dirname, "./src/lib/types"),
    },
  },
}));

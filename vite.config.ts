import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { visualizer } from "rollup-plugin-visualizer";

// https://vitejs.dev/config/
// Force rebuild: 2025-08-13
export default defineConfig(({ command, mode }) => ({
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
    // Bundle analyzer - run with ANALYZE=true npm run build
    process.env.ANALYZE === 'true' && visualizer({
      open: true,
      filename: 'dist/stats.html',
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
    sourcemap: mode === 'production' ? 'hidden' : true,
    outDir: "dist",
    assetsDir: "assets",
    cssCodeSplit: true,
    minify: "esbuild", // Use esbuild - faster and more reliable than terser
    target: "es2020",
    // Drop console.* and debugger statements in production
    ...(mode === 'production' && {
      esbuild: {
        drop: ['console', 'debugger'],
      },
    }),
    rollupOptions: {
      output: {
        // Simplified code splitting - only chunk the essentials
        // Let Vite handle the rest automatically to avoid circular dependency issues
        manualChunks: (id) => {
          // Only chunk React core - most critical
          if (id.includes('/react/') || id.includes('/react-dom/')) {
            return 'vendor-react';
          }

          // DO NOT manually chunk anything else - let Vite decide
          // This avoids circular dependency issues from manual chunking
        },
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
      },
    },
    chunkSizeWarningLimit: 500, // Stricter limit due to better splitting
    // Improve build performance
    reportCompressedSize: false,
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react-router-dom',
      '@tanstack/react-query',
      '@supabase/supabase-js',
      'lucide-react', // Pre-bundle icons for faster dev
      'react-reconciler',
    ],
    exclude: [
      'react-leaflet', // Exclude to prevent pre-bundling issues
      'leaflet', // Exclude to load with maps chunk
    ],
  },
}));

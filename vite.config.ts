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
        // Improved code splitting - group related modules to reduce chunk count
        // and improve caching while avoiding circular dependencies
        manualChunks: (id) => {
          // React core - highest priority, cached long-term
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
            return 'vendor-react';
          }

          // React ecosystem - router, query, etc.
          if (id.includes('react-router') || id.includes('@tanstack/react-query')) {
            return 'vendor-react-ecosystem';
          }

          // Supabase - auth and database
          if (id.includes('@supabase/')) {
            return 'vendor-supabase';
          }

          // UI Framework - Radix UI primitives (heavily used)
          if (id.includes('@radix-ui/')) {
            return 'vendor-ui';
          }

          // Maps - Leaflet (only loaded on map pages)
          if (id.includes('leaflet') || id.includes('react-leaflet')) {
            return 'vendor-maps';
          }

          // Charts - Recharts (only loaded on analytics pages)
          if (id.includes('recharts') || id.includes('d3-')) {
            return 'vendor-charts';
          }

          // 3D - Three.js (only loaded on 3D hero pages)
          if (id.includes('three') || id.includes('@react-three/')) {
            return 'vendor-3d';
          }

          // Forms and validation
          if (id.includes('react-hook-form') || id.includes('zod') || id.includes('@hookform/')) {
            return 'vendor-forms';
          }

          // Rich text editing
          if (id.includes('tiptap') || id.includes('@tiptap/') || id.includes('prosemirror')) {
            return 'vendor-editor';
          }

          // Calendar functionality
          if (id.includes('fullcalendar') || id.includes('@fullcalendar/')) {
            return 'vendor-calendar';
          }

          // Date utilities
          if (id.includes('date-fns')) {
            return 'vendor-dates';
          }

          // Icons - lucide
          if (id.includes('lucide-react')) {
            return 'vendor-icons';
          }

          // Group remaining node_modules into a general vendor chunk
          if (id.includes('node_modules')) {
            return 'vendor-misc';
          }
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

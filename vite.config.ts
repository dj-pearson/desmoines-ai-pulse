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
        // Advanced manual code splitting for optimal performance
        manualChunks: (id) => {
          // Critical dependencies - keep together for fastest initial load
          // INCLUDE react-leaflet here to ensure React context is available
          if (
            id.includes('react/') || 
            id.includes('react-dom/') || 
            id.includes('scheduler') || 
            id.includes('/react-leaflet') || 
            id.includes('@react-leaflet')
          ) {
            return 'vendor-react';
          }

          // React ecosystem - frequently used
          if (id.includes('react-router-dom') || id.includes('@tanstack/react-query')) {
            return 'vendor-routing';
          }

          // Heavy 3D libraries - lazy load only when needed
          if (id.includes('three') || id.includes('@react-three')) {
            return 'vendor-3d';
          }

          // Map library (leaflet only - react-leaflet is in vendor-react)
          if (id.includes('/leaflet') && !id.includes('/react-leaflet') && !id.includes('@react-leaflet')) {
            return 'vendor-maps';
          }

          // Chart libraries - exclude from manual chunking due to circular dependencies
          // Let Vite handle recharts automatically
          if (id.includes('recharts')) {
            return undefined;
          }

          // Calendar libraries - lazy load for calendar pages
          if (id.includes('@fullcalendar') || id.includes('date-fns')) {
            return 'vendor-calendar';
          }

          // Form libraries - used across multiple pages
          if (id.includes('react-hook-form') || id.includes('zod') || id.includes('@hookform')) {
            return 'vendor-forms';
          }

          // Supabase client - used throughout app
          if (id.includes('@supabase')) {
            return 'vendor-supabase';
          }

          // UI component libraries - used throughout but can be split
          if (id.includes('@radix-ui')) {
            return 'vendor-ui';
          }

          // Animation libraries
          if (id.includes('framer-motion')) {
            return 'vendor-animation';
          }

          // Markdown and rich text
          if (id.includes('react-markdown') || id.includes('remark')) {
            return 'vendor-markdown';
          }

          // Utility libraries
          if (id.includes('lucide-react')) {
            return 'vendor-icons';
          }

          // All other node_modules go into vendor chunk
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
    ],
    exclude: [
      '@react-three/fiber',
      '@react-three/drei',
      'three', // Lazy load heavy 3D libs
      'react-leaflet', // Exclude to prevent pre-bundling issues
      'leaflet', // Exclude to load with maps chunk
    ],
  },
}));

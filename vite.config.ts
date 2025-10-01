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
          ['babel-plugin-react-remove-properties', { properties: ['data-testid'] }]
        ]
      }
    }), 
    command === "serve" && componentTagger()
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    sourcemap: false,
    outDir: "dist",
    assetsDir: "assets",
    cssCodeSplit: true,
    cssMinify: 'lightningcss',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info'],
        passes: 2
      },
      mangle: {
        safari10: true
      },
      format: {
        comments: false
      }
    },
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Aggressive code splitting for smaller initial bundles
          if (id.includes('node_modules')) {
            // Core React (must load first)
            if (id.includes('react/') || id.includes('react-dom/')) {
              return 'react-core';
            }
            if (id.includes('scheduler')) {
              return 'react-core';
            }
            
            // Router (load on demand)
            if (id.includes('react-router')) {
              return 'router';
            }
            
            // Query (load on demand)
            if (id.includes('@tanstack')) {
              return 'query';
            }
            
            // Supabase (defer)
            if (id.includes('@supabase')) {
              return 'supabase';
            }
            
            // UI components (load on demand)
            if (id.includes('@radix-ui')) {
              const component = id.split('node_modules/')[1].split('/')[0];
              return `ui-${component.replace('@radix-ui/react-', '')}`;
            }
            
            // Lucide icons (defer)
            if (id.includes('lucide-react')) {
              return 'icons';
            }
            
            // Date libraries (defer)
            if (id.includes('date-fns')) {
              return 'date-utils';
            }
            
            // Form libraries (defer)
            if (id.includes('react-hook-form') || id.includes('zod')) {
              return 'forms';
            }
            
            // Map libraries (heavy, defer)
            if (id.includes('leaflet') || id.includes('react-leaflet')) {
              return 'maps';
            }
            
            // 3D libraries (heavy, defer)
            if (id.includes('three') || id.includes('@react-three')) {
              return '3d';
            }
            
            // Other vendors
            return 'vendor';
          }
        },
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            return 'assets/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
      },
    },
    chunkSizeWarningLimit: 500,
  },
}));

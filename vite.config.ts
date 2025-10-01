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
    target: 'es2020',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
        passes: 3,
        unsafe: true,
        unsafe_comps: true,
        unsafe_math: true,
        unsafe_methods: true,
      },
      mangle: {
        safari10: true,
        toplevel: true,
      },
      format: {
        comments: false
      }
    },
    rollupOptions: {
      treeshake: {
        preset: 'recommended',
        moduleSideEffects: false,
        propertyReadSideEffects: false,
        unknownGlobalSideEffects: false,
      },
      output: {
        manualChunks: (id) => {
          // Aggressive code splitting for smaller initial bundles
          if (id.includes('node_modules')) {
            // Core React (must load first) - keep minimal
            if (id.includes('react/') && !id.includes('react-dom')) {
              return 'react';
            }
            if (id.includes('react-dom/')) {
              return 'react-dom';
            }
            if (id.includes('scheduler')) {
              return 'react';
            }
            
            // Router (defer)
            if (id.includes('react-router')) {
              return 'router';
            }
            
            // Query (defer)
            if (id.includes('@tanstack')) {
              return 'query';
            }
            
            // Supabase (defer)
            if (id.includes('@supabase')) {
              return 'supabase';
            }
            
            // Date libraries (defer, heavy)
            if (id.includes('date-fns')) {
              return 'date';
            }
            
            // Form libraries (defer)
            if (id.includes('react-hook-form') || id.includes('zod') || id.includes('@hookform')) {
              return 'forms';
            }
            
            // UI components - split by component for granular loading
            if (id.includes('@radix-ui/react-dialog')) {
              return 'ui-dialog';
            }
            if (id.includes('@radix-ui/react-select')) {
              return 'ui-select';
            }
            if (id.includes('@radix-ui/react-popover')) {
              return 'ui-popover';
            }
            if (id.includes('@radix-ui')) {
              // Group remaining radix components
              return 'ui-radix';
            }
            
            // Icons (defer)
            if (id.includes('lucide-react')) {
              return 'icons';
            }
            
            // Map libraries (very heavy, defer)
            if (id.includes('leaflet') || id.includes('react-leaflet')) {
              return 'maps';
            }
            
            // 3D libraries (very heavy, defer)
            if (id.includes('three') || id.includes('@react-three')) {
              return '3d';
            }
            
            // Charts (defer)
            if (id.includes('recharts')) {
              return 'charts';
            }
            
            // Other small vendors can be grouped
            return 'vendor';
          }
          
          // Split app code by route
          if (id.includes('src/pages/')) {
            const pageName = id.split('src/pages/')[1].split('.')[0];
            return `page-${pageName.toLowerCase()}`;
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
    chunkSizeWarningLimit: 400,
  },
}));

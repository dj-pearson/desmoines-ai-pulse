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
    sourcemap: true,
    outDir: "dist",
    assetsDir: "assets",
    cssCodeSplit: true,
    minify: 'terser',
    target: 'es2020',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
        passes: 2,
      },
      mangle: {
        safari10: true,
      },
      format: {
        comments: false
      }
    },
    rollupOptions: {
      treeshake: {
        preset: 'recommended',
      },
      output: {
        manualChunks: (id) => {
          // Simpler code splitting to avoid empty chunks
          if (id.includes('node_modules')) {
            // Core React bundle
            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) {
              return 'vendor-react';
            }
            
            // Router bundle
            if (id.includes('react-router')) {
              return 'vendor-router';
            }
            
            // Query bundle
            if (id.includes('@tanstack')) {
              return 'vendor-query';
            }
            
            // Supabase bundle
            if (id.includes('@supabase')) {
              return 'vendor-supabase';
            }
            
            // UI components bundle
            if (id.includes('@radix-ui')) {
              return 'vendor-ui';
            }
            
            // Icons bundle
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            
            // Date utilities bundle
            if (id.includes('date-fns')) {
              return 'vendor-date';
            }
            
            // Other vendors
            return 'vendor-other';
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
    chunkSizeWarningLimit: 600,
  },
}));

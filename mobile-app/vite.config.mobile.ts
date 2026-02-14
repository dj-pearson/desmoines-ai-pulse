import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Mobile-specific Vite configuration
 *
 * This is an ISOLATED build config for the Capacitor mobile apps (iOS/Android).
 * It does NOT affect the web production build (vite.config.ts in project root).
 *
 * Key differences from web config:
 * - Outputs to mobile-app/www/ instead of dist/
 * - No lovable-tagger (not needed in native apps)
 * - Mobile-optimized chunk splitting (fewer network requests on device)
 * - Injects CAPACITOR_PLATFORM env variable
 * - No bundle analysis plugins
 * - Service worker registration for offline support
 */

// Inject mobile platform detection at build time
function injectMobilePlatform(): Plugin {
  return {
    name: 'inject-mobile-platform',
    config() {
      return {
        define: {
          '__MOBILE_APP__': JSON.stringify(true),
          '__BUILD_TIMESTAMP__': JSON.stringify(new Date().toISOString()),
        },
      };
    },
    transformIndexHtml(html) {
      return html
        .replace('__BUILD_TIMESTAMP__', new Date().toISOString())
        .replace(
          '</head>',
          `<meta name="mobile-app" content="capacitor" />\n  </head>`
        );
    },
  };
}

export default defineConfig(({ mode }) => ({
  // Root is the parent project directory so we can resolve @/ imports
  root: path.resolve(__dirname, '..'),
  base: './', // Relative paths for Capacitor file:// protocol
  server: {
    host: '::',
    port: 8081, // Different port to avoid conflicts with web dev server
  },
  plugins: [
    injectMobilePlatform(),
    react(),
  ],
  // Explicitly use the mobile PostCSS config so Tailwind resolves
  // the parent's tailwind.config.ts (Vite's root is '..' so it would
  // otherwise pick up the parent's postcss.config.js which can't
  // resolve content paths when CWD is mobile-app/)
  css: {
    postcss: path.resolve(__dirname, 'postcss.config.js'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src'),
      '@mobile': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'www'),
    emptyOutDir: true,
    sourcemap: mode === 'development',
    minify: 'esbuild',
    target: 'es2020',
    // Keep console logs in mobile builds for on-device debugging.
    // Unlike the web build, mobile errors are invisible without logs.
    // Only strip 'debugger' statements.
    esbuild: {
      drop: ['debugger'],
    },
    rollupOptions: {
      input: path.resolve(__dirname, '../index.html'),
      output: {
        // Mobile-optimized chunking strategy.
        // Since assets are loaded from disk (not network), we prioritize
        // avoiding circular dependencies over small chunk sizes.
        // The previous split of vendor-core / vendor-ui caused a circular
        // dependency that crashed the app at startup.
        manualChunks: (id) => {
          // Single vendor chunk for React + UI framework to avoid circular deps.
          // React, Radix UI, Lucide, React Router, and TanStack Query all
          // share cross-references, so they MUST live in the same chunk.
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/') ||
            id.includes('react-router') ||
            id.includes('@tanstack/react-query') ||
            id.includes('@radix-ui/') ||
            id.includes('lucide-react') ||
            id.includes('react-hook-form') ||
            id.includes('zod') ||
            id.includes('@hookform/')
          ) {
            return 'vendor';
          }

          // Backend services (Supabase has no UI deps, safe to isolate)
          if (id.includes('@supabase/')) {
            return 'vendor-backend';
          }

          // Date utilities (standalone, no circular risk)
          if (id.includes('date-fns')) {
            return 'vendor-dates';
          }

          // Heavy optional features - let Rollup handle these naturally
          // They are lazy-loaded via dynamic import() so they won't
          // end up in the critical startup path.
          return undefined;
        },
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
    chunkSizeWarningLimit: 800, // More lenient for mobile (loaded from disk)
    reportCompressedSize: false,
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react-router-dom',
      '@tanstack/react-query',
      '@supabase/supabase-js',
      'lucide-react',
    ],
    exclude: [
      'react-leaflet',
      'leaflet',
      'recharts',
      'd3-scale',
      'd3-array',
      'd3-shape',
      'd3-interpolate',
    ],
  },
}));

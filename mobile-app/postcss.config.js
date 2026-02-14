/**
 * Mobile-specific PostCSS config
 *
 * This file ensures PostCSS finds the parent project's Tailwind config
 * when running the mobile build from the mobile-app/ directory.
 * Without this, Tailwind's content paths don't resolve and all
 * utility classes (bg-background, text-foreground, etc.) are missing.
 *
 * We use path.resolve to build an absolute path, avoiding cross-platform
 * issues with relative '../' resolution on Windows vs Unix.
 */
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  plugins: {
    tailwindcss: { config: path.resolve(__dirname, '..', 'tailwind.config.ts') },
    autoprefixer: {},
  },
};

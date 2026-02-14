/**
 * Mobile-specific PostCSS config
 *
 * This file ensures PostCSS finds the parent project's Tailwind config
 * when running the mobile build from the mobile-app/ directory.
 * Without this, Tailwind's content paths don't resolve and all
 * utility classes (bg-background, text-foreground, etc.) are missing.
 */
export default {
  plugins: {
    tailwindcss: { config: '../tailwind.config.ts' },
    autoprefixer: {},
  },
};

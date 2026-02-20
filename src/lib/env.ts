/**
 * Environment variable validation and typed access.
 * Import this module early (e.g., in main.tsx) to catch missing configuration at startup.
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('env');

interface EnvConfig {
  // Required
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
  // Optional with defaults
  VITE_SITE_URL: string;
  VITE_SENTRY_DSN: string;
  VITE_STRIPE_PUBLISHABLE_KEY: string;
}

function getRequired(key: string): string {
  const value = import.meta.env[key];
  if (!value) {
    const message = `Missing required environment variable: ${key}`;
    if (import.meta.env.PROD) {
      throw new Error(message);
    }
    log.error('validation', message);
    return '';
  }
  return value;
}

function getOptional(key: string, defaultValue = ''): string {
  const value = import.meta.env[key];
  if (!value) {
    if (import.meta.env.DEV && defaultValue === '') {
      log.warn('validation', `Optional env var ${key} is not set`);
    }
    return defaultValue;
  }
  return value;
}

export const env: EnvConfig = {
  VITE_SUPABASE_URL: getRequired('VITE_SUPABASE_URL'),
  VITE_SUPABASE_ANON_KEY: getRequired('VITE_SUPABASE_ANON_KEY'),
  VITE_SITE_URL: getOptional('VITE_SITE_URL', 'https://desmoinesinsider.com'),
  VITE_SENTRY_DSN: getOptional('VITE_SENTRY_DSN'),
  VITE_STRIPE_PUBLISHABLE_KEY: getOptional('VITE_STRIPE_PUBLISHABLE_KEY'),
};

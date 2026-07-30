import * as Sentry from '@sentry/react';

/**
 * Platform-wide Sentry DSN for Des Moines AI Pulse.
 *
 * Sentry DSNs are public by design — they ship in the client bundle of every
 * Sentry-instrumented web app and carry no secret (they only allow *sending*
 * events, not reading them). Baking it in means error reporting works out of
 * the box in production without depending on a Cloudflare Pages env var being
 * set. A `VITE_SENTRY_DSN` override still wins so previews/staging can route to
 * a different project.
 */
const DEFAULT_SENTRY_DSN =
  'https://e13095f68c27d2da0be781560b49daef@o4510398791352320.ingest.us.sentry.io/4511770313031680';

/**
 * Resolve the active DSN: explicit env override first, baked-in default second.
 */
export function getSentryDsn(): string {
  return (import.meta.env['VITE_SENTRY_DSN'] as string | undefined) || DEFAULT_SENTRY_DSN;
}

/**
 * Initialize Sentry error tracking. Uses the resolved DSN (env override or the
 * baked-in platform default). Events are only *sent* in production builds
 * (`enabled: import.meta.env.PROD`), so local dev stays quiet.
 */
export function initSentry(): void {
  const dsn = getSentryDsn();
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env['VITE_APP_VERSION'] as string | undefined,
    enabled: import.meta.env.PROD,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
  });
}

export { Sentry };

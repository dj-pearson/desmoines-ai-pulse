/**
 * The only part of @sentry/react the app uses, as named exports.
 *
 * src/lib/sentry.ts used to `await import('@sentry/react')` and keep the
 * namespace object. A namespace that escapes into a variable can be called
 * through any key, so Rollup has to keep every export, and the deferred chunk
 * carried session replay (rrweb), user feedback and browser tracing: 570 KB
 * raw, 187.9 KB gzipped, downloaded by every production visitor after idle.
 * None of those integrations was ever passed to init(), so none of them ran.
 *
 * Importing this module instead lets Rollup tree-shake to the three functions
 * below plus init()'s default integrations, which in @sentry/browser 10.x are
 * error-path only (global handlers, breadcrumbs, linked errors, dedupe, http
 * and culture context, browser session). No tracing, no replay.
 *
 * Add an export here before calling anything new on the loaded module from
 * sentry.ts; the type of that module is `typeof import('./sentryClient')`, so
 * a missing export is a type error rather than a runtime undefined.
 */
export { init, captureException, captureMessage } from '@sentry/react';

/**
 * Sentry, loaded AFTER first paint instead of in the entry chunk
 * (WEB-PERF-020 AC3).
 *
 * MEASURED, which is why this is worth the indirection. Breaking down the
 * production entry chunk by module on 2026-08-23:
 *     @sentry/core                253.3 KB rendered   20.4% of the entry
 *     @sentry/browser              59.0 KB              4.8%
 *     @sentry-internal/*           18.8 KB              1.5%
 *     @sentry/react                 7.2 KB              0.6%
 *                                 -----------------------------
 *                                 338.3 KB             27.3%
 * Error monitoring was the single largest thing on the critical path, ahead of
 * zod (10.5%) and dompurify (9.6%), and it is by definition not needed to draw
 * the first frame. The story's own arithmetic put the remaining gap to the
 * 200 KB budget at 79 KB against four vendor chunks totalling 130 KB, and said
 * no further modal-sized split would close it. This is not a modal-sized split.
 *
 * ERRORS BEFORE SENTRY LOADS ARE NOT LOST, which is the only reason deferring
 * is acceptable. A dependency-free listener is installed synchronously and
 * buffers whatever arrives; the buffer is replayed into Sentry the moment it is
 * ready. The change is WHEN an event is sent, not WHETHER. The alternative -
 * dropping the first second of errors - would trade a real signal for a
 * measurement, and boot is exactly when a broken deploy fails.
 *
 * The buffer is capped. An error loop before load would otherwise grow it
 * without bound, which is a memory leak in the code that exists to report
 * problems.
 */

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

type Level = 'info' | 'warning' | 'error';

interface PendingException {
  kind: 'exception';
  error: Error;
  options?: Record<string, unknown>;
}
interface PendingMessage {
  kind: 'message';
  message: string;
  level: Level;
}
type Pending = PendingException | PendingMessage;

const MAX_BUFFERED = 50;
const pending: Pending[] = [];

// The loaded module, once it arrives. `unknown` rather than a Sentry type so
// this file has no type-level dependency on the package either — a type-only
// import would be erased, but the import specifier is easy to promote to a
// value import by accident, which is how a deferred dependency creeps back
// onto the critical path.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sentry: any = null;
let loading: Promise<void> | null = null;

function buffer(entry: Pending) {
  if (pending.length >= MAX_BUFFERED) return;
  pending.push(entry);
}

/** Report an exception. Buffered until Sentry is loaded, then sent. */
export function captureException(error: Error, options?: Record<string, unknown>): void {
  if (sentry) {
    sentry.captureException(error, options);
    return;
  }
  buffer({ kind: 'exception', error, options });
}

/** Report a message. Buffered until Sentry is loaded, then sent. */
export function captureMessage(message: string, level: Level = 'error'): void {
  if (sentry) {
    sentry.captureMessage(message, level);
    return;
  }
  buffer({ kind: 'message', message, level });
}

function flush() {
  if (!sentry) return;
  while (pending.length > 0) {
    const entry = pending.shift() as Pending;
    if (entry.kind === 'exception') sentry.captureException(entry.error, entry.options);
    else sentry.captureMessage(entry.message, entry.level);
  }
}

/**
 * Catch anything thrown before Sentry arrives. Dependency-free and synchronous,
 * so it is in place from the first line of the entry chunk.
 *
 * These listeners stay installed after load. Sentry installs its own global
 * handlers, so a post-load error reaches it twice - once directly and once
 * through here - and Sentry's own deduplication is what makes that harmless.
 * Removing them instead would leave a window where neither is listening.
 */
function installEarlyCapture() {
  window.addEventListener('error', (event) => {
    if (sentry) return; // Sentry's own handler has it
    const err = event.error instanceof Error ? event.error : new Error(event.message || 'Unknown error');
    buffer({ kind: 'exception', error: err, options: { tags: { phase: 'pre-sentry' } } });
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (sentry) return;
    const reason = (event as PromiseRejectionEvent).reason;
    const err = reason instanceof Error ? reason : new Error(String(reason));
    buffer({ kind: 'exception', error: err, options: { tags: { phase: 'pre-sentry' } } });
  });
}

/**
 * Load and initialise Sentry. Exported so a caller that genuinely needs it
 * present - a test, or a surface that must report synchronously - can await it.
 */
export async function loadSentry(): Promise<void> {
  if (sentry) return;
  if (loading) return loading;

  loading = (async () => {
    try {
      const mod = await import('@sentry/react');
      mod.init({
        dsn: getSentryDsn(),
        environment: import.meta.env.MODE,
        release: import.meta.env['VITE_APP_VERSION'] as string | undefined,
        enabled: import.meta.env.PROD,
        tracesSampleRate: 0.1,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0.1,
      });
      sentry = mod;
      flush();
    } catch {
      // A failed chunk load must not take the app down. The buffer is left in
      // place; if a later call succeeds in loading, it still flushes.
      loading = null;
    }
  })();

  return loading;
}

/**
 * Install the early-capture listeners and schedule the real load.
 *
 * Called at module scope from main.tsx, exactly as the eager version was, so
 * the ordering guarantee callers relied on ("initialise before anything else")
 * still holds for the part that has to be synchronous.
 */
export function initSentry(): void {
  if (!getSentryDsn()) return;

  installEarlyCapture();

  // After first paint. requestIdleCallback with a timeout so a busy main thread
  // cannot postpone monitoring indefinitely; setTimeout where it is missing.
  const schedule = (fn: () => void) => {
    if ('requestIdleCallback' in window) {
      (window as Window & typeof globalThis).requestIdleCallback(fn, { timeout: 3000 });
    } else {
      setTimeout(fn, 1500);
    }
  };
  schedule(() => void loadSentry());
}

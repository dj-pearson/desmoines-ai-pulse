/**
 * Sentry, loaded off the critical path (WEB-PERF-020).
 *
 * WHY THIS FILE HAS NO STATIC `@sentry/react` IMPORT. It used to, and main.tsx
 * imports this module, so the whole SDK landed in the entry chunk and blocked
 * first paint. Measured on the 2026-08-19 build: @sentry/browser,
 * @sentry-internal/browser-utils and @sentry/react together accounted for
 * 123.4 KB gzipped of the entry chunk's module bytes - the single largest thing
 * on a critical path that is already 170 KB over the 200 KB budget in CLAUDE.md.
 * Error reporting is, by definition, not needed to render the first frame.
 *
 * WHAT REPLACES IT. `initSentry()` installs two cheap native listeners
 * immediately - 'error' and 'unhandledrejection' - so nothing that happens
 * during boot is lost, and schedules the real SDK for the first idle moment.
 * Anything captured before the SDK arrives is buffered and replayed into it on
 * load. An uncaught error also pulls the load forward rather than waiting for
 * idle, because at that point the SDK is the thing we most want.
 *
 * The buffer is bounded. A boot loop that throws on every frame must not turn
 * an error into a memory leak, and the 51st copy of the same stack tells you
 * nothing the first fifty did not.
 *
 * The public surface is captureException/captureMessage rather than a re-export
 * of the SDK namespace: re-exporting `Sentry` is what forced the eager import in
 * the first place, and any future `import { Sentry }` would silently undo this.
 */
import { createLogger } from '@/lib/logger';

const log = createLogger('sentry');

/**
 * Platform-wide Sentry DSN for Des Moines AI Pulse.
 *
 * Sentry DSNs are public by design - they ship in the client bundle of every
 * Sentry-instrumented web app and carry no secret (they only allow *sending*
 * events, not reading them). Baking it in means error reporting works out of
 * the box in production without depending on a Cloudflare Pages env var being
 * set. A `VITE_SENTRY_DSN` override still wins so previews/staging can route to
 * a different project.
 */
const DEFAULT_SENTRY_DSN =
  'https://e13095f68c27d2da0be781560b49daef@o4510398791352320.ingest.us.sentry.io/4511770313031680';

/** Resolve the active DSN: explicit env override first, baked-in default second. */
export function getSentryDsn(): string {
  return (import.meta.env['VITE_SENTRY_DSN'] as string | undefined) || DEFAULT_SENTRY_DSN;
}

type SentryModule = typeof import('@sentry/react');
type Level = 'info' | 'warning' | 'error';

interface CaptureContext {
  tags?: Record<string, string | undefined>;
  extra?: unknown;
}

type Buffered =
  | { kind: 'exception'; error: unknown; context?: CaptureContext }
  | { kind: 'message'; message: string; level: Level };

const MAX_BUFFERED = 50;

let sdk: SentryModule | null = null;
let loading: Promise<void> | null = null;
let buffered: Buffered[] = [];
let dropped = 0;

function buffer(item: Buffered): void {
  if (buffered.length >= MAX_BUFFERED) {
    dropped += 1;
    return;
  }
  buffered.push(item);
}

function flush(): void {
  if (!sdk) return;
  const queued = buffered;
  buffered = [];
  for (const item of queued) {
    if (item.kind === 'exception') {
      sdk.captureException(item.error, item.context);
    } else {
      sdk.captureMessage(item.message, item.level);
    }
  }
  if (dropped > 0) {
    sdk.captureMessage(`sentry: dropped ${dropped} event(s) buffered before the SDK loaded`, 'warning');
    dropped = 0;
  }
}

/**
 * Load and initialize the SDK. Idempotent, and safe to call from a hot path -
 * concurrent callers share the one in-flight promise.
 */
function load(): Promise<void> {
  if (sdk) return Promise.resolve();
  if (loading) return loading;

  loading = import('@sentry/react')
    .then((mod) => {
      mod.init({
        dsn: getSentryDsn(),
        environment: import.meta.env.MODE,
        release: import.meta.env['VITE_APP_VERSION'] as string | undefined,
        enabled: import.meta.env.PROD,
        tracesSampleRate: 0.1,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0.1,
      });
      sdk = mod;
      flush();
    })
    .catch((err) => {
      // A failed chunk fetch must not break the page. Reset so a later error
      // can retry, and keep buffering in the meantime.
      loading = null;
      log.warn('load', 'Sentry SDK failed to load; error reporting is degraded', { error: String(err) });
    });

  return loading;
}

/** Report an exception. Buffered if the SDK has not loaded yet. */
export function captureException(error: unknown, context?: CaptureContext): void {
  if (sdk) {
    sdk.captureException(error, context);
    return;
  }
  buffer({ kind: 'exception', error, context });
  void load(); // a real error is reason enough to stop waiting for idle
}

/** Report a message. Buffered if the SDK has not loaded yet. */
export function captureMessage(message: string, level: Level = 'info'): void {
  if (sdk) {
    sdk.captureMessage(message, level);
    return;
  }
  buffer({ kind: 'message', message, level });
}

function onWindowError(event: ErrorEvent): void {
  captureException(event.error ?? new Error(event.message), {
    tags: { component: 'window', action: 'error' },
  });
}

function onUnhandledRejection(event: PromiseRejectionEvent): void {
  captureException(event.reason ?? new Error('Unhandled promise rejection'), {
    tags: { component: 'window', action: 'unhandledrejection' },
  });
}

/**
 * Install the early listeners and schedule the SDK for the first idle moment.
 * Call once, as early as possible.
 */
export function initSentry(): void {
  if (!getSentryDsn()) return;
  if (typeof window === 'undefined') return;

  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  const schedule = (fn: () => void) => {
    if ('requestIdleCallback' in window) {
      (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number })
        .requestIdleCallback(fn, { timeout: 10_000 });
    } else {
      window.setTimeout(fn, 4_000);
    }
  };

  schedule(() => void load());
}

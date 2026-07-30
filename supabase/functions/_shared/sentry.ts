/**
 * sentry — best-effort server-side error reporting for edge functions.
 *
 * Routes uncaught edge-function errors to the same Sentry project as the web
 * client so the whole platform reports to one place. It is intentionally:
 *
 *   • Lazy      — the SDK is dynamically imported on first capture, so cold
 *                 starts that never error pay nothing and a failed import can't
 *                 break module load for the 70+ functions that pull this in.
 *   • Guarded   — every path is wrapped in try/catch. A Sentry hiccup (bad DSN,
 *                 network failure, SDK resolve error) degrades to a no-op; it
 *                 NEVER throws and NEVER alters a function's response.
 *   • Silent    — disabled automatically when no DSN is resolvable.
 *
 * DSN resolution: `SENTRY_DSN` secret first, then the baked-in platform default
 * (Sentry DSNs are non-secret — they only permit sending events). Set an
 * override per-environment with `supabase secrets set SENTRY_DSN=...`.
 */

const DEFAULT_SENTRY_DSN =
  "https://e13095f68c27d2da0be781560b49daef@o4510398791352320.ingest.us.sentry.io/4511770313031680";

// deno-lint-ignore no-explicit-any
type SentryModule = any;

let sentry: SentryModule | null = null;
let initialized = false;
let initFailed = false;

function resolveDsn(): string | null {
  try {
    return Deno.env.get("SENTRY_DSN") || DEFAULT_SENTRY_DSN || null;
  } catch {
    return DEFAULT_SENTRY_DSN || null;
  }
}

/** Lazily import + init the Sentry Deno SDK. Returns the module or null. */
async function ensureSentry(): Promise<SentryModule | null> {
  if (initialized) return sentry;
  if (initFailed) return null;
  try {
    const dsn = resolveDsn();
    if (!dsn) {
      initFailed = true;
      return null;
    }
    const mod = await import("https://esm.sh/@sentry/deno@10?target=deno");
    mod.init({
      dsn,
      environment: (() => {
        try {
          return Deno.env.get("ENVIRONMENT") ?? "production";
        } catch {
          return "production";
        }
      })(),
      // Errors only — no performance tracing overhead on the edge.
      tracesSampleRate: 0,
    });
    sentry = mod;
    initialized = true;
    return sentry;
  } catch {
    // SDK unavailable (offline deploy, resolve failure, etc.) — stay a no-op.
    initFailed = true;
    return null;
  }
}

/**
 * Capture an exception. Best-effort and awaitable: callers on an error path may
 * `await` it to flush before the isolate is frozen, or fire-and-forget it. It
 * resolves (never rejects) regardless of Sentry's state.
 */
export async function captureEdgeException(
  error: unknown,
  tags: Record<string, string> = {},
): Promise<void> {
  try {
    const mod = await ensureSentry();
    if (!mod) return;
    const err = error instanceof Error ? error : new Error(String(error));
    mod.captureException(err, { tags });
    // Give the event a short window to leave the isolate.
    if (typeof mod.flush === "function") {
      await mod.flush(2000);
    }
  } catch {
    // Never let error reporting cause an error.
  }
}

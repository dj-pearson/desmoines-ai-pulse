/**
 * fetch() with a hard timeout (WEB-BE-001).
 *
 * ~34 edge functions call external upstreams (Claude, OpenAI, Resend, Google)
 * with a bare fetch() and no AbortSignal, so a hung upstream ties up the whole
 * function invocation — burning cost and latency until the platform kills it.
 *
 * This wrapper aborts the request after `timeoutMs` (default 30s) using
 * AbortSignal.timeout, and composes cleanly with a caller-supplied signal.
 * On timeout it throws a FetchTimeoutError the caller can branch on to return
 * a clean retry/error path instead of crashing.
 */

/** Default upstream timeout: generous enough for slow LLM calls, bounded. */
export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

export class FetchTimeoutError extends Error {
  readonly url: string;
  readonly timeoutMs: number;
  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = 'FetchTimeoutError';
    this.url = url;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Like fetch(), but aborts after `timeoutMs`. If `init.signal` is provided, the
 * request aborts when EITHER that signal fires or the timeout elapses.
 * Re-throws a {@link FetchTimeoutError} on timeout; other fetch errors pass
 * through unchanged.
 */
export async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  // Compose with any caller signal so both can abort the request.
  const signal = init.signal
    ? anySignal([init.signal, timeoutSignal])
    : timeoutSignal;

  try {
    return await fetch(input, { ...init, signal });
  } catch (err) {
    // AbortSignal.timeout aborts with a TimeoutError DOMException.
    if (
      timeoutSignal.aborted &&
      (err instanceof DOMException ? err.name === 'TimeoutError' || err.name === 'AbortError' : true)
    ) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      throw new FetchTimeoutError(url, timeoutMs);
    }
    throw err;
  }
}

/**
 * Combine multiple AbortSignals into one that aborts as soon as any input does.
 * Uses the native AbortSignal.any when available, else falls back to listeners.
 */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const anyFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === 'function') return anyFn(signals);

  const controller = new AbortController();
  const onAbort = (s: AbortSignal) => () => controller.abort(s.reason);
  for (const s of signals) {
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    s.addEventListener('abort', onAbort(s), { once: true });
  }
  return controller.signal;
}

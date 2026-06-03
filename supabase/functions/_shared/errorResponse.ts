/**
 * Shared edge-function error response (PROD-SEC-011) + structured error log
 * (down-payment on PROD-OPS-004).
 *
 * Many functions returned `error.message` (or `details: error.message`) straight
 * to the client, leaking internal detail (Postgres/FK names, schema, stack
 * fragments). Use this in catch blocks instead: it logs the FULL error
 * server-side as structured JSON with a request id, and returns only a generic
 * message + that id to the caller (so support can correlate without exposure).
 */

export function newRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}

interface ErrorResponseOptions {
  /** HTTP status to return (default 500). */
  status?: number;
  /** Safe, user-facing message (default generic). */
  publicMessage?: string;
  /** Reuse an existing request id (else one is generated). */
  requestId?: string;
  /** Function name for the log line. */
  fn?: string;
}

export function errorResponse(
  error: unknown,
  corsHeaders: Record<string, string>,
  opts: ErrorResponseOptions = {},
): Response {
  const requestId = opts.requestId ?? newRequestId();
  const status = opts.status ?? 500;
  const publicMessage =
    opts.publicMessage ?? 'An unexpected error occurred. Please try again.';

  // Full detail stays server-side only.
  console.error(
    JSON.stringify({
      level: 'error',
      fn: opts.fn,
      requestId,
      status,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
  );

  return new Response(
    JSON.stringify({ error: publicMessage, requestId }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

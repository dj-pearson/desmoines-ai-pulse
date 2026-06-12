/**
 * Shared error responder — return a GENERIC message to clients while logging
 * the full detail server-side. Prevents leaking stack traces, table names,
 * internal IDs or driver messages to callers (WEB-SEC-007).
 *
 * Status codes are caller-controlled so existing clients that branch on a
 * status keep working (backward compat).
 */

export interface ErrorResponseOptions {
  /** HTTP status to return (default 500). */
  status?: number;
  /** Generic, safe message shown to the client. */
  clientMessage?: string;
  /** Stable machine code clients may switch on (optional). */
  code?: string;
  /** CORS / extra headers to merge in. */
  headers?: Record<string, string>;
  /** Context label for the server log (e.g. function name + action). */
  logContext?: string;
}

const GENERIC_MESSAGE = 'Something went wrong. Please try again later.';

/**
 * Log the real error server-side, return a sanitized JSON Response.
 *
 * @param error    the caught error (logged in full, never returned)
 * @param options  status / client-safe message / headers
 */
export function errorResponse(error: unknown, options: ErrorResponseOptions = {}): Response {
  const {
    status = 500,
    clientMessage = GENERIC_MESSAGE,
    code,
    headers = {},
    logContext = 'edge-function',
  } = options;

  // Full detail to server logs only.
  const detail = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  console.error(`[${logContext}] ${detail}`);

  const body: Record<string, unknown> = { error: clientMessage };
  if (code) body.code = code;

  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/**
 * What kind of caller is this - a machine or a person? (WEB-BE-047)
 *
 * WHY IT NEEDED A NAME. Three places in apiKeyAuth.ts answered this question
 * inline, each with its own timing-safe comparison, and nothing else could ask
 * it at all. So firecrawl-scraper rate-limited its own orchestrator: it allows
 * 10 requests per 15 minutes keyed by client IP, scrape-events invokes it once
 * per scraping job from a single egress address, and the 15 seeded jobs share
 * one budget. The limit exists to stop a stranger burning Firecrawl credits;
 * what it actually throttles is the cron that ingests the site's events.
 *
 * WHY EXEMPTING A MACHINE CALLER COSTS NOTHING. Both credentials that qualify -
 * EDGE_FUNCTION_API_KEY and SUPABASE_SERVICE_ROLE_KEY - already authorise the
 * full function surface, and the service-role key authorises the whole database
 * besides. Rate-limiting a caller that holds one protects nothing: anyone who
 * has it can do the damage directly. The limit is for the anonymous and
 * user-authenticated paths, and it stays there.
 *
 * PURE ON PURPOSE. The comparisons take the expected secrets as arguments
 * rather than reading Deno.env, so the classification can be tested without a
 * key, an environment or a network. apiKeyAuth.ts, which imports supabase-js
 * from esm.sh, cannot be imported by a test at all.
 */

/**
 * Timing-safe string comparison. Lives here rather than in apiKeyAuth.ts so
 * that a module with no remote imports owns it; apiKeyAuth re-exports it for
 * the callers that already import it from there.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export type CallerKind =
  /** Presented EDGE_FUNCTION_API_KEY. Cron, CI, the hub. */
  | "api_key"
  /** Presented SUPABASE_SERVICE_ROLE_KEY. pg_cron and other server-to-server callers. */
  | "service_role"
  /** Presented some other bearer token - a user JWT, verified elsewhere. */
  | "bearer"
  /** Presented nothing. */
  | "anonymous";

export interface PresentedCredentials {
  /** X-API-Key header value, if any. */
  apiKeyHeader?: string | null;
  /** The token from `Authorization: Bearer <token>`, if any. */
  bearer?: string | null;
}

export interface ExpectedSecrets {
  apiKey?: string | null;
  serviceRoleKey?: string | null;
}

/**
 * Classify a caller from what it presented.
 *
 * An UNSET expected secret never matches. Without that, a function deployed
 * without EDGE_FUNCTION_API_KEY would classify every caller presenting an
 * empty header as internal - which is every caller.
 */
export function classifyCaller(
  presented: PresentedCredentials,
  expected: ExpectedSecrets,
): CallerKind {
  const apiKeyHeader = presented.apiKeyHeader ?? "";
  const bearer = presented.bearer ?? "";
  const expectedApiKey = expected.apiKey ?? "";
  const expectedServiceRole = expected.serviceRoleKey ?? "";

  if (expectedApiKey) {
    if (apiKeyHeader && timingSafeEqual(apiKeyHeader, expectedApiKey)) return "api_key";
    if (bearer && timingSafeEqual(bearer, expectedApiKey)) return "api_key";
  }
  if (expectedServiceRole && bearer && timingSafeEqual(bearer, expectedServiceRole)) {
    return "service_role";
  }
  if (bearer) return "bearer";
  return "anonymous";
}

/** Did this caller present a credential that already authorises the whole surface? */
export function isMachineCaller(kind: CallerKind): boolean {
  return kind === "api_key" || kind === "service_role";
}

/** Pull the credentials a request presents. Header parsing only; no secrets read. */
export function presentedCredentials(req: Request): PresentedCredentials {
  const authHeader = req.headers.get("Authorization") || "";
  const [scheme, token] = authHeader.split(" ");
  return {
    apiKeyHeader: req.headers.get("X-API-Key") || req.headers.get("x-api-key"),
    bearer: scheme?.toLowerCase() === "bearer" ? token : "",
  };
}

/** The expected secrets, from the environment. The only impure function here. */
export function expectedSecrets(): ExpectedSecrets {
  return {
    apiKey: Deno.env.get("EDGE_FUNCTION_API_KEY"),
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

/** Convenience: is this request from cron, CI, the hub or another function? */
export function isInternalRequest(req: Request): boolean {
  return isMachineCaller(classifyCaller(presentedCredentials(req), expectedSecrets()));
}

/**
 * Claim checks for the OIDC token Google Pub/Sub attaches to a push request.
 *
 * WEB-SEC-057. A valid Google signature, a Google issuer and our audience do
 * NOT identify Pub/Sub. Any Google account or GCP service account can mint an
 * ID token for any audience it likes (`gcloud auth print-identity-token
 * --audiences=<url>`), and the audience here is the function's public URL. So
 * a token that passes those three checks proves only "some Google identity
 * asked for a token for this URL". What proves the push came from our
 * subscription is the `email` claim: it is the service account configured on
 * the push subscription, and Google's push-auth docs say to compare it.
 *
 * Pure so it can be tested without a network or a signing key; the signature
 * itself is verified by the caller before these claims are trusted.
 */

export interface PubSubOidcClaims {
  iss?: unknown;
  aud?: unknown;
  sub?: unknown;
  email?: unknown;
  email_verified?: unknown;
  exp?: unknown;
  iat?: unknown;
}

export interface PubSubOidcExpectations {
  /** The audience configured on the push subscription (this function's URL). */
  audience: string;
  /** The service account the push subscription authenticates as. */
  serviceAccountEmail: string;
  /** Current time in epoch seconds. */
  nowSec: number;
}

export const GOOGLE_OIDC_ISSUERS: ReadonlySet<string> = new Set([
  'https://accounts.google.com',
  'accounts.google.com',
]);

/** Clock skew tolerated on exp (past) and iat (future), in seconds. */
const EXP_SKEW_SEC = 60;
const IAT_SKEW_SEC = 300;

/**
 * Returns null when the claims identify a push from the expected subscription,
 * otherwise a short reason (for the log, never the response body).
 */
export function checkPubSubOidcClaims(
  claims: PubSubOidcClaims,
  expected: PubSubOidcExpectations,
): string | null {
  const wantEmail = expected.serviceAccountEmail.trim().toLowerCase();
  if (!wantEmail) return 'no expected service account configured';
  if (!expected.audience) return 'no expected audience configured';

  if (typeof claims.iss !== 'string' || !GOOGLE_OIDC_ISSUERS.has(claims.iss)) {
    return `unexpected issuer: ${String(claims.iss)}`;
  }
  if (claims.aud !== expected.audience) {
    return `audience mismatch: got ${String(claims.aud)}`;
  }
  if (typeof claims.exp !== 'number' || claims.exp < expected.nowSec - EXP_SKEW_SEC) {
    return 'token expired';
  }
  if (typeof claims.iat !== 'number' || claims.iat > expected.nowSec + IAT_SKEW_SEC) {
    return 'issued-at is in the future';
  }
  // Strictly true: a string "true" or a missing claim is not verification.
  if (claims.email_verified !== true) {
    return 'email not verified';
  }
  if (typeof claims.email !== 'string' || claims.email.toLowerCase() !== wantEmail) {
    return `unexpected service account: ${String(claims.email)}`;
  }
  return null;
}

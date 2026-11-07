import { assert, assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { checkPubSubOidcClaims, type PubSubOidcClaims } from "./pubsubOidc.ts";

// WEB-SEC-057. play-rtdn-webhook accepted any Google-signed token whose
// issuer and audience matched. Any Google identity can mint that token, so
// the service account is the check that identifies our push subscription.

const NOW = 1_800_000_000;
const AUDIENCE = "https://example.supabase.co/functions/v1/play-rtdn-webhook";
const PUSH_SA = "rtdn-push@example-project.iam.gserviceaccount.com";
const expected = { audience: AUDIENCE, serviceAccountEmail: PUSH_SA, nowSec: NOW };

const pushClaims = (over: Partial<PubSubOidcClaims> = {}): PubSubOidcClaims => ({
  iss: "https://accounts.google.com",
  aud: AUDIENCE,
  sub: "112233445566778899",
  email: PUSH_SA,
  email_verified: true,
  exp: NOW + 3600,
  iat: NOW - 10,
  ...over,
});

Deno.test("a token from the push subscription's service account passes", () => {
  assertEquals(checkPubSubOidcClaims(pushClaims(), expected), null);
  // Both issuer spellings Google documents.
  assertEquals(checkPubSubOidcClaims(pushClaims({ iss: "accounts.google.com" }), expected), null);
  // Email comparison ignores case; the configured value may carry whitespace.
  assertEquals(checkPubSubOidcClaims(pushClaims({ email: PUSH_SA.toUpperCase() }), expected), null);
  assertEquals(
    checkPubSubOidcClaims(pushClaims(), { ...expected, serviceAccountEmail: `  ${PUSH_SA}\n` }),
    null,
  );
});

Deno.test("the forged case: right issuer and audience, someone else's service account", () => {
  // What `gcloud auth print-identity-token --audiences=<url>` yields for an
  // attacker's own service account. Before WEB-SEC-057 this passed.
  const forged = pushClaims({ email: "attacker@evil-project.iam.gserviceaccount.com" });
  const reason = checkPubSubOidcClaims(forged, expected);
  assert(reason?.startsWith("unexpected service account"), `got ${reason}`);
  // A personal Google account, too.
  assert(checkPubSubOidcClaims(pushClaims({ email: "someone@gmail.com" }), expected) !== null);
});

Deno.test("no email claim, or an unverified one, is refused", () => {
  assert(checkPubSubOidcClaims(pushClaims({ email: undefined }), expected) !== null);
  assertEquals(checkPubSubOidcClaims(pushClaims({ email_verified: false }), expected), "email not verified");
  assertEquals(checkPubSubOidcClaims(pushClaims({ email_verified: "true" }), expected), "email not verified");
  assertEquals(checkPubSubOidcClaims(pushClaims({ email_verified: undefined }), expected), "email not verified");
});

Deno.test("an empty expected service account refuses everything rather than matching an empty email", () => {
  for (const sa of ["", "   "]) {
    const reason = checkPubSubOidcClaims(pushClaims({ email: sa }), { ...expected, serviceAccountEmail: sa });
    assertEquals(reason, "no expected service account configured");
  }
  assertEquals(
    checkPubSubOidcClaims(pushClaims({ aud: "" }), { ...expected, audience: "" }),
    "no expected audience configured",
  );
});

Deno.test("the checks that existed before still hold", () => {
  assert(checkPubSubOidcClaims(pushClaims({ iss: "https://evil.example" }), expected)?.startsWith("unexpected issuer"));
  assert(checkPubSubOidcClaims(pushClaims({ iss: undefined }), expected)?.startsWith("unexpected issuer"));
  assert(checkPubSubOidcClaims(pushClaims({ aud: `${AUDIENCE}/` }), expected)?.startsWith("audience mismatch"));
  assert(checkPubSubOidcClaims(pushClaims({ aud: [AUDIENCE] }), expected)?.startsWith("audience mismatch"));
  assertEquals(checkPubSubOidcClaims(pushClaims({ exp: NOW - 61 }), expected), "token expired");
  assertEquals(checkPubSubOidcClaims(pushClaims({ exp: NOW - 60 }), expected), null);
  assertEquals(checkPubSubOidcClaims(pushClaims({ exp: String(NOW + 10) }), expected), "token expired");
  assertEquals(checkPubSubOidcClaims(pushClaims({ iat: NOW + 301 }), expected), "issued-at is in the future");
  assertEquals(checkPubSubOidcClaims(pushClaims({ iat: undefined }), expected), "issued-at is in the future");
});

Deno.test("play-rtdn-webhook reads PLAY_RTDN_SERVICE_ACCOUNT and runs the claim check", async () => {
  const src = await Deno.readTextFile(new URL("../play-rtdn-webhook/index.ts", import.meta.url));
  assert(src.includes("Deno.env.get('PLAY_RTDN_SERVICE_ACCOUNT')"), "webhook does not read PLAY_RTDN_SERVICE_ACCOUNT");
  assert(/checkPubSubOidcClaims\(claims,/.test(src), "webhook does not run checkPubSubOidcClaims on the token claims");
  // The unset case must refuse before verification, not skip the check.
  const envAt = src.indexOf("Deno.env.get('PLAY_RTDN_SERVICE_ACCOUNT')");
  const verifyAt = src.indexOf("await verifyOidcToken(");
  assert(envAt > 0 && verifyAt > envAt, "service account must be resolved before the token is verified");
  assert(/await verifyOidcToken\(.*, expectedServiceAccount\);/.test(src), "verifyOidcToken is not given the service account");
  // The old inline issuer/audience checks must not survive as a second,
  // weaker path that someone could call instead.
  assert(!src.includes("GOOGLE_OIDC_ISSUERS"), "webhook still carries its own issuer check");
});

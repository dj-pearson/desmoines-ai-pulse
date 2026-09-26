/**
 * SNS signature verification and SES bounce/complaint decisions.
 *
 * fixtures/sns-signed.json holds messages signed with a throwaway key made for
 * this test; only its self-signed certificate is committed. The string to sign
 * was built by a separate implementation of the SNS spec, so a pass means
 * snsStringToSign agrees with it, and the RSA verify is real.
 *
 *   deno test --allow-read supabase/functions/_shared/sesEvents.test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  decideSesEvent,
  isAllowedCertUrl,
  isAllowedSnsUrl,
  parseSnsEnvelope,
  type SnsEnvelope,
  verifySnsMessage,
} from "./sesEvents.ts";

const fx = JSON.parse(await Deno.readTextFile(new URL("./fixtures/sns-signed.json", import.meta.url)));
const TOPIC = "arn:aws:sns:us-east-2:123456789012:dmi-ses-events";

function certFetcher() {
  const fetched: string[] = [];
  const fetchCert = (url: string) => {
    fetched.push(url);
    return Promise.resolve(fx.certPem as string);
  };
  return { fetchCert, fetched };
}

Deno.test("a signed SignatureVersion 2 notification verifies", async () => {
  const env = parseSnsEnvelope(fx.notificationV2)!;
  const { fetchCert, fetched } = certFetcher();
  assertEquals(await verifySnsMessage(env, { allowedTopics: TOPIC, fetchCert }), { ok: true });
  assertEquals(fetched, ["https://sns.us-east-2.amazonaws.com/SimpleNotificationService-test.pem"]);
});

Deno.test("SignatureVersion 1 (SHA-1) with a Subject, and a SubscriptionConfirmation, verify", async () => {
  const { fetchCert } = certFetcher();
  assertEquals(await verifySnsMessage(parseSnsEnvelope(fx.notificationV1)!, { allowedTopics: TOPIC, fetchCert }), { ok: true });
  assertEquals(await verifySnsMessage(parseSnsEnvelope(fx.subscriptionConfirmation)!, { allowedTopics: TOPIC, fetchCert }), { ok: true });
});

Deno.test("a changed message fails verification", async () => {
  const env = { ...parseSnsEnvelope(fx.notificationV2)!, Message: fx.notificationV2.Message.replace("Gone@", "Someone@") } as SnsEnvelope;
  const { fetchCert } = certFetcher();
  const r = await verifySnsMessage(env, { allowedTopics: TOPIC, fetchCert });
  assertEquals(r.ok, false);
});

Deno.test("another account's topic is refused before any certificate is fetched", async () => {
  const { fetchCert, fetched } = certFetcher();
  const env = parseSnsEnvelope(fx.notificationV2)!;
  assertEquals((await verifySnsMessage(env, { allowedTopics: "arn:aws:sns:us-east-2:999999999999:other", fetchCert })).ok, false);
  assertEquals((await verifySnsMessage(env, { allowedTopics: undefined, fetchCert })).ok, false, "no topic configured refuses everything");
  assertEquals(fetched.length, 0);
});

Deno.test("certificate URL: exactly sns.<topic region>.amazonaws.com over https", async () => {
  const ok = "https://sns.us-east-2.amazonaws.com/SimpleNotificationService-x.pem";
  assert(isAllowedCertUrl(ok, "us-east-2"));
  for (const bad of [
    "http://sns.us-east-2.amazonaws.com/x.pem",
    "https://sns.us-east-1.amazonaws.com/x.pem", // other region than the topic
    "https://sns.us-east-2.amazonaws.com.evil.example/x.pem",
    "https://evil.example/sns.us-east-2.amazonaws.com/x.pem",
    "https://sns.us-east-2.amazonaws.com:8443/x.pem",
    "https://user@sns.us-east-2.amazonaws.com/x.pem",
    "https://sns.us-east-2.amazonaws.com/x.txt",
  ]) {
    assertEquals(isAllowedCertUrl(bad, "us-east-2"), false, bad);
  }
  assertEquals(isAllowedSnsUrl(ok, null), false);
  const { fetchCert, fetched } = certFetcher();
  const env = { ...parseSnsEnvelope(fx.notificationV2)!, SigningCertURL: "https://evil.example/c.pem" } as SnsEnvelope;
  assertEquals((await verifySnsMessage(env, { allowedTopics: TOPIC, fetchCert })).ok, false);
  assertEquals(fetched.length, 0, "a disallowed URL is never fetched");
});

Deno.test("envelope parsing rejects junk", () => {
  assertEquals(parseSnsEnvelope(null), null);
  assertEquals(parseSnsEnvelope({ Type: "Notification" }), null);
  assertEquals(parseSnsEnvelope({ ...fx.subscriptionConfirmation, SubscribeURL: undefined }), null);
});

Deno.test("permanent bounce suppresses the lowercased address and marks the log bounced", () => {
  const d = decideSesEvent(JSON.parse(fx.notificationV2.Message));
  assertEquals(d, { messageId: "0100019a-abc", logStatus: "bounced", suppress: [{ email: "gone@example.com", reason: "bounce" }], kind: "Bounce/Permanent" });
});

Deno.test("transient bounce suppresses nobody", () => {
  const d = decideSesEvent({ eventType: "Bounce", bounce: { bounceType: "Transient", bouncedRecipients: [{ emailAddress: "a@b.c" }] }, mail: { messageId: "m" } });
  assertEquals(d.suppress, []);
  assertEquals(d.logStatus, null);
});

Deno.test("complaint suppresses; identity-notification shape is understood; delivery only updates the log", () => {
  const c = decideSesEvent({ notificationType: "Complaint", complaint: { complainedRecipients: [{ emailAddress: "X@Y.z" }] }, mail: { messageId: "m2" } });
  assertEquals(c.suppress, [{ email: "x@y.z", reason: "complaint" }]);
  assertEquals(c.logStatus, "complained");
  const d = decideSesEvent({ eventType: "Delivery", delivery: { recipients: ["a@b.c"] }, mail: { messageId: "m3" } });
  assertEquals([d.logStatus, d.suppress.length, d.messageId], ["delivered", 0, "m3"]);
  assertEquals(decideSesEvent({ eventType: "Open", mail: {} }).logStatus, null);
});

/**
 * SigV4 against the AWS published test suite (aws-sig-v4-test-suite) and the
 * signing-key example in the IAM user guide. Every expected value below is
 * copied from AWS, not produced by this code, so a pass means the signer agrees
 * with AWS rather than with itself.
 *
 *   deno test supabase/functions/_shared/awsSigV4.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildCanonicalRequest,
  buildStringToSign,
  credentialScope,
  deriveSigningKey,
  signRequest,
} from "./awsSigV4.ts";

const credentials = {
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
};
const now = new Date("2015-08-30T12:36:00Z");
const opts = { region: "us-east-1", service: "service", credentials, now };

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

Deno.test("get-vanilla: canonical request, string to sign and signature match AWS", async () => {
  const req = { method: "GET", url: "https://example.amazonaws.com/" };
  const { canonicalRequest } = await buildCanonicalRequest(req, "20150830T123600Z");
  assertEquals(
    canonicalRequest,
    [
      "GET",
      "/",
      "",
      "host:example.amazonaws.com",
      "x-amz-date:20150830T123600Z",
      "",
      "host;x-amz-date",
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ].join("\n"),
  );
  const sts = await buildStringToSign(canonicalRequest, "20150830T123600Z", credentialScope("20150830T123600Z", "us-east-1", "service"));
  assertEquals(
    sts,
    "AWS4-HMAC-SHA256\n20150830T123600Z\n20150830/us-east-1/service/aws4_request\nbb579772317eb040ac9ed261061d46c1f17a8133879d6129b6e1c25292927e63",
  );
  const signed = await signRequest(req, opts);
  assertEquals(
    signed.authorization,
    "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
  );
  assertEquals(signed["x-amz-date"], "20150830T123600Z");
});

Deno.test("post-vanilla: POST with an empty body", async () => {
  const signed = await signRequest({ method: "POST", url: "https://example.amazonaws.com/" }, opts);
  assertEquals(
    signed.authorization,
    "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5da7c1a2acd57cee7505fc6676e4e544621c30862966e37dddb68e92efbe5d6b",
  );
});

Deno.test("get-vanilla-query-order-key-case: query parameters are sorted by key", async () => {
  const signed = await signRequest({ method: "GET", url: "https://example.amazonaws.com/?Param2=value2&Param1=value1" }, opts);
  assertEquals(
    signed.authorization,
    "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500",
  );
});

Deno.test("IAM user guide: derived signing key for 20120215/us-east-1/iam", async () => {
  const key = await deriveSigningKey(credentials.secretAccessKey, "20120215", "us-east-1", "iam");
  assertEquals(hex(key), "f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d");
});

Deno.test("a signed body changes the signature and header names are lowercased", async () => {
  const a = await signRequest({ method: "POST", url: "https://email.us-east-1.amazonaws.com/v2/email/outbound-emails", headers: { "Content-Type": "application/json" }, body: "{}" }, opts);
  const b = await signRequest({ method: "POST", url: "https://email.us-east-1.amazonaws.com/v2/email/outbound-emails", headers: { "Content-Type": "application/json" }, body: "{ }" }, opts);
  assertEquals(a["content-type"], "application/json");
  assertEquals(a.host, "email.us-east-1.amazonaws.com");
  assertEquals(a.authorization.includes("SignedHeaders=content-type;host;x-amz-date"), true);
  assertEquals(a.authorization === b.authorization, false);
});

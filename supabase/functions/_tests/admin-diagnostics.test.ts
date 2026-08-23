import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

/**
 * XPLAT-008 - the two admin diagnostics that had no implementation.
 *
 * Both call live external services, so what is asserted is the shape of the
 * handler rather than a response: that they are gated, that the webhook one
 * cannot be turned into a server-side request forgery, and that the failure
 * paths return the PROVIDER's message rather than a generic one - which is the
 * entire reason an admin presses either button.
 */

const aiModel = await Deno.readTextFile(
  new URL("../test-ai-model/index.ts", import.meta.url),
);
const webhook = await Deno.readTextFile(
  new URL("../test-article-webhook/index.ts", import.meta.url),
);

Deno.test("both diagnostics are admin-gated", () => {
  // test-ai-model spends model credits per press; an open version is a billable
  // denial-of-wallet.
  for (const [name, src] of [["test-ai-model", aiModel], ["test-article-webhook", webhook]]) {
    assert(src.includes("requireAdminOrApiKey"), `${name} must be gated`);
    assert(
      src.indexOf("requireAdminOrApiKey") < src.indexOf("await req.json()"),
      `${name} must authorize before parsing a body`,
    );
  }
});

Deno.test("the webhook test refuses an unsafe URL before sending anything", () => {
  // This function POSTs to a URL the caller supplies. Without the guard an admin
  // session reaches the project's own internal endpoints from inside the network.
  assert(webhook.includes("validateURLForSSRF"));
  assert(webhook.includes("blockPrivateIPs: true"));
  assert(
    webhook.indexOf("validateURLForSSRF") < webhook.indexOf("fetchWithTimeout("),
    "the guard has to run before the request, not alongside it",
  );
});

Deno.test("the webhook test allows https only", () => {
  // A webhook carries article content to a third party and this runs
  // server-side, where a plaintext hop is invisible to whoever configured it.
  assert(webhook.includes('allowedProtocols: ["https:"]'));
});

Deno.test("the webhook payload announces itself as a test", () => {
  // A live Make.com scenario has to be able to branch on this rather than
  // publishing a fake article.
  assert(webhook.includes("test: true"));
});

Deno.test("failures return the provider's own message", () => {
  // "model not found" and "credit balance too low" both arrive as a non-2xx and
  // mean entirely different things to whoever pressed the button.
  assert(aiModel.includes("payload?.error?.message"));
  assert(webhook.includes("response.status"));
});

Deno.test("a missing API key is distinguishable from a rejected call", () => {
  // Different problems, fixed in different places.
  assert(aiModel.includes("No Anthropic API key is configured"));
});

Deno.test("both bound how long they wait", () => {
  // Without a timeout a hung provider holds the edge function until the
  // platform kills it, and the admin sees nothing at all.
  assertEquals(aiModel.includes("TIMEOUT_MS"), true);
  assertEquals(webhook.includes("TIMEOUT_MS"), true);
});

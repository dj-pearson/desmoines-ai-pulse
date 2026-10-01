import { strict as assert } from "node:assert";
import { decideNotification } from "../send-campaign-notification/decision.ts";

const ADVERTISER = "user-advertiser";
const OTHER = "user-someone-else";
const ADMIN = "user-admin";
const CAMPAIGN = "camp-1";

const base = {
  hasAuthHeader: true,
  userId: ADVERTISER,
  isAdmin: false,
  campaignOwnerId: ADVERTISER,
  notificationType: "creative_uploaded",
  campaignId: CAMPAIGN,
};

Deno.test("an unauthenticated call cannot notify", () => {
  assert.equal(
    decideNotification({ ...base, hasAuthHeader: false }).kind,
    "unauthenticated",
  );
  // A header that resolves to no user is the same answer. Both matter: the
  // second is what a forged or expired token looks like.
  assert.equal(decideNotification({ ...base, userId: null }).kind, "unauthenticated");
});

Deno.test("a malformed body is 400, not 403", () => {
  // Answering 403 to a missing field tells the caller their credentials are
  // the problem when they are not.
  for (const bad of [{ campaignId: null }, { notificationType: "" }]) {
    const outcome = decideNotification({ ...base, ...bad });
    assert.equal(outcome.kind, "invalid_request");
    assert.equal(outcome.kind === "invalid_request" ? outcome.status : 0, 400);
  }
});

Deno.test("a stranger cannot notify about someone else's campaign", () => {
  const outcome = decideNotification({ ...base, userId: OTHER });
  assert.equal(outcome.kind, "forbidden");
  assert.equal(outcome.kind === "forbidden" ? outcome.status : 0, 403);
});

Deno.test("a campaign that does not exist is forbidden, not a crash", () => {
  assert.equal(decideNotification({ ...base, campaignOwnerId: null }).kind, "forbidden");
});

Deno.test("the owner may raise an admin notification about their own campaign", () => {
  // This is the creative-upload path: the advertiser tells the admins there is
  // something to review. It is why the fan-out is not admin-only.
  const outcome = decideNotification({ ...base, notifyAdmins: true });
  assert.deepEqual(outcome, { kind: "notify_admins" });
});

Deno.test("an admin may notify about any campaign", () => {
  const outcome = decideNotification({
    ...base,
    userId: ADMIN,
    isAdmin: true,
    campaignOwnerId: ADVERTISER,
  });
  assert.deepEqual(outcome, { kind: "notify_recipient" });
});

Deno.test("a stranger is refused BEFORE the fan-out is considered", () => {
  // Order matters: if notifyAdmins were read first, anyone with a token could
  // write a row to every admin's notification list.
  const outcome = decideNotification({ ...base, userId: OTHER, notifyAdmins: true });
  assert.equal(outcome.kind, "forbidden");
});

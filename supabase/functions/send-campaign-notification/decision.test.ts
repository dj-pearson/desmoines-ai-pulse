/**
 * send-campaign-notification cannot be used as a mail relay (business plan
 * WP4 item 2).
 *
 * The authorization half (who may call at all) is pinned in
 * ../_tests/campaign-notification-authorization.test.ts. This file pins the
 * other half: once a caller is allowed, what they can make it send. Owning any
 * campaign, a free draft included, used to be enough to choose the recipient
 * and the whole text of an email from the site's address.
 *
 * Run with: deno test --allow-read supabase/functions/send-campaign-notification/
 */
import { strict as assert } from "node:assert";
import {
  buildNotificationText,
  CAMPAIGN_NOTIFICATION_TYPES,
  planNotification,
  sanitizeMetadata,
} from "./decision.ts";

const OWNER = "11111111-1111-4111-8111-111111111111";
const VICTIM = "22222222-2222-4222-8222-222222222222";
const campaign = { id: "c-1", user_id: OWNER, name: "Fall Menu" };

const hostileBody = {
  recipientUserId: VICTIM,
  recipientEmail: "victim@example.com",
  campaignName: "Your account is locked",
  title: "Your account is locked",
  message: "Log in at https://evil.example to restore access.",
  metadata: { reason: "Visit https://evil.example now", amount: 1_000_000, extra: "<script>" },
};

Deno.test("a non-admin cannot choose the recipient", () => {
  const plan = planNotification({
    isAdmin: false,
    notificationType: "creative_approved",
    campaign,
    body: hostileBody,
  });
  assert.equal(plan.recipientUserId, OWNER, "the campaign's owner, from the row");
  assert.equal(plan.recipientEmail, null, "no address from the body; auth supplies it");
});

Deno.test("a non-admin cannot choose the text", () => {
  for (const type of [...CAMPAIGN_NOTIFICATION_TYPES, "made_up_type"]) {
    const plan = planNotification({ isAdmin: false, notificationType: type, campaign, body: hostileBody });
    const text = `${plan.title}\n${plan.message}\n${plan.campaignName}`;
    assert.ok(!text.includes("evil.example"), `${type}: body text leaked into the email`);
    assert.ok(!text.includes("account is locked"), `${type}: body title leaked into the email`);
    assert.ok(!text.includes("1000000"), `${type}: body metadata leaked into the email`);
    assert.equal(plan.campaignName, "Fall Menu", `${type}: the name comes from the row`);
    assert.deepEqual(plan.metadata, {}, `${type}: a non-admin's metadata is dropped`);
    const expected = buildNotificationText(type, "Fall Menu", {});
    assert.equal(plan.title, expected.title);
    assert.equal(plan.message, expected.message);
  }
});

Deno.test("an admin may address someone else, but still not write the text", () => {
  const plan = planNotification({
    isAdmin: true,
    notificationType: "creative_rejected",
    campaign,
    body: { ...hostileBody, metadata: { reason: "Logo is blurry" } },
  });
  assert.equal(plan.recipientUserId, VICTIM, "the admin screens pass recipientUserId");
  assert.equal(plan.recipientEmail, "victim@example.com");
  assert.ok(!plan.title.includes("account is locked"));
  assert.ok(!plan.message.includes("evil.example"));
  assert.ok(plan.message.includes("Reason: Logo is blurry."), "the rejection reason is a template value");
});

Deno.test("an admin's malformed recipient falls back to the owner", () => {
  const plan = planNotification({
    isAdmin: true,
    notificationType: "campaign_activated",
    campaign,
    body: { recipientUserId: "not-a-uuid", recipientEmail: "a@b" },
  });
  assert.equal(plan.recipientUserId, OWNER);
  assert.equal(plan.recipientEmail, null);
});

Deno.test("metadata keeps only the template values, each checked for shape", () => {
  assert.deepEqual(
    sanitizeMetadata({
      amount: "66.5",
      reason: "  Too\r\nbright  ",
      daysRemaining: 3,
      startDate: "2026-10-01",
      extra: "dropped",
    }),
    { amount: 66.5, reason: "Too bright", daysRemaining: 3, startDate: "2026-10-01" },
  );
  assert.deepEqual(sanitizeMetadata({ amount: -1, daysRemaining: 1.5, startDate: "Oct 1" }), {});
  assert.deepEqual(sanitizeMetadata(null), {});
  assert.deepEqual(sanitizeMetadata(["x"]), {});
  assert.equal(sanitizeMetadata({ reason: "x".repeat(900) }).reason?.length, 500);
});

Deno.test("a missing amount is left out, not printed as $0", () => {
  // The old client template printed "Payment of $0" whenever metadata was absent.
  const { message } = buildNotificationText("payment_received", "Fall Menu", {});
  assert.ok(!message.includes("$0"));
  assert.equal(
    buildNotificationText("payment_received", "Fall Menu", { amount: 66.5 }).message.includes("$66.50"),
    true,
  );
});

Deno.test("a campaign with no name still reads as a sentence", () => {
  const plan = planNotification({
    isAdmin: false,
    notificationType: "campaign_completed",
    campaign: { ...campaign, name: "  " },
    body: {},
  });
  assert.equal(plan.campaignName, "your campaign");
});

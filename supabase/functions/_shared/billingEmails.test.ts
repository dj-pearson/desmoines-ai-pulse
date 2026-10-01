import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { SendEmailInput } from "./email.ts";
import {
  type BillingEmailDeps,
  formatDay,
  sendAdminNewCampaign,
  sendSubscriptionCancelled,
  sendSubscriptionStarted,
} from "./billingEmails.ts";

function deps(over: Partial<BillingEmailDeps> = {}) {
  const sent: SendEmailInput[] = [];
  const d: BillingEmailDeps = {
    emailForUser: () => Promise.resolve("member@example.com"),
    planName: () => Promise.resolve("Insider"),
    send: (input) => {
      sent.push(input);
      return Promise.resolve({ ok: true, messageId: "m1" });
    },
    siteUrl: "https://desmoinesinsider.com/",
    adminAddress: "ops@example.com",
    ...over,
  };
  return { d, sent };
}

Deno.test("started: names the plan, links /subscription, states the trial end", async () => {
  const { d, sent } = deps();
  const ok = await sendSubscriptionStarted(d, { userId: "u1", planId: "p1", trialEnd: 1_800_000_000 });
  assert(ok);
  assertEquals(sent[0].to, "member@example.com");
  assertEquals(sent[0].category, "transactional");
  assert(sent[0].subject.includes("Insider"));
  assert(sent[0].html!.includes("https://desmoinesinsider.com/subscription"));
  assert(sent[0].text!.includes(formatDay(1_800_000_000)!));
});

Deno.test("cancelled after access ended says so, with no stale date", async () => {
  const { d, sent } = deps();
  await sendSubscriptionCancelled(d, { userId: "u1", planId: "p1", accessUntil: 1_000_000_000 });
  assert(sent[0].text!.includes("have ended"));
  assert(sent[0].html!.includes("/pricing"));
});

Deno.test("no address or a failing lookup sends nothing and does not throw", async () => {
  const none = deps({ emailForUser: () => Promise.resolve(null) });
  assertEquals(await sendSubscriptionStarted(none.d, { userId: "u1", planId: "p1" }), false);
  const boom = deps({ emailForUser: () => Promise.reject(new Error("auth down")) });
  assertEquals(await sendSubscriptionCancelled(boom.d, { userId: "u1", planId: null }), false);
  assertEquals(none.sent.length + boom.sent.length, 0);
});

Deno.test("a missing plan name falls back rather than blocking the mail", async () => {
  const { d, sent } = deps({ planName: () => Promise.reject(new Error("x")) });
  assert(await sendSubscriptionStarted(d, { userId: "u1", planId: "p1" }));
  assert(sent[0].subject.includes("membership"));
});

Deno.test("admin alert goes to the admin address and links the campaign", async () => {
  const { d, sent } = deps();
  assert(await sendAdminNewCampaign(d, { campaignId: "c-9", campaignName: "Patio", amountPaid: 70, advertiserEmail: "a@b.test" }));
  assertEquals(sent[0].to, "ops@example.com");
  assert(sent[0].html!.includes("/admin/campaigns/c-9"));
  assert(sent[0].text!.includes("$70.00"));
});

Deno.test("a sender that throws is reported as not sent", async () => {
  const { d } = deps({ send: () => Promise.reject(new Error("ses down")) });
  assertEquals(await sendSubscriptionStarted(d, { userId: "u1", planId: "p1" }), false);
});

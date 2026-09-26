/**
 *   deno test --allow-env supabase/functions/_shared/emailTemplates.test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  adminNewCampaignAlert,
  htmlToText,
  newsletterEmail,
  subscriptionCancelledEmail,
  subscriptionStartedEmail,
} from "./emailTemplates.ts";

Deno.test("newsletterEmail: the admin body gets the marketing layout and this subscriber's token", () => {
  const token = "a".repeat(48);
  const msg = newsletterEmail({
    recipient: { email: "reader@example.com", unsubscribeToken: token },
    subject: "Weekend picks",
    bodyHtml: "<h1>Picks</h1><p>Go <a href=\"https://desmoinesinsider.com/events\">here</a>.</p>",
    preheader: "Three things",
    template: "newsletter_campaign",
    ref: { type: "newsletter_campaign", id: "c1" },
  });
  assertEquals(msg.category, "marketing");
  assert(msg.html!.includes(`/unsubscribe?token=${token}`), "footer link carries the recipient's token");
  assert(msg.html!.includes("Des Moines, Iowa, USA"), "postal address present");
  assert(msg.html!.includes("Three things"), "preheader present");
  assert(msg.text!.includes("here (https://desmoinesinsider.com/events)"));
  assert(msg.headers!["List-Unsubscribe"].startsWith("<mailto:"));
});

Deno.test("htmlToText drops tags and keeps words", () => {
  assertEquals(htmlToText("<p>A &amp; B</p><ul><li>one</li><li>two</li></ul><script>x()</script>"), "A & B\n- one\n- two");
});

Deno.test("transactional templates escape what they interpolate", () => {
  const a = adminNewCampaignAlert({ campaignName: "<b>Sale</b>\r\nBcc: x", campaignId: "c 1", siteUrl: "https://desmoinesinsider.com/", amountLabel: "$70.00" });
  assert(!a.subject.includes("\n"));
  assert(a.bodyHtml.includes("&lt;b&gt;Sale"));
  assert(a.bodyText.includes("https://desmoinesinsider.com/admin/campaigns/c%201"));
  const s = subscriptionStartedEmail({ planName: "Insider", manageUrl: "https://desmoinesinsider.com/subscription", trialEndsOn: "Oct 10, 2026" });
  assert(s.bodyText.includes("Oct 10, 2026"));
  const c = subscriptionCancelledEmail({ planName: "VIP", accessUntil: null, resubscribeUrl: "https://desmoinesinsider.com/pricing" });
  assert(c.bodyText.startsWith("Your VIP features have ended"));
});

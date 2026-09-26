/**
 * Billing mail stripe-webhook sends: subscription started and cancelled, and
 * the admin alert for a paid campaign (NON_CORE_REVIEW_2026-09 WP2/WP3).
 *
 * Before this, a new subscriber got Stripe's receipt (if receipts were on) and
 * nothing from us, a cancellation got nothing, and a paid campaign reached the
 * admins only as an in-app row. The bodies are _shared/emailTemplates.ts; this
 * file resolves the address and plan name and hands the result to sendEmail.
 *
 * NEVER THROWS. Every caller is a webhook handler whose real work (the row
 * write) is already done; a mail failure must not return non-2xx and have
 * Stripe redeliver the event. Failures are logged and reported as false.
 *
 * The database and sender are injected, so the resolution rules are tested
 * offline (billingEmails.test.ts).
 */
import { adminAlertEmail, type SendEmailInput, type SendEmailResult } from "./email.ts";
import { renderEmail } from "./emailLayout.ts";
import {
  adminNewCampaignAlert,
  type MessageBody,
  subscriptionCancelledEmail,
  subscriptionStartedEmail,
} from "./emailTemplates.ts";

export interface BillingEmailDeps {
  emailForUser(userId: string): Promise<string | null>;
  planName(planId: string): Promise<string | null>;
  send(input: SendEmailInput): Promise<SendEmailResult>;
  siteUrl: string;
  adminAddress?: string | null;
}

/** "March 4, 2027", the form the rest of the mail uses. */
export function formatDay(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  });
}

function base(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, "");
}

async function deliver(
  deps: BillingEmailDeps,
  to: string,
  body: MessageBody,
  template: string,
  extra: Pick<SendEmailInput, "userId" | "ref">,
): Promise<boolean> {
  const rendered = renderEmail({
    bodyHtml: body.bodyHtml,
    bodyText: body.bodyText,
    category: "transactional",
    recipient: { email: to },
  });
  try {
    const res = await deps.send({
      to,
      subject: body.subject,
      html: rendered.html,
      text: rendered.text,
      category: "transactional",
      template,
      ...extra,
    });
    if (!res.ok) console.error(`[billing-email] ${template} not sent: ${res.error ?? "unknown"}`);
    return res.ok;
  } catch (err) {
    console.error(`[billing-email] ${template} threw: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

async function safe<T>(p: Promise<T>, fallback: T, what: string): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.error(`[billing-email] ${what} failed: ${err instanceof Error ? err.message : String(err)}`);
    return fallback;
  }
}

export async function sendSubscriptionStarted(
  deps: BillingEmailDeps,
  args: { userId: string; planId: string; trialEnd?: number | null },
): Promise<boolean> {
  const to = await safe(deps.emailForUser(args.userId), null, "user lookup");
  if (!to) return false;
  const planName = (await safe(deps.planName(args.planId), null, "plan lookup")) ?? "membership";
  const body = subscriptionStartedEmail({
    planName,
    manageUrl: `${base(deps.siteUrl)}/subscription`,
    trialEndsOn: formatDay(args.trialEnd),
  });
  return deliver(deps, to, body, "billing_subscription_started", { userId: args.userId });
}

export async function sendSubscriptionCancelled(
  deps: BillingEmailDeps,
  args: { userId: string; planId: string | null; accessUntil?: number | null },
): Promise<boolean> {
  const to = await safe(deps.emailForUser(args.userId), null, "user lookup");
  if (!to) return false;
  const planName = (args.planId ? await safe(deps.planName(args.planId), null, "plan lookup") : null) ?? "membership";
  // Only name a date that is still ahead: customer.subscription.deleted
  // arrives when access has already ended, so a past date reads as a mistake.
  const until = args.accessUntil && args.accessUntil * 1000 > Date.now() ? formatDay(args.accessUntil) : null;
  const body = subscriptionCancelledEmail({
    planName,
    accessUntil: until,
    resubscribeUrl: `${base(deps.siteUrl)}/pricing`,
  });
  return deliver(deps, to, body, "billing_subscription_cancelled", { userId: args.userId });
}

export async function sendAdminNewCampaign(
  deps: BillingEmailDeps,
  args: { campaignId: string; campaignName: string; advertiserEmail?: string | null; amountPaid?: number | null },
): Promise<boolean> {
  const to = deps.adminAddress ?? adminAlertEmail();
  if (!to) return false;
  const body = adminNewCampaignAlert({
    campaignName: args.campaignName,
    campaignId: args.campaignId,
    advertiserEmail: args.advertiserEmail ?? null,
    amountLabel: typeof args.amountPaid === "number" ? `$${args.amountPaid.toFixed(2)}` : null,
    siteUrl: deps.siteUrl,
  });
  return deliver(deps, to, body, "admin_new_campaign", { ref: { type: "campaign", id: args.campaignId } });
}

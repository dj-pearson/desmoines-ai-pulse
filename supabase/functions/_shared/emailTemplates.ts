/**
 * Message builders for mail that more than one function sends, or that a
 * function outside the email package will send (WP2 of
 * docs/plans/NON_CORE_REVIEW_2026-09.md).
 *
 * Each builder returns what sendEmail() takes, or the subject and body a
 * caller hands to renderEmail(). Pure: no env, no network, no esm.sh, so the
 * test loads it directly.
 */
import { escapeHtml } from "./escapeHtml.ts";
import { listUnsubscribeHeaders, renderEmail } from "./emailLayout.ts";
import type { SendEmailInput } from "./email.ts";

/**
 * Rough text alternative for HTML we did not write (admin-authored newsletter
 * bodies). A multipart message with a text part scores better with spam
 * filters than HTML alone, and a reader on a text client gets the words.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => `${label} (${href})`)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface NewsletterRecipient {
  email: string;
  /** newsletter_subscribers.unsubscribe_token for THIS recipient. */
  unsubscribeToken?: string | null;
}

/**
 * One newsletter message for one subscriber: the admin's body inside the
 * CAN-SPAM marketing layout, with that subscriber's own unsubscribe link in
 * the footer and the List-Unsubscribe headers. Admin campaign mail used to go
 * out as the bare body_html, with no footer, no postal address and no
 * unsubscribe at all.
 */
export function newsletterEmail(args: {
  recipient: NewsletterRecipient;
  subject: string;
  bodyHtml: string;
  preheader?: string | null;
  from?: string;
  template: string;
  ref?: { type: string; id: string } | null;
}): SendEmailInput {
  const preheader = args.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(args.preheader)}</div>`
    : "";
  const rendered = renderEmail({
    bodyHtml: `${preheader}${args.bodyHtml}`,
    bodyText: htmlToText(args.bodyHtml),
    recipient: { email: args.recipient.email, unsubscribeToken: args.recipient.unsubscribeToken ?? null },
    category: "marketing",
  });
  return {
    to: args.recipient.email,
    subject: args.subject,
    html: rendered.html,
    text: rendered.text,
    category: "marketing",
    template: args.template,
    from: args.from,
    headers: listUnsubscribeHeaders(rendered),
    ref: args.ref ?? null,
  };
}

export interface MessageBody {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

function button(href: string, label: string): string {
  return `<p style="margin:20px 0 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:#1a1a2e;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:500;">${escapeHtml(label)}</a></p>`;
}

/**
 * Subscription started. Transactional: it confirms a purchase. For the
 * stripe-webhook owner to send on checkout.session.completed.
 */
export function subscriptionStartedEmail(args: { planName: string; manageUrl: string; trialEndsOn?: string | null }): MessageBody {
  const trial = args.trialEndsOn ? ` Your free trial runs until ${args.trialEndsOn}; you won't be charged before then.` : "";
  const lead = `You're on Des Moines Insider ${args.planName}.${trial}`;
  return {
    subject: `Welcome to Des Moines Insider ${args.planName}`,
    bodyHtml:
      `<h2 style="margin:0 0 12px;font-size:20px;">Your ${escapeHtml(args.planName)} subscription is active</h2>` +
      `<p style="margin:0 0 12px;">${escapeHtml(lead)}</p>` +
      `<p style="margin:0;">You can change or cancel your plan at any time from your account.</p>` +
      button(args.manageUrl, "Manage subscription"),
    bodyText: `${lead}\n\nYou can change or cancel your plan at any time: ${args.manageUrl}`,
  };
}

/**
 * Subscription cancelled. Transactional. `accessUntil` is the end of the paid
 * period when access continues until then, or null when it ended now.
 */
export function subscriptionCancelledEmail(args: { planName: string; accessUntil?: string | null; resubscribeUrl: string }): MessageBody {
  const when = args.accessUntil
    ? `You keep ${args.planName} features until ${args.accessUntil}, and you won't be charged again.`
    : `Your ${args.planName} features have ended and you won't be charged again.`;
  return {
    subject: `Your Des Moines Insider ${args.planName} subscription was cancelled`,
    bodyHtml:
      `<h2 style="margin:0 0 12px;font-size:20px;">Subscription cancelled</h2>` +
      `<p style="margin:0 0 12px;">${escapeHtml(when)}</p>` +
      `<p style="margin:0;">If you didn't mean to cancel, you can pick a plan again from your account.</p>` +
      button(args.resubscribeUrl, "View plans"),
    bodyText: `${when}\n\nIf you didn't mean to cancel, you can pick a plan again: ${args.resubscribeUrl}`,
  };
}

/**
 * Tell the admin a paid campaign is waiting. Goes to adminAlertEmail().
 * Transactional.
 */
export function adminNewCampaignAlert(args: {
  campaignName: string;
  campaignId: string;
  advertiserEmail?: string | null;
  amountLabel?: string | null;
  siteUrl: string;
}): MessageBody {
  const url = `${args.siteUrl.replace(/\/+$/, "")}/admin/campaigns/${encodeURIComponent(args.campaignId)}`;
  const rows: Array<[string, string]> = [["Campaign", args.campaignName]];
  if (args.advertiserEmail) rows.push(["Advertiser", args.advertiserEmail]);
  if (args.amountLabel) rows.push(["Paid", args.amountLabel]);
  return {
    subject: `New paid campaign: ${args.campaignName}`.replace(/[\r\n]+/g, " ").slice(0, 150),
    bodyHtml:
      `<h2 style="margin:0 0 12px;font-size:20px;">A campaign was paid for</h2>` +
      `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">` +
      rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#555;">${escapeHtml(k)}</td><td><strong>${escapeHtml(v)}</strong></td></tr>`).join("") +
      `</table>` +
      `<p style="margin:12px 0 0;">It needs creative review before it can run.</p>` +
      button(url, "Open campaign"),
    bodyText: `A campaign was paid for.\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nIt needs creative review before it can run: ${url}`,
  };
}

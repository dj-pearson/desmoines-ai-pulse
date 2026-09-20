/**
 * The advertiser-facing campaign email, in one place (WEB-ADS-005).
 *
 * WHY THIS MOVED OUT OF send-campaign-notification. That endpoint renders and
 * delivers every campaign email, and it requires a USER bearer token - see
 * ./send-campaign-notification/decision.ts, which WEB-ADS-013 locked down on
 * purpose. stripe-webhook has no user: it is Stripe calling us. So the one
 * moment an advertiser most needs to hear from us, the moment they are charged,
 * was the one moment that path could not be used, and handleCampaignPayment
 * inserted a campaign_notifications row instead. A row is an in-app bell. The
 * success page meanwhile promised "A confirmation email has been sent".
 *
 * Extracting the renderer and the provider call is the fix that does not need a
 * new secret or a machine-auth branch on a hardened endpoint: both callers
 * render the same email, choose the same provider and send from the same
 * address, because there is one copy of each.
 *
 * Imports nothing from esm.sh, so it loads in a Deno test.
 */
import { escapeHtml } from "./escapeHtml.ts";
import { renderEmail } from "./emailLayout.ts";
import { fetchWithTimeout } from "./fetchWithTimeout.ts";

export interface CampaignEmailContent {
  title: string;
  message: string;
  campaignName: string;
  campaignId: string;
  notificationType: string;
  siteUrl: string;
}

/**
 * Where the email's button goes.
 *
 * payment_received points at the CREATIVE UPLOAD, not at the campaign page. The
 * message this notification carries has always ended "You can now upload your ad
 * creatives", and the button under it went somewhere else - which is the whole
 * of what an advertiser has to do next before anything runs.
 */
export function campaignCtaUrl(type: string, campaignId: string, siteUrl: string): string {
  switch (type) {
    case "creative_uploaded":
    case "campaign_created":
      return `${siteUrl}/admin/campaigns/${campaignId}`;
    case "payment_received":
    case "creative_rejected":
    case "creative_deadline_warning":
      return `${siteUrl}/campaigns/${campaignId}/creatives`;
    case "campaign_activated":
    case "campaign_completed":
    case "campaign_expiring_soon":
      return `${siteUrl}/campaigns/${campaignId}/analytics`;
    case "creative_approved":
      return `${siteUrl}/campaigns/${campaignId}`;
    default:
      return `${siteUrl}/campaigns/${campaignId}`;
  }
}

export function campaignCtaLabel(type: string): string {
  switch (type) {
    case "creative_uploaded":
      return "Review Creatives";
    case "payment_received":
      return "Upload Your Creatives";
    case "creative_rejected":
      return "Upload Revised Creative";
    case "campaign_activated":
      return "View Analytics";
    case "campaign_expiring_soon":
      return "Renew Campaign";
    case "campaign_completed":
      return "View Final Report";
    case "creative_deadline_warning":
      return "Upload Creatives Now";
    default:
      return "View Campaign";
  }
}

export function buildCampaignEmailBodyHtml(content: CampaignEmailContent): string {
  const { title, message, campaignName, campaignId, siteUrl, notificationType } = content;
  const ctaUrl = campaignCtaUrl(notificationType, campaignId, siteUrl);
  const ctaLabel = campaignCtaLabel(notificationType);

  return `
    <div style="background-color:#1a1a2e;padding:24px 32px;border-radius:8px 8px 0 0;">
      <h1 style="margin:0;color:#ffffff;font-size:18px;font-weight:600;">Des Moines AI Pulse</h1>
      <p style="margin:4px 0 0;color:#a0a0b0;font-size:13px;">Advertising Platform</p>
    </div>
    <div style="padding:32px;background-color:#ffffff;border:1px solid #e4e4e7;border-top:none;border-radius:0 0 8px 8px;">
      <h2 style="margin:0 0 16px;color:#1a1a2e;font-size:20px;font-weight:600;">${escapeHtml(title)}</h2>
      <p style="margin:0 0 24px;color:#4a4a5a;font-size:15px;line-height:1.6;">${escapeHtml(message)}</p>
      ${ctaUrl ? `
      <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background-color:#6366f1;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:500;font-size:14px;">
        ${escapeHtml(ctaLabel)}
      </a>
      ` : ''}
      <hr style="margin:32px 0;border:none;border-top:1px solid #e4e4e7;">
      <p style="margin:0;color:#71717a;font-size:13px;">Campaign: <strong>${escapeHtml(campaignName)}</strong> &bull;
        <a href="${escapeHtml(siteUrl)}/campaigns" style="color:#6366f1;text-decoration:none;">Manage campaigns</a>
      </p>
    </div>
  `;
}

export function buildCampaignEmailBodyText(content: CampaignEmailContent): string {
  const cta = campaignCtaUrl(content.notificationType, content.campaignId, content.siteUrl);
  return `${content.title}\n\n${content.message}\n\n${campaignCtaLabel(content.notificationType)}: ${cta}\n\nCampaign: ${content.campaignName}`;
}

/**
 * Render and deliver one campaign email. Returns whether the provider accepted
 * it; it never throws, because every caller is finishing work that already
 * succeeded and must not be undone by a mail outage.
 *
 * Campaign notifications are TRANSACTIONAL - a response to the recipient's own
 * advertising activity - so the footer carries the postal address and no
 * unsubscribe link (CAN-SPAM 5(a) does not require one for a true transactional
 * message). Keeping that decision here rather than at the call sites is half the
 * reason this module exists.
 */
export async function sendCampaignEmail(params: {
  to: string;
  content: CampaignEmailContent;
  resendApiKey?: string;
  sendgridApiKey?: string;
  fromEmail: string;
}): Promise<boolean> {
  const { to, content, resendApiKey, sendgridApiKey, fromEmail } = params;
  if (!to) return false;

  const rendered = renderEmail({
    bodyHtml: buildCampaignEmailBodyHtml(content),
    bodyText: buildCampaignEmailBodyText(content),
    category: "transactional",
    recipient: { email: to },
  });

  if (resendApiKey) {
    try {
      const res = await fetchWithTimeout("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [to],
          subject: content.title,
          html: rendered.html,
          text: rendered.text,
        }),
      });
      return res.ok;
    } catch (err) {
      console.error("Resend email failed:", err);
      return false;
    }
  }

  if (sendgridApiKey) {
    try {
      const res = await fetchWithTimeout("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sendgridApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: fromEmail },
          subject: content.title,
          content: [
            { type: "text/plain", value: rendered.text },
            { type: "text/html", value: rendered.html },
          ],
        }),
      });
      return res.ok || res.status === 202;
    } catch (err) {
      console.error("SendGrid email failed:", err);
      return false;
    }
  }

  return false;
}

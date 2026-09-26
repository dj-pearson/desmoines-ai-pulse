/**
 * Shared email layout helpers
 *
 * Centralizes the CAN-SPAM-required footer for every commercial email we
 * send (physical postal address + functioning one-click unsubscribe link +
 * clear sender identification). Also builds the unsubscribe URL from the
 * recipient's `newsletter_subscribers.unsubscribe_token`.
 *
 * Use `renderEmail({ bodyHtml, bodyText, recipient })` to wrap any body
 * content in a consistent, compliant template.
 *
 * CAN-SPAM §5(a) requirements addressed:
 *   - §5(a)(2): honest subject lines (caller's responsibility)
 *   - §5(a)(3): identify the message as an advertisement (caller adds copy
 *     where applicable; transactional messages are exempt)
 *   - §5(a)(4): clearly and conspicuously display a valid physical postal
 *     address — included in footer below
 *   - §5(a)(5): provide a clear and conspicuous opt-out mechanism that
 *     remains functional for at least 30 days — included as /unsubscribe
 *     link below
 */

import { escapeHtml } from "./escapeHtml.ts";
import { getSiteUrl } from "./siteUrl.ts";

/** Public-facing site URL used for building unsubscribe links. */
export const SITE_URL = getSiteUrl();

/** Postal address used in every commercial email — single source of truth. */
export const POSTAL_ADDRESS = {
  name: "Des Moines Insider",
  line1: "Des Moines, Iowa, USA",
  contactEmail: "hello@desmoinesinsider.com",
  unsubscribeEmail: "unsubscribe@desmoinesinsider.com",
  privacyEmail: "privacy@desmoinesinsider.com",
};

export interface EmailRecipient {
  /** Recipient email — used for the mailto: fallback unsubscribe. */
  email: string;
  /** Token from newsletter_subscribers.unsubscribe_token, if known. */
  unsubscribeToken?: string | null;
  /**
   * Optional per-email unsubscribe path. If the link should cancel a specific
   * kind of email (e.g. event reminders only) rather than all marketing,
   * pass `?tab=settings` or `/profile?tab=settings`.
   */
  preferencesPath?: string;
}

export interface RenderEmailOptions {
  /** Inner HTML for the <body> — the layout wraps it with branding and footer. */
  bodyHtml: string;
  /** Plain-text version — the layout appends a text footer. */
  bodyText: string;
  recipient: EmailRecipient;
  /**
   * `marketing`  → full CAN-SPAM footer with unsubscribe (default)
   * `transactional` → minimal footer, no unsubscribe (receipts, verifications,
   *                   password changes). Still includes postal address and
   *                   an explanation of why the email was sent.
   */
  category?: "marketing" | "transactional";
}

export interface RenderedEmail {
  html: string;
  text: string;
  /** List-Unsubscribe message header. Pass through listUnsubscribeHeaders() to sendEmail. */
  listUnsubscribe?: string;
  /** List-Unsubscribe-Post header value (enables one-click per RFC 8058). */
  listUnsubscribePost?: string;
}

/**
 * Build the absolute URL users hit to unsubscribe from marketing email.
 * Prefers the token-based link; falls back to the authenticated preferences
 * page when we don't have a token yet.
 */
export function buildUnsubscribeUrl(recipient: EmailRecipient): string {
  if (recipient.unsubscribeToken) {
    return `${SITE_URL}/unsubscribe?token=${encodeURIComponent(
      recipient.unsubscribeToken
    )}`;
  }
  return `${SITE_URL}${recipient.preferencesPath ?? "/profile?tab=settings"}`;
}

/**
 * The RFC 8058 one-click endpoint: the email-unsubscribe edge function, which
 * accepts the POST a mailbox provider sends when someone presses the inbox
 * "Unsubscribe" button. The /unsubscribe page on the site cannot take that POST
 * (Cloudflare Pages serves the SPA shell), so the header points here while the
 * footer link keeps pointing at the page a person reads.
 *
 * Null without a token or without SUPABASE_URL, in which case the header
 * carries only the mailto form.
 */
export function buildOneClickUnsubscribeUrl(
  unsubscribeToken: string | null | undefined,
  supabaseUrl: string | undefined = readSupabaseUrl(),
): string | null {
  if (!unsubscribeToken || !supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/email-unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
}

function readSupabaseUrl(): string | undefined {
  try {
    return Deno.env.get("SUPABASE_URL") || undefined;
  } catch {
    return undefined;
  }
}

/** List-Unsubscribe mailto target. Mail to it is read by a person today. */
export const MAILTO_UNSUBSCRIBE = `<mailto:${POSTAL_ADDRESS.unsubscribeEmail}?subject=unsubscribe>`;

/**
 * The message headers for sendEmail's `headers`, from a rendered email. Empty
 * for transactional mail.
 */
export function listUnsubscribeHeaders(rendered: RenderedEmail): Record<string, string> {
  const h: Record<string, string> = {};
  if (rendered.listUnsubscribe) h["List-Unsubscribe"] = rendered.listUnsubscribe;
  if (rendered.listUnsubscribePost) h["List-Unsubscribe-Post"] = rendered.listUnsubscribePost;
  return h;
}

function renderMarketingFooterHtml(recipient: EmailRecipient): string {
  const unsubscribeUrl = buildUnsubscribeUrl(recipient);
  return `
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#666;line-height:1.5;">
      <p style="margin:0 0 8px;">
        You're receiving this email because you signed up for updates from
        ${escapeHtml(POSTAL_ADDRESS.name)}. You can
        <a href="${unsubscribeUrl}" style="color:#666;text-decoration:underline;">
          unsubscribe in one click
        </a>
        or update your
        <a href="${SITE_URL}/profile?tab=settings" style="color:#666;text-decoration:underline;">
          email preferences</a>.
      </p>
      <p style="margin:0 0 8px;">
        <strong>${escapeHtml(POSTAL_ADDRESS.name)}</strong><br>
        ${escapeHtml(POSTAL_ADDRESS.line1)}<br>
        Questions?
        <a href="mailto:${escapeHtml(POSTAL_ADDRESS.contactEmail)}" style="color:#666;text-decoration:underline;">${escapeHtml(POSTAL_ADDRESS.contactEmail)}</a>
      </p>
      <p style="margin:0;font-size:11px;color:#999;">
        © ${new Date().getFullYear()} ${escapeHtml(POSTAL_ADDRESS.name)}. All rights reserved.
        Read our
        <a href="${SITE_URL}/privacy-policy" style="color:#999;text-decoration:underline;">Privacy Policy</a>
        and
        <a href="${SITE_URL}/terms" style="color:#999;text-decoration:underline;">Terms of Service</a>.
      </p>
    </div>
  `;
}

function renderMarketingFooterText(recipient: EmailRecipient): string {
  const unsubscribeUrl = buildUnsubscribeUrl(recipient);
  return `
--
You're receiving this email because you signed up for updates from ${POSTAL_ADDRESS.name}.
Unsubscribe (one click): ${unsubscribeUrl}
Email preferences: ${SITE_URL}/profile?tab=settings

${POSTAL_ADDRESS.name}
${POSTAL_ADDRESS.line1}
Questions? ${POSTAL_ADDRESS.contactEmail}

© ${new Date().getFullYear()} ${POSTAL_ADDRESS.name}. All rights reserved.
Privacy Policy: ${SITE_URL}/privacy-policy
Terms of Service: ${SITE_URL}/terms
`.trim();
}

function renderTransactionalFooterHtml(): string {
  return `
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#666;line-height:1.5;">
      <p style="margin:0 0 8px;">
        This is a transactional message sent in response to activity on your
        ${escapeHtml(POSTAL_ADDRESS.name)} account. For questions about this
        email contact
        <a href="mailto:${escapeHtml(POSTAL_ADDRESS.contactEmail)}" style="color:#666;text-decoration:underline;">${escapeHtml(POSTAL_ADDRESS.contactEmail)}</a>.
      </p>
      <p style="margin:0 0 8px;">
        <strong>${escapeHtml(POSTAL_ADDRESS.name)}</strong><br>
        ${escapeHtml(POSTAL_ADDRESS.line1)}
      </p>
      <p style="margin:0;font-size:11px;color:#999;">
        © ${new Date().getFullYear()} ${escapeHtml(POSTAL_ADDRESS.name)}. All rights reserved.
      </p>
    </div>
  `;
}

function renderTransactionalFooterText(): string {
  return `
--
This is a transactional message sent in response to activity on your ${POSTAL_ADDRESS.name} account.
Questions? ${POSTAL_ADDRESS.contactEmail}

${POSTAL_ADDRESS.name}
${POSTAL_ADDRESS.line1}

© ${new Date().getFullYear()} ${POSTAL_ADDRESS.name}. All rights reserved.
`.trim();
}

/**
 * Wrap message body in a compliant HTML+text email layout. Returns both
 * rendered formats and — for marketing — the headers Resend/Gmail/Apple Mail
 * use to render the "Unsubscribe" chip at the top of the inbox.
 */
export function renderEmail(opts: RenderEmailOptions): RenderedEmail {
  const category = opts.category ?? "marketing";
  const footerHtml =
    category === "marketing"
      ? renderMarketingFooterHtml(opts.recipient)
      : renderTransactionalFooterHtml();
  const footerText =
    category === "marketing"
      ? renderMarketingFooterText(opts.recipient)
      : renderTransactionalFooterText();

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f5f5f5;">
  <div style="max-width:600px;margin:0 auto;padding:24px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#222;line-height:1.5;">
    ${opts.bodyHtml}
    ${footerHtml}
  </div>
</body>
</html>`;

  const text = `${opts.bodyText}\n\n${footerText}\n`;

  if (category === "marketing") {
    // RFC 2369 / RFC 8058: mailto and https variants enable the inbox-level
    // one-click "Unsubscribe" button in Gmail / Apple Mail / Outlook. The
    // https target must accept a POST, so it is the edge function, and
    // List-Unsubscribe-Post is only claimed when there is one.
    const oneClick = buildOneClickUnsubscribeUrl(opts.recipient.unsubscribeToken);
    if (!oneClick) return { html, text, listUnsubscribe: MAILTO_UNSUBSCRIBE };
    return {
      html,
      text,
      listUnsubscribe: `${MAILTO_UNSUBSCRIBE}, <${oneClick}>`,
      listUnsubscribePost: "List-Unsubscribe=One-Click",
    };
  }

  return { html, text };
}

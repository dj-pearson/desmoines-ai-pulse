/**
 * Send Security Notification
 *
 * Transactional alert email sent when a security-sensitive event happens on a
 * user's account:
 *   - `new_device_login`   — sign-in from an IP / device we haven't seen
 *   - `password_changed`   — password was changed via update or reset
 *   - `email_changed`      — account email was changed
 *   - `mfa_disabled`       — an MFA factor was removed
 *
 * The recipient is always the authenticated user. We intentionally fetch the
 * email from auth.users server-side so a client can't spoof the recipient.
 *
 * These are transactional messages under CAN-SPAM §5(a) (sent in response to
 * activity on the recipient's own account) so they do not require an
 * unsubscribe link, but we still include the postal address and brand via
 * the shared renderEmail helper with category: "transactional".
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { escapeHtml } from "../_shared/escapeHtml.ts";
import { renderEmail, SITE_URL } from "../_shared/emailLayout.ts";

type EventType =
  | "new_device_login"
  | "password_changed"
  | "email_changed"
  | "mfa_disabled";

interface RequestBody {
  event_type: EventType;
  /** Optional free-form context passed through into the email body */
  context?: {
    ip?: string;
    user_agent?: string;
    city?: string;
    region?: string;
    country?: string;
    login_type?: string;
    new_email?: string;
  };
}

const EVENT_META: Record<
  EventType,
  { subject: string; heading: string; summary: string }
> = {
  new_device_login: {
    subject: "New sign-in to your Des Moines Insider account",
    heading: "New sign-in detected",
    summary:
      "We noticed a sign-in to your account from a device or location we haven't seen before. If this was you, no action is needed.",
  },
  password_changed: {
    subject: "Your Des Moines Insider password was changed",
    heading: "Password changed",
    summary:
      "Your account password was changed. If this was you, no action is needed.",
  },
  email_changed: {
    subject: "Your Des Moines Insider email was changed",
    heading: "Account email changed",
    summary:
      "The email address on your account was updated. If this was you, no action is needed.",
  },
  mfa_disabled: {
    subject: "Two-factor authentication was turned off",
    heading: "MFA disabled",
    summary:
      "Two-factor authentication was removed from your account. If you didn't do this, re-enable it immediately.",
  },
};

function renderContextRows(ctx: RequestBody["context"]): string {
  if (!ctx) return "";
  const rows: Array<[string, string]> = [];
  if (ctx.login_type) rows.push(["Sign-in method", ctx.login_type]);
  const location = [ctx.city, ctx.region, ctx.country].filter(Boolean).join(", ");
  if (location) rows.push(["Approximate location", location]);
  if (ctx.ip) rows.push(["IP address", ctx.ip]);
  if (ctx.user_agent) rows.push(["Device", ctx.user_agent]);
  if (ctx.new_email) rows.push(["New email", ctx.new_email]);
  if (rows.length === 0) return "";

  return `
    <table cellpadding="0" cellspacing="0" style="margin:16px 0 24px;border-collapse:collapse;font-size:14px;color:#333;">
      ${rows
        .map(
          ([k, v]) => `
        <tr>
          <td style="padding:6px 12px 6px 0;color:#666;vertical-align:top;">${escapeHtml(k)}</td>
          <td style="padding:6px 0;"><strong>${escapeHtml(v)}</strong></td>
        </tr>`
        )
        .join("")}
    </table>
  `;
}

function renderContextText(ctx: RequestBody["context"]): string {
  if (!ctx) return "";
  const rows: string[] = [];
  if (ctx.login_type) rows.push(`Sign-in method: ${ctx.login_type}`);
  const location = [ctx.city, ctx.region, ctx.country].filter(Boolean).join(", ");
  if (location) rows.push(`Approximate location: ${location}`);
  if (ctx.ip) rows.push(`IP address: ${ctx.ip}`);
  if (ctx.user_agent) rows.push(`Device: ${ctx.user_agent}`);
  if (ctx.new_email) rows.push(`New email: ${ctx.new_email}`);
  return rows.length ? `\n${rows.join("\n")}\n` : "";
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Identify the user from their access token — never trust a client-supplied
    // recipient address for security alerts.
    const token = authHeader.replace("Bearer ", "");
    const { data: authResult, error: authError } = await supabase.auth.getUser(
      token
    );
    if (authError || !authResult.user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const recipientEmail = authResult.user.email;
    if (!recipientEmail) {
      return new Response(
        JSON.stringify({ error: "User has no email on file" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    if (!body.event_type || !(body.event_type in EVENT_META)) {
      return new Response(
        JSON.stringify({ error: "event_type is required and must be a known value" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const meta = EVENT_META[body.event_type];
    const contextHtml = renderContextRows(body.context);
    const contextText = renderContextText(body.context);
    const wasYouBlurb =
      'If you did this, no further action is needed. If you didn\'t, change your password right now from ' +
      `${SITE_URL}/profile?tab=settings and enable MFA.`;

    const bodyHtml = `
      <h2 style="margin:0 0 12px;color:#1a1a2e;font-size:20px;">${escapeHtml(meta.heading)}</h2>
      <p style="margin:0 0 12px;color:#333;line-height:1.5;">${escapeHtml(meta.summary)}</p>
      ${contextHtml}
      <p style="margin:12px 0;color:#333;line-height:1.5;">
        ${escapeHtml(wasYouBlurb)}
      </p>
      <p style="margin:16px 0 0;">
        <a href="${SITE_URL}/profile?tab=settings"
           style="display:inline-block;background:#DC143C;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:500;">
          Review account security
        </a>
      </p>
    `;

    const bodyText = [
      meta.heading.toUpperCase(),
      "",
      meta.summary,
      contextText,
      wasYouBlurb,
      "",
      `Review security settings: ${SITE_URL}/profile?tab=settings`,
    ]
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");

    const rendered = renderEmail({
      bodyHtml,
      bodyText,
      category: "transactional",
      recipient: { email: recipientEmail },
    });

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      // Soft-fail: log so the alert is recorded in application logs even if
      // delivery is unconfigured, but don't break the calling client flow.
      console.warn("send-security-notification: RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, reason: "email_transport_not_configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "Des Moines Insider Security <security@desmoinesinsider.com>",
        to: [recipientEmail],
        subject: meta.subject,
        html: rendered.html,
        text: rendered.text,
        tags: [
          { name: "type", value: "security_notification" },
          { name: "event_type", value: body.event_type },
        ],
      }),
    });

    if (!resendResponse.ok) {
      const errData = await resendResponse.text();
      console.error("Resend failed:", resendResponse.status, errData);
      return new Response(
        JSON.stringify({ error: "Failed to send security notification" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-security-notification error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

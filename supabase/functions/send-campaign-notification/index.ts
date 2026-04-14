/**
 * Send Campaign Notification
 *
 * Handles email and in-app notification delivery for campaign lifecycle events.
 * Called by the frontend notification hooks or by other edge functions (webhooks, cron).
 *
 * Notification types:
 * - campaign_created → admin
 * - payment_received → admin + advertiser
 * - creative_uploaded → admin
 * - creative_approved → advertiser
 * - creative_rejected → advertiser
 * - campaign_activated → advertiser
 * - campaign_expiring_soon → advertiser
 * - campaign_completed → advertiser
 * - campaign_rejected → advertiser
 * - campaign_refunded → advertiser
 * - creative_deadline_warning → advertiser
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { escapeHtml } from "../_shared/escapeHtml.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { renderEmail } from "../_shared/emailLayout.ts";

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Rate limiting: 10 requests per 15 minutes (SEC-014)
  const rateLimit = checkRateLimit(req, {
    max: 10,
    message: "Too many notification requests. Please try again later.",
  });
  if (!rateLimit.success && rateLimit.response) {
    return rateLimit.response;
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Require authentication (SEC-014)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is admin or campaign owner
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin = profile?.role === "admin";

    const body = await req.json();
    const {
      recipientUserId,
      recipientEmail,
      notificationType,
      campaignId,
      campaignName,
      title,
      message,
      metadata,
    } = body;

    if (!notificationType || !campaignId) {
      return new Response(
        JSON.stringify({ error: "notificationType and campaignId are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify user is admin or owns the campaign
    if (!isAdmin) {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("user_id")
        .eq("id", campaignId)
        .single();

      if (!campaign || campaign.user_id !== user.id) {
        return new Response(
          JSON.stringify({ error: "Forbidden: not authorized for this campaign" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Resolve recipient email if not provided
    let emailAddress = recipientEmail;
    if (!emailAddress && recipientUserId) {
      const { data: userData } = await supabase.auth.admin.getUserById(recipientUserId);
      emailAddress = userData?.user?.email;
    }

    // Store in-app notification
    const { error: notifError } = await supabase
      .from("campaign_notifications")
      .upsert(
        {
          campaign_id: campaignId,
          recipient_user_id: recipientUserId || null,
          recipient_email: emailAddress || null,
          notification_type: notificationType,
          title: title || `Campaign Update: ${campaignName}`,
          message: message || "You have a campaign update.",
          is_read: false,
          metadata: metadata || {},
        },
        { ignoreDuplicates: false }
      );

    if (notifError) {
      console.error("Failed to store notification:", notifError);
    }

    // Attempt email delivery if we have a recipient email
    let emailSent = false;
    if (emailAddress) {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      const sendgridApiKey = Deno.env.get("SENDGRID_API_KEY");
      const fromEmail = Deno.env.get("NOTIFICATION_FROM_EMAIL") || "noreply@desmoinesinsider.com";
      const siteUrl = Deno.env.get("VITE_SITE_URL") || "https://desmoinesinsider.com";

      const emailSubject = title || `Campaign Update: ${campaignName}`;
      const bodyHtml = buildEmailBodyHtml({
        title: emailSubject,
        message: message || "",
        campaignName,
        campaignId,
        notificationType,
        siteUrl,
      });
      const bodyText = buildEmailBodyText({
        title: emailSubject,
        message: message || "",
        campaignName,
      });

      // Campaign notifications are transactional — they are responses to the
      // recipient's own advertising-campaign activity. The transactional footer
      // includes the postal address but no unsubscribe link (CAN-SPAM §5(a) does
      // not require one for true transactional messages).
      const rendered = renderEmail({
        bodyHtml,
        bodyText,
        category: "transactional",
        recipient: { email: emailAddress },
      });
      const emailHtml = rendered.html;
      const emailText = rendered.text;

      if (resendApiKey) {
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: fromEmail,
              to: [emailAddress],
              subject: emailSubject,
              html: emailHtml,
              text: emailText,
            }),
          });
          emailSent = res.ok;
        } catch (err) {
          console.error("Resend email failed:", err);
        }
      } else if (sendgridApiKey) {
        try {
          const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${sendgridApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: emailAddress }] }],
              from: { email: fromEmail },
              subject: emailSubject,
              content: [
                { type: "text/plain", value: emailText },
                { type: "text/html", value: emailHtml },
              ],
            }),
          });
          emailSent = res.ok || res.status === 202;
        } catch (err) {
          console.error("SendGrid email failed:", err);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        emailSent,
        storedNotification: !notifError,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Notification error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send notification" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function buildEmailBodyHtml(params: {
  title: string;
  message: string;
  campaignName: string;
  campaignId: string;
  notificationType: string;
  siteUrl: string;
}): string {
  const { title, message, campaignName, campaignId, siteUrl, notificationType } = params;

  const ctaUrl = getCampaignCtaUrl(notificationType, campaignId, siteUrl);
  const ctaLabel = getCampaignCtaLabel(notificationType);

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
        <a href="${siteUrl}/campaigns" style="color:#6366f1;text-decoration:none;">Manage campaigns</a>
      </p>
    </div>
  `;
}

function buildEmailBodyText(params: {
  title: string;
  message: string;
  campaignName: string;
}): string {
  return `${params.title}\n\n${params.message}\n\nCampaign: ${params.campaignName}`;
}

function getCampaignCtaUrl(type: string, campaignId: string, siteUrl: string): string {
  switch (type) {
    case 'creative_uploaded':
    case 'campaign_created':
      return `${siteUrl}/admin/campaigns/${campaignId}`;
    case 'creative_rejected':
    case 'creative_deadline_warning':
      return `${siteUrl}/campaigns/${campaignId}/creatives`;
    case 'campaign_activated':
    case 'campaign_completed':
    case 'campaign_expiring_soon':
      return `${siteUrl}/campaigns/${campaignId}/analytics`;
    case 'creative_approved':
    case 'payment_received':
      return `${siteUrl}/campaigns/${campaignId}`;
    default:
      return `${siteUrl}/campaigns/${campaignId}`;
  }
}

function getCampaignCtaLabel(type: string): string {
  switch (type) {
    case 'creative_uploaded':
      return 'Review Creatives';
    case 'creative_rejected':
      return 'Upload Revised Creative';
    case 'campaign_activated':
      return 'View Analytics';
    case 'campaign_expiring_soon':
      return 'Renew Campaign';
    case 'campaign_completed':
      return 'View Final Report';
    case 'creative_deadline_warning':
      return 'Upload Creatives Now';
    default:
      return 'View Campaign';
  }
}

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
 *
 * The request names the campaign and the type. For a non-admin caller the
 * recipient is the campaign's owner and the words are built from the type
 * (./decision.ts planNotification); recipientEmail, recipientUserId, title,
 * message, campaignName and metadata in the body are ignored.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { sendCampaignEmail } from "../_shared/campaignNotificationEmail.ts";
import { isAdminUserId, listAdminUserIds } from "../_shared/apiKeyAuth.ts";
import { decideNotification, planNotification } from "./decision.ts";

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

    // Authorization and routing live in ./decision.ts, which is importable in a
    // test - this file is not, because of the esm.sh imports above.
    // WEB-ADS-013 AC4.
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    let isAdmin = false;

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError) {
        // A token that does not resolve is a 401 either way, but the REASON
        // matters when it is the auth service failing rather than the token
        // being bad - discarded, those two look identical from the outside.
        console.error("auth.getUser failed:", authError.message);
      }
      userId = user?.id ?? null;
      if (userId) {
        // WEB-SEC-023: was profiles.role keyed by the row PK - a column not in
        // the schema, so isAdmin was always false and admins were treated as
        // ordinary users. isAdminUserId is the one shared definition.
        isAdmin = await isAdminUserId(supabase, userId, "send-campaign-notification");
      }
    }

    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      body = {};
    }
    const notificationType = typeof body.notificationType === "string" ? body.notificationType : null;
    const campaignId = typeof body.campaignId === "string" ? body.campaignId : null;
    // WEB-ADS-013. Fan out to every admin, resolved HERE with the service
    // role. The browser used to do this itself, selecting other users'
    // profiles.user_role to find out who the admins are.
    const shouldNotifyAdmins = body.notifyAdmins === true;

    // The campaign row is read for every caller now, admin included: its
    // owner is the default recipient and its name is the one in the email.
    // The body's campaignName, title and message are not used (business plan
    // WP4 item 2; see planNotification in ./decision.ts).
    let campaign: { id: string; user_id: string; name: string | null } | null = null;
    if (userId && campaignId) {
      const { data, error: campaignError } = await supabase
        .from("campaigns")
        .select("id, user_id, name")
        .eq("id", campaignId)
        .maybeSingle();
      if (campaignError) {
        // A failed lookup must not read as "not your campaign": say it failed.
        console.error("campaign lookup failed:", campaignError.message);
        return new Response(
          JSON.stringify({ error: "Could not read the campaign" }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      campaign = data ?? null;
    }

    const decision = decideNotification({
      hasAuthHeader: !!authHeader,
      userId,
      isAdmin,
      campaignOwnerId: campaign?.user_id ?? null,
      notificationType,
      campaignId,
      notifyAdmins: shouldNotifyAdmins,
    });

    if (decision.kind === "unauthenticated" || decision.kind === "invalid_request" || decision.kind === "forbidden") {
      return new Response(
        JSON.stringify({ error: decision.error }),
        { status: decision.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Only an admin reaches here without a campaign row (the owner check needs
    // one). Nothing to name or address without it.
    if (!campaign || !notificationType) {
      return new Response(
        JSON.stringify({ error: "No such campaign" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const plan = planNotification({ isAdmin, notificationType, campaign, body });

    // Admin fan-out: one stored notification per admin, service-role written.
    // No email here - the admin digest is not a transactional message to the
    // advertiser, and the email path below addresses one recipient.
    if (decision.kind === "notify_admins") {
      const adminUserIds = await listAdminUserIds(supabase);
      if (adminUserIds.length > 0) {
        const { error: fanOutError } = await supabase
          .from("campaign_notifications")
          .insert(
            adminUserIds.map((adminUserId: string) => ({
              campaign_id: campaign.id,
              recipient_user_id: adminUserId,
              notification_type: notificationType,
              title: plan.title,
              message: plan.message,
              is_read: false,
              metadata: plan.metadata,
            })),
          );
        if (fanOutError) {
          console.error("Failed to store admin notifications:", fanOutError);
          return new Response(
            JSON.stringify({ error: "Failed to store admin notifications" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
      return new Response(
        JSON.stringify({ success: true, adminsNotified: adminUserIds.length }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // The address comes from auth, for the resolved recipient. Only an admin
    // can name one directly (planNotification drops it for everyone else).
    let emailAddress = plan.recipientEmail;
    if (!emailAddress) {
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(plan.recipientUserId);
      if (userError) {
        console.error("recipient lookup failed:", userError.message);
      }
      emailAddress = userData?.user?.email ?? null;
    }

    // Store in-app notification
    const { error: notifError } = await supabase
      .from("campaign_notifications")
      .upsert(
        {
          campaign_id: campaign.id,
          recipient_user_id: plan.recipientUserId,
          recipient_email: emailAddress,
          notification_type: notificationType,
          title: plan.title,
          message: plan.message,
          is_read: false,
          metadata: plan.metadata,
        },
        { ignoreDuplicates: false }
      );

    if (notifError) {
      console.error("Failed to store notification:", notifError);
    }

    // Attempt email delivery if we have a recipient email.
    //
    // The renderer and the provider call live in _shared/campaignNotificationEmail.ts
    // (WEB-ADS-005) because stripe-webhook needs the same email and cannot reach
    // this endpoint - it has no user token, and decision.ts requires one.
    let emailSent = false;
    if (emailAddress) {
      emailSent = await sendCampaignEmail({
        to: emailAddress,
        content: {
          title: plan.title,
          message: plan.message,
          campaignName: plan.campaignName,
          campaignId: campaign.id,
          notificationType,
          siteUrl: Deno.env.get("VITE_SITE_URL") || "https://desmoinesinsider.com",
        },
        resendApiKey: Deno.env.get("RESEND_API_KEY") ?? undefined,
        sendgridApiKey: Deno.env.get("SENDGRID_API_KEY") ?? undefined,
        fromEmail: Deno.env.get("NOTIFICATION_FROM_EMAIL") || "noreply@desmoinesinsider.com",
      });
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
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to send notification" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

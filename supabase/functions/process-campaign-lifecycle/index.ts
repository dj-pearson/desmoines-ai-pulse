/**
 * Process Campaign Lifecycle
 *
 * Scheduled edge function (via pg_cron or manual invocation) that handles:
 * 1. Activating campaigns when their start_date arrives (and creatives are approved)
 * 2. Completing campaigns when their end_date passes
 * 3. Sending expiring-soon notifications (3 days before end)
 * 4. Sending creative deadline warnings for campaigns starting soon without creatives
 *
 * Should be invoked daily by pg_cron:
 *   SELECT cron.schedule('campaign-lifecycle', '0 6 * * *', $$
 *     SELECT net.http_post(
 *       url := 'https://your-project.supabase.co/functions/v1/process-campaign-lifecycle',
 *       headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
 *     );
 *   $$);
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Call the database function that handles all lifecycle transitions
    const { data: result, error } = await supabase.rpc("process_campaign_lifecycle");

    if (error) {
      console.error("Lifecycle processing failed:", error);
      throw error;
    }

    console.log("Campaign lifecycle processed:", JSON.stringify(result));

    // Send notifications for activated campaigns
    if (result.activated > 0) {
      const { data: justActivated } = await supabase
        .from("campaigns")
        .select("id, name, user_id")
        .eq("status", "active")
        .gte("updated_at", new Date(Date.now() - 60000).toISOString()); // Updated in last minute

      if (justActivated) {
        for (const campaign of justActivated) {
          await supabase.from("campaign_notifications").insert({
            campaign_id: campaign.id,
            recipient_user_id: campaign.user_id,
            notification_type: "campaign_activated",
            title: `Campaign Live: ${campaign.name}`,
            message: `Your campaign "${campaign.name}" is now live! Your ads are being displayed to visitors.`,
            is_read: false,
            metadata: {},
          });
        }
      }
    }

    // Send notifications for completed campaigns
    if (result.completed > 0) {
      const { data: justCompleted } = await supabase
        .from("campaigns")
        .select("id, name, user_id")
        .eq("status", "completed")
        .gte("updated_at", new Date(Date.now() - 60000).toISOString());

      if (justCompleted) {
        for (const campaign of justCompleted) {
          await supabase.from("campaign_notifications").insert({
            campaign_id: campaign.id,
            recipient_user_id: campaign.user_id,
            notification_type: "campaign_completed",
            title: `Campaign Completed: ${campaign.name}`,
            message: `Your campaign "${campaign.name}" has ended. View your final performance report in the analytics dashboard.`,
            is_read: false,
            metadata: {},
          });
        }
      }
    }

    // Send expiring-soon notifications
    if (result.expiring_soon > 0) {
      const today = new Date().toISOString().split("T")[0];
      const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      const { data: expiringCampaigns } = await supabase
        .from("campaigns")
        .select("id, name, user_id, end_date")
        .eq("status", "active")
        .eq("end_date", threeDaysFromNow);

      if (expiringCampaigns) {
        for (const campaign of expiringCampaigns) {
          await supabase.from("campaign_notifications").insert({
            campaign_id: campaign.id,
            recipient_user_id: campaign.user_id,
            notification_type: "campaign_expiring_soon",
            title: `Campaign Expiring Soon: ${campaign.name}`,
            message: `Your campaign "${campaign.name}" will end in 3 days. Consider renewing to maintain your ad visibility.`,
            is_read: false,
            metadata: { daysRemaining: 3 },
          });
        }
      }
    }

    // Send creative deadline warnings
    if (result.deadline_warnings > 0) {
      const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      const { data: deadlineCampaigns } = await supabase
        .from("campaigns")
        .select("id, name, user_id, start_date")
        .eq("status", "pending_creative")
        .lte("start_date", threeDaysFromNow);

      if (deadlineCampaigns) {
        for (const campaign of deadlineCampaigns) {
          // Check if they have any creatives at all
          const { data: creatives } = await supabase
            .from("campaign_creatives")
            .select("id")
            .eq("campaign_id", campaign.id);

          if (!creatives || creatives.length === 0) {
            await supabase.from("campaign_notifications").insert({
              campaign_id: campaign.id,
              recipient_user_id: campaign.user_id,
              notification_type: "creative_deadline_warning",
              title: `Upload Deadline: ${campaign.name}`,
              message: `Your campaign "${campaign.name}" starts on ${campaign.start_date} but you haven't uploaded any creatives yet. Upload them now to ensure your campaign starts on time.`,
              is_read: false,
              metadata: { startDate: campaign.start_date },
            });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        ...result,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Lifecycle cron error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Lifecycle processing failed" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

// ============================================================================
// Send SEO Notification Edge Function
// ============================================================================
// Purpose: Send SEO alerts via email, Slack, Discord, or other channels
// Returns: Notification delivery status
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const emailProvider = Deno.env.get("EMAIL_PROVIDER") || "console";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { alertId, channels = ["email"] } = await req.json();

    if (!alertId) {
      return new Response(JSON.stringify({ error: "alertId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get alert details
    const { data: alert, error: alertError } = await supabase
      .from("seo_alerts")
      .select("*")
      .eq("id", alertId)
      .single();

    if (alertError || !alert) {
      throw new Error("Alert not found");
    }

    console.log(`Sending notification for alert: ${alert.title}`);

    const notificationsSent: string[] = [];
    const notificationsFailed: string[] = [];

    // Format alert message
    const subject = `[${alert.severity.toUpperCase()}] ${alert.title}`;
    const message = `
SEO Alert - ${alert.severity.toUpperCase()}

${alert.title}

${alert.message}

Affected URL: ${alert.affected_url || "N/A"}
Metric: ${alert.metric_name || "N/A"}
Current Value: ${alert.metric_value !== null ? alert.metric_value : "N/A"}
Threshold: ${alert.threshold_value !== null ? alert.threshold_value : "N/A"}

Category: ${alert.rule_category}
Triggered at: ${new Date(alert.created_at).toLocaleString()}

View details in the SEO Dashboard: ${Deno.env.get("VITE_SITE_URL") || "https://desmoinesinsider.com"}/admin/seo
`;

    // Send via Email
    if (channels.includes("email")) {
      try {
        if (emailProvider === "console") {
          console.log("=".repeat(80));
          console.log("EMAIL NOTIFICATION (console mode)");
          console.log("=".repeat(80));
          console.log(`To: Admin`);
          console.log(`Subject: ${subject}`);
          console.log("-".repeat(80));
          console.log(message);
          console.log("=".repeat(80));
          notificationsSent.push("email (console)");
        } else if (emailProvider === "resend") {
          const resendApiKey = Deno.env.get("RESEND_API_KEY");
          const emailFrom = Deno.env.get("EMAIL_FROM") || "noreply@desmoinesinsider.com";

          if (!resendApiKey) {
            throw new Error("Resend API key not configured");
          }

          // Get notification preferences for admins
          const { data: preferences } = await supabase
            .from("seo_notification_preferences")
            .select("*")
            .eq("email_enabled", true);

          const recipients = preferences?.map((p) => p.email_address).filter(Boolean) || [];

          if (recipients.length > 0) {
            const emailResponse = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${resendApiKey}`,
              },
              body: JSON.stringify({
                from: emailFrom,
                to: recipients,
                subject,
                text: message,
              }),
            });

            if (emailResponse.ok) {
              notificationsSent.push("email (resend)");
            } else {
              throw new Error(`Resend API error: ${await emailResponse.text()}`);
            }
          }
        }
      } catch (error) {
        console.error("Email notification failed:", error);
        notificationsFailed.push(`email: ${error.message}`);
      }
    }

    // Send via Slack
    if (channels.includes("slack")) {
      try {
        const slackWebhookUrl = Deno.env.get("SLACK_WEBHOOK_URL");

        if (!slackWebhookUrl) {
          throw new Error("Slack webhook URL not configured");
        }

        const slackMessage = {
          text: subject,
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: subject,
              },
            },
            {
              type: "section",
              fields: [
                {
                  type: "mrkdwn",
                  text: `*Category:*\n${alert.rule_category}`,
                },
                {
                  type: "mrkdwn",
                  text: `*Severity:*\n${alert.severity}`,
                },
                {
                  type: "mrkdwn",
                  text: `*URL:*\n${alert.affected_url || "N/A"}`,
                },
                {
                  type: "mrkdwn",
                  text: `*Metric:*\n${alert.metric_name || "N/A"}`,
                },
              ],
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: alert.message,
              },
            },
          ],
        };

        const slackResponse = await fetch(slackWebhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(slackMessage),
        });

        if (slackResponse.ok) {
          notificationsSent.push("slack");
        } else {
          throw new Error(`Slack API error: ${await slackResponse.text()}`);
        }
      } catch (error) {
        console.error("Slack notification failed:", error);
        notificationsFailed.push(`slack: ${error.message}`);
      }
    }

    // Send via Discord
    if (channels.includes("discord")) {
      try {
        const discordWebhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");

        if (!discordWebhookUrl) {
          throw new Error("Discord webhook URL not configured");
        }

        const discordMessage = {
          embeds: [
            {
              title: subject,
              description: alert.message,
              color: alert.severity === "critical" ? 16711680 : alert.severity === "high" ? 16744192 : 16776960,
              fields: [
                {
                  name: "Category",
                  value: alert.rule_category,
                  inline: true,
                },
                {
                  name: "Severity",
                  value: alert.severity,
                  inline: true,
                },
                {
                  name: "Affected URL",
                  value: alert.affected_url || "N/A",
                },
                {
                  name: "Metric",
                  value: `${alert.metric_name || "N/A"}: ${alert.metric_value !== null ? alert.metric_value : "N/A"}`,
                  inline: true,
                },
              ],
              timestamp: new Date(alert.created_at).toISOString(),
            },
          ],
        };

        const discordResponse = await fetch(discordWebhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(discordMessage),
        });

        if (discordResponse.ok) {
          notificationsSent.push("discord");
        } else {
          throw new Error(`Discord API error: ${await discordResponse.text()}`);
        }
      } catch (error) {
        console.error("Discord notification failed:", error);
        notificationsFailed.push(`discord: ${error.message}`);
      }
    }

    // Update alert with notification status
    await supabase
      .from("seo_alerts")
      .update({
        notification_sent: notificationsSent.length > 0,
        notification_sent_at: new Date().toISOString(),
        notification_channels: notificationsSent,
      })
      .eq("id", alertId);

    return new Response(
      JSON.stringify({
        success: true,
        notificationsSent,
        notificationsFailed,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in send-seo-notification function:", error);

    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.stack,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

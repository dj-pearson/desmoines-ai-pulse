/**
 * SECURITY: verify_jwt = true (default); callers must also be admin or carry
 * the service-role / EDGE_FUNCTION_API_KEY bearer (requireAdminOrApiKey). The
 * cron job in 20261003000007 sends the service-role key from Vault.
 *
 * Sends the campaign notices written with email_pending = true. See handler.ts.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { sendCampaignEmail } from "../_shared/campaignNotificationEmail.ts";
import { getSiteUrl } from "../_shared/siteUrl.ts";
import { type PendingNotice, run } from "./handler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const siteUrl = getSiteUrl();

  try {
    const result = await run({
      async listPending(limit) {
        const { data, error } = await supabase
          .from("campaign_notifications")
          .select("id, campaign_id, recipient_user_id, notification_type, title, message, campaigns(name)")
          .eq("email_pending", true)
          .order("created_at", { ascending: true })
          .limit(limit);
        if (error) throw new Error(`campaign_notifications read failed: ${error.message}`);
        // deno-lint-ignore no-explicit-any
        return (data ?? []).map((r: any): PendingNotice => ({
          id: r.id,
          campaign_id: r.campaign_id,
          recipient_user_id: r.recipient_user_id,
          notification_type: r.notification_type,
          title: r.title,
          message: r.message,
          campaign_name: r.campaigns?.name ?? null,
        }));
      },
      async claim(id) {
        const { data, error } = await supabase
          .from("campaign_notifications")
          .update({ email_pending: false })
          .eq("id", id)
          .eq("email_pending", true)
          .select("id");
        if (error) {
          console.error(`[send-campaign-emails] claim ${id} failed: ${error.message}`);
          return false;
        }
        return (data ?? []).length > 0;
      },
      async release(id) {
        const { error } = await supabase.from("campaign_notifications").update({ email_pending: true }).eq("id", id);
        // Logged, not thrown: a row stuck at false is one missed email, and
        // throwing here would abandon the rest of the batch.
        if (error) console.error(`[send-campaign-emails] release ${id} failed: ${error.message}`);
      },
      async markSent(id, recipientEmail) {
        const { error } = await supabase
          .from("campaign_notifications")
          .update({ emailed_at: new Date().toISOString(), recipient_email: recipientEmail })
          .eq("id", id);
        if (error) console.error(`[send-campaign-emails] mark ${id} failed: ${error.message}`);
      },
      async emailFor(userId) {
        const { data, error } = await supabase.auth.admin.getUserById(userId);
        if (error) {
          console.error(`[send-campaign-emails] user lookup failed: ${error.message}`);
          return null;
        }
        return data?.user?.email ?? null;
      },
      send(n, to) {
        return sendCampaignEmail({
          to,
          supabase,
          userId: n.recipient_user_id,
          content: {
            title: n.title,
            message: n.message,
            campaignName: n.campaign_name ?? "your campaign",
            campaignId: n.campaign_id,
            notificationType: n.notification_type,
            siteUrl,
          },
        });
      },
    });
    return json({ ok: true, ...result }, 200);
  } catch (err) {
    console.error("[send-campaign-emails]", err);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

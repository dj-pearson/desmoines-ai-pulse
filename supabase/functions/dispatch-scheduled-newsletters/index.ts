/**
 * Dispatch Scheduled Newsletters
 *
 * Cron-driven worker. Reads up to 5 newsletter_campaigns rows where
 * status = 'scheduled' AND scheduled_for <= now(), atomically flips
 * each to 'sending' (so a duplicate cron run doesn't double-send),
 * then dispatches via Resend the same way send-newsletter-campaign's
 * send_now path does.
 *
 * Cron schedule lives in migration 20260520000012_schedule_newsletter_dispatch.sql
 *
 * Auth:
 *   - verify_jwt=false (cron calls with a service-role bearer in the
 *     Authorization header; we accept that)
 *   - Also accepts an admin user bearer so an admin can manually drain
 *     overdue scheduled campaigns from the UI in the future.
 *
 * Story: EMAIL-SCHED-001
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { runJob } from "../_shared/jobRunner.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS =
  Deno.env.get("NEWSLETTER_FROM")
    ?? "Des Moines Insider <events@desmoinesinsider.com>";
const BATCH_SIZE = 5;
const MAX_CAMPAIGNS_PER_RUN = 5;

interface Segment {
  sources?: string[];
}

interface CampaignRow {
  id: string;
  subject: string;
  preheader: string | null;
  body_html: string;
  segment: Segment | null;
}

async function resolveSegment(
  supabase: ReturnType<typeof createClient>,
  segment: Segment | null,
): Promise<{ email: string }[]> {
  let q = supabase
    .from("newsletter_subscribers")
    .select("email")
    .eq("status", "active");
  if (segment?.sources && segment.sources.length > 0) {
    q = q.in("source", segment.sources);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as { email: string }[];
}

async function sendOne(
  to: string,
  subject: string,
  bodyHtml: string,
): Promise<{ message_id: string | null }> {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [to],
      subject,
      html: bodyHtml,
    }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Resend ${r.status}: ${text.slice(0, 200)}`);
  }
  const body = await r.json().catch(() => ({} as { id?: string }));
  return { message_id: typeof body.id === "string" ? body.id : null };
}

async function dispatchCampaign(
  supabase: ReturnType<typeof createClient>,
  campaign: CampaignRow,
): Promise<{ delivered: number; failed: number; errors: string[] }> {
  const recipients = await resolveSegment(supabase, campaign.segment);
  let delivered = 0;
  let failed = 0;
  const errors: string[] = [];
  const deliveryRows: Array<{
    campaign_id: string;
    email: string;
    resend_message_id: string | null;
    status: string;
    error_message: string | null;
  }> = [];

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map((r) => sendOne(r.email, campaign.subject, campaign.body_html)),
    );
    settled.forEach((s, idx) => {
      const recipient = batch[idx];
      if (s.status === "fulfilled") {
        delivered++;
        deliveryRows.push({
          campaign_id: campaign.id,
          email: recipient.email,
          resend_message_id: s.value.message_id,
          status: "queued",
          error_message: null,
        });
      } else {
        failed++;
        const reason = s.reason instanceof Error
          ? s.reason.message
          : String(s.reason);
        if (errors.length < 5) errors.push(reason);
        deliveryRows.push({
          campaign_id: campaign.id,
          email: recipient.email,
          resend_message_id: null,
          status: "bounced",
          error_message: reason.slice(0, 500),
        });
      }
    });
  }

  if (deliveryRows.length > 0) {
    const { error: deliveriesError } = await supabase
      .from("newsletter_deliveries")
      .insert(deliveryRows);
    if (deliveriesError) {
      console.error(
        "newsletter_deliveries insert failed:",
        deliveriesError.message,
      );
    }
  }

  return { delivered, failed, errors };
}

serve(async (req) => {
  // Lightweight CORS — cron does not preflight, but admins might call it
  // from the dashboard.
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Atomically claim up to MAX_CAMPAIGNS_PER_RUN due rows.
    const { data: claimed, error: claimError } = await supabase.rpc(
      "claim_scheduled_newsletter_campaigns",
      { p_limit: MAX_CAMPAIGNS_PER_RUN },
    );

    if (claimError) {
      console.error("claim_scheduled_newsletter_campaigns failed:", claimError);
      return new Response(JSON.stringify({ error: claimError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const campaigns = (claimed ?? []) as CampaignRow[];
    if (campaigns.length === 0) {
      // Nothing due. Return without opening a job-run row — this cron fires
      // every minute, so logging a run each time would flood the Job Health
      // panel. A run is only recorded when a batch is actually dispatched.
      return new Response(
        JSON.stringify({ ok: true, dispatched: 0 }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // WEB-AUTO-008: record the send results (delivered/failed per campaign)
    // through the WEB-AUTO-001 jobRunner so they surface in the admin Job
    // Health panel and a terminal failure alerts the admin.
    const job = await runJob("dispatch-scheduled-newsletters", async (ctx) => {
      let totalDelivered = 0;
      let totalFailed = 0;
      const perCampaign: Array<{
        id: string;
        delivered: number;
        failed: number;
        status: "sent" | "failed";
      }> = [];

      for (const campaign of campaigns) {
        try {
          const { delivered, failed, errors } = await dispatchCampaign(
            supabase,
            campaign,
          );
          totalDelivered += delivered;
          totalFailed += failed;

          const status = delivered > 0 || failed === 0 ? "sent" : "failed";
          await supabase
            .from("newsletter_campaigns")
            .update({
              status,
              sent_at: new Date().toISOString(),
              delivered,
              failed,
              error_message: errors.length > 0
                ? errors.join(" | ").slice(0, 500)
                : null,
            })
            .eq("id", campaign.id);

          perCampaign.push({ id: campaign.id, delivered, failed, status });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : String(err);
          console.error(`Campaign ${campaign.id} dispatch error:`, message);
          await supabase
            .from("newsletter_campaigns")
            .update({
              status: "failed",
              error_message: message.slice(0, 500),
            })
            .eq("id", campaign.id);
          perCampaign.push({
            id: campaign.id,
            delivered: 0,
            failed: 0,
            status: "failed",
          });
        }
      }

      ctx.processed(totalDelivered);
      ctx.failed(totalFailed);
      ctx.meta({ dispatched: campaigns.length, per_campaign: perCampaign });
      return {
        dispatched: campaigns.length,
        delivered: totalDelivered,
        failed: totalFailed,
        per_campaign: perCampaign,
      };
    }, { maxAttempts: 1 });

    return new Response(
      JSON.stringify({ ok: job.ok, ...(job.result ?? {}) }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("dispatch-scheduled-newsletters error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

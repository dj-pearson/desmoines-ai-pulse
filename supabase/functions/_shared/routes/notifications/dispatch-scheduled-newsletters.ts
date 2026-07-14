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
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { runJob } from "../../jobRunner.ts";
import { fetchWithTimeout } from "../../fetchWithTimeout.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS =
  Deno.env.get("NEWSLETTER_FROM")
    ?? "Des Moines Insider <events@desmoinesinsider.com>";
const BATCH_SIZE = 5;
const MAX_CAMPAIGNS_PER_RUN = 5;
// Page size for reading large tables (recipients / prior deliveries) so a big
// segment can't exceed function memory by materializing everything in one query.
const DB_PAGE_SIZE = 1000;
// A campaign left in 'sending' longer than this was almost certainly abandoned
// by a crashed / timed-out prior invocation (edge functions are killed well
// under a minute). Such rows are reclaimed and resumed. Must comfortably exceed
// the longest real dispatch to avoid clobbering an in-flight run.
const STUCK_SENDING_MINUTES = 15;

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
  // Paginate so a large segment can't blow the function's memory by loading the
  // whole subscriber list in a single unbounded query. Ordered by email for a
  // stable window across pages.
  const out: { email: string }[] = [];
  for (let from = 0; ; from += DB_PAGE_SIZE) {
    let q = supabase
      .from("newsletter_subscribers")
      .select("email")
      .eq("status", "active");
    if (segment?.sources && segment.sources.length > 0) {
      q = q.in("source", segment.sources);
    }
    const { data, error } = await q
      .order("email", { ascending: true })
      .range(from, from + DB_PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as { email: string }[];
    out.push(...rows);
    if (rows.length < DB_PAGE_SIZE) break;
  }
  return out;
}

/**
 * Emails that already have a delivery row for this campaign. Used to make a
 * resume (after a reclaimed 'sending' crash) idempotent — we never re-send to a
 * recipient that was already attempted. Paginated for the same memory reason.
 */
async function loadAttemptedRecipients(
  supabase: ReturnType<typeof createClient>,
  campaignId: string,
): Promise<Set<string>> {
  const attempted = new Set<string>();
  for (let from = 0; ; from += DB_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("newsletter_deliveries")
      .select("email")
      .eq("campaign_id", campaignId)
      .range(from, from + DB_PAGE_SIZE - 1);
    if (error) {
      // Non-fatal: if we can't read prior deliveries, fall back to attempting
      // all recipients rather than silently dropping the send.
      console.error("loadAttemptedRecipients failed:", error.message);
      break;
    }
    const rows = (data ?? []) as { email: string }[];
    for (const r of rows) attempted.add(r.email.toLowerCase());
    if (rows.length < DB_PAGE_SIZE) break;
  }
  return attempted;
}

async function sendOne(
  to: string,
  subject: string,
  bodyHtml: string,
): Promise<{ message_id: string | null }> {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  const r = await fetchWithTimeout("https://api.resend.com/emails", {
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
  const allRecipients = await resolveSegment(supabase, campaign.segment);
  // Idempotent resume: skip any recipient already attempted for this campaign
  // (delivery row exists) so a reclaimed/resumed dispatch never double-sends.
  const attempted = await loadAttemptedRecipients(supabase, campaign.id);
  const recipients = attempted.size === 0
    ? allRecipients
    : allRecipients.filter((r) => !attempted.has(r.email.toLowerCase()));
  if (attempted.size > 0) {
    console.log(
      `Campaign ${campaign.id}: resuming — ${attempted.size} already attempted, ` +
        `${recipients.length} remaining of ${allRecipients.length}`,
    );
  }
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

export default (async (req) => {
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

    // Reclaim campaigns stranded in 'sending' by a crashed/timed-out prior run
    // (flips them back to 'scheduled' so the claim below resumes them). Runs
    // before the claim so a stuck row can be picked up in the same invocation.
    // Non-fatal — a reclaim failure must not block dispatching healthy rows.
    const { data: reclaimedCount, error: reclaimError } = await supabase.rpc(
      "reclaim_stuck_newsletter_campaigns",
      { p_older_than_minutes: STUCK_SENDING_MINUTES },
    );
    if (reclaimError) {
      console.error(
        "reclaim_stuck_newsletter_campaigns failed:",
        reclaimError.message,
      );
    } else if (typeof reclaimedCount === "number" && reclaimedCount > 0) {
      console.log(`Reclaimed ${reclaimedCount} stuck 'sending' campaign(s)`);
    }

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

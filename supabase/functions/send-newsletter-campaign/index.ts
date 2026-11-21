/**
 * Send Newsletter Campaign
 *
 * Admin-only one-off newsletter dispatch. Resolves the chosen segment
 * against newsletter_subscribers (status='active'), sends each subscriber
 * their own copy through _shared/email.ts (SES) inside the CAN-SPAM
 * layout with their own unsubscribe token,
 * and writes a newsletter_campaigns row.
 *
 * Actions (POST body { action, ... }):
 *   - preview_count { segment }    → returns recipient count for the segment
 *   - send_test     { subject, preheader, body_html }
 *                                    → sends to the calling admin only
 *   - send_now      { subject, preheader, body_html, segment }
 *                                    → sends in this request up to
 *                                      SEND_NOW_INLINE_LIMIT recipients; above
 *                                      that, queues the campaign as due now and
 *                                      answers { queued: true } straight away
 *   - schedule      { subject, preheader, body_html, segment, scheduled_for }
 *
 * Segment shape: { sources?: string[] }  // [] / undefined = all active
 *
 * Story: ADMIN-EMAIL-002
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  handleCors,
  getCorsHeaders,
  isOriginAllowed,
} from "../_shared/cors.ts";
import { checkRateLimit, addRateLimitHeaders } from "../_shared/rateLimit.ts";
import { sendEmail } from "../_shared/email.ts";
import { newsletterEmail } from "../_shared/emailTemplates.ts";
import { requireAdminOrApiKey, type AdminCaller } from "../_shared/apiKeyAuth.ts";
import {
  DeliveryRecordError,
  dispatchNewsletter,
  type DispatchResult,
  loadAllPages,
  sendNowMode,
} from "../_shared/newsletterDispatch.ts";

const FROM_ADDRESS = Deno.env.get("NEWSLETTER_FROM")
  ?? "Des Moines Insider <events@desmoinesinsider.com>";

interface Segment {
  sources?: string[];
}

interface Recipient {
  email: string;
  first_name: string | null;
  unsubscribe_token: string | null;
}

async function resolveSegment(
  supabase: ReturnType<typeof createClient>,
  segment: Segment,
): Promise<Recipient[]> {
  // Paginated: one unranged select stops at PostgREST's 1000-row cap, so a
  // list past 1000 was counted as 1000 and the rest were never sent to.
  return await loadAllPages<Recipient>(async (from, to) => {
    let q = supabase
      .from("newsletter_subscribers")
      .select("email, first_name, unsubscribe_token")
      .eq("status", "active");
    if (segment.sources && segment.sources.length > 0) {
      q = q.in("source", segment.sources);
    }
    const { data, error } = await q.order("email", { ascending: true }).range(from, to);
    return { data: data as Recipient[] | null, error };
  });
}

async function sendOne(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  to: { email: string; unsubscribe_token?: string | null },
  subject: string,
  bodyHtml: string,
  preheader: string | null,
  campaignId: string | null,
): Promise<{ message_id: string | null }> {
  const res = await sendEmail(
    newsletterEmail({
      recipient: { email: to.email, unsubscribeToken: to.unsubscribe_token ?? null },
      subject,
      bodyHtml,
      preheader,
      from: FROM_ADDRESS,
      template: campaignId ? "newsletter_campaign" : "newsletter_test",
      ref: campaignId ? { type: "newsletter_campaign", id: campaignId } : null,
    }),
    { supabase },
  );
  if (!res.ok) throw new Error(res.error ?? "send failed");
  // The SES message id, so ses-events can correlate later
  // delivery and engagement events to this recipient.
  return { message_id: res.messageId ?? null };
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(
    isOriginAllowed(origin) ? origin : undefined,
  );

  const rateLimit = checkRateLimit(req, {
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: "Too many newsletter dispatches.",
  });
  if (!rateLimit.success && rateLimit.response) {
    return addRateLimitHeaders(rateLimit.response, rateLimit);
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // WEB-SEC-023: was a hand-rolled gate on profiles.role keyed by the row PK.
    const caller: AdminCaller = { user: null };
    const authFailure = await requireAdminOrApiKey(req, corsHeaders, caller);
    if (authFailure) return authFailure;

    // This function sends a test mail to, and stamps sent_by with, the admin who
    // triggered it — so it needs a person, not a shared key.
    const user = caller.user;
    if (!user) {
      return new Response(
        JSON.stringify({ error: "This endpoint requires an admin user session" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const body = await req.json().catch(() => ({}));
    const action: string = body.action;

    if (action === "preview_count") {
      const segment: Segment = body.segment ?? {};
      const recipients = await resolveSegment(supabase, segment);
      return new Response(
        JSON.stringify({ count: recipients.length }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (action === "send_test") {
      const { subject, body_html, preheader } = body;
      if (!subject || !body_html) {
        return new Response(
          JSON.stringify({ error: "subject and body_html required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (!user.email) {
        return new Response(
          JSON.stringify({ error: "Admin has no email on file" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      await sendOne(supabase, { email: user.email }, `[TEST] ${subject}`, body_html, preheader ?? null, null);
      return new Response(
        JSON.stringify({ ok: true, sent_to: user.email }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (action === "send_now" || action === "schedule") {
      const { subject, preheader, body_html, segment, scheduled_for } = body;
      if (!subject || !body_html) {
        return new Response(
          JSON.stringify({ error: "subject and body_html required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Persist the campaign row first.
      const seg: Segment = segment ?? {};
      const recipients = await resolveSegment(supabase, seg);
      // A large send_now is handed to dispatch-scheduled-newsletters instead
      // of looping inside this request (WEB-ADS-026). It is written exactly
      // like a schedule for now: 'scheduled', due now, unclaimed, so the next
      // cron claim picks it up.
      const queued = action === "send_now" && sendNowMode(recipients.length) === "queue";
      const status =
        action === "schedule" || queued ? "scheduled" : "sending";
      // send_now is stamped as claimed now and due now. If this invocation is
      // killed mid-send, reclaim_stuck_newsletter_campaigns flips the row back
      // to 'scheduled' and claim_scheduled_newsletter_campaigns only picks up
      // rows with a scheduled_for - without one the campaign sat in
      // 'scheduled' forever, half sent. With one, the dispatcher resumes it
      // and skips everyone this run recorded.
      const nowIso = new Date().toISOString();
      const { data: campaign, error: insertError } = await supabase
        .from("newsletter_campaigns")
        .insert({
          subject,
          preheader: preheader ?? null,
          body_html,
          segment: seg,
          status,
          scheduled_for: action === "schedule" ? scheduled_for : nowIso,
          claimed_at: action === "schedule" || queued ? null : nowIso,
          recipient_count: recipients.length,
          sent_by: user.id,
        })
        .select("id")
        .single();
      if (insertError || !campaign) throw insertError;

      if (action === "schedule") {
        return new Response(
          JSON.stringify({
            ok: true,
            campaign_id: campaign.id,
            scheduled_for,
            recipient_count: recipients.length,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (queued) {
        // Same keys as an inline send_now answer, so a caller that only reads
        // delivered / failed / recipient_count keeps working; queued says the
        // counts are zero because nothing has been sent yet, not because
        // everything failed. 200, not 202: the inline answer is 200 and a
        // client branching on the status should not see a new one.
        return new Response(
          JSON.stringify({
            ok: true,
            queued: true,
            campaign_id: campaign.id,
            scheduled_for: nowIso,
            delivered: 0,
            failed: 0,
            recipient_count: recipients.length,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // send_now - dispatch and tally outcomes. EMAIL-WEBHOOK-001: one
      // newsletter_deliveries row per recipient with the SES message id
      // (column resend_message_id) so ses-events can correlate engagement
      // events back to this campaign. dispatchNewsletter writes them after
      // every batch, so a run killed part-way leaves a record a resume can
      // skip; a failed write stops the send (see _shared/newsletterDispatch.ts).
      let result: DispatchResult;
      try {
        result = await dispatchNewsletter({
          campaignId: campaign.id,
          recipients,
          attempted: new Map(),
          batchSize: 5, // stay under the provider's send rate
          send: (r) => sendOne(supabase, r, subject, body_html, preheader ?? null, campaign.id),
          recordDeliveries: async (rows) => {
            const { error } = await supabase.from("newsletter_deliveries").insert(rows);
            return { error: error ? error.message : null };
          },
        });
      } catch (err) {
        if (!(err instanceof DeliveryRecordError)) throw err;
        await supabase
          .from("newsletter_campaigns")
          .update({
            status: "failed",
            delivered: err.delivered,
            failed: err.failed,
            error_message: err.message.slice(0, 500),
          })
          .eq("id", campaign.id);
        throw err;
      }
      const { delivered, failed, errors } = result;

      const finalStatus = failed === 0
        ? "sent"
        : delivered === 0
          ? "failed"
          : "sent"; // partial still marked sent; failure count tracked
      await supabase
        .from("newsletter_campaigns")
        .update({
          status: finalStatus,
          sent_at: new Date().toISOString(),
          delivered,
          failed,
          error_message: errors.length > 0 ? errors.join(" | ") : null,
        })
        .eq("id", campaign.id);

      return new Response(
        JSON.stringify({
          ok: true,
          campaign_id: campaign.id,
          delivered,
          failed,
          recipient_count: recipients.length,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("send-newsletter-campaign error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

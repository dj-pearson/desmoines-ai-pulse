/**
 * Send Newsletter Campaign
 *
 * Admin-only one-off newsletter dispatch. Resolves the chosen segment
 * against newsletter_subscribers (status='active'), sends via Resend,
 * and writes a newsletter_campaigns row.
 *
 * Actions (POST body { action, ... }):
 *   - preview_count { segment }    → returns recipient count for the segment
 *   - send_test     { subject, preheader, body_html }
 *                                    → sends to the calling admin only
 *   - send_now      { subject, preheader, body_html, segment }
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
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS = Deno.env.get("NEWSLETTER_FROM")
  ?? "Des Moines Insider <events@desmoinesinsider.com>";
const ADMIN_ROLES = ["admin", "root_admin"] as const;

interface Segment {
  sources?: string[];
}

async function resolveSegment(
  supabase: ReturnType<typeof createClient>,
  segment: Segment,
): Promise<{ email: string; first_name: string | null }[]> {
  let q = supabase
    .from("newsletter_subscribers")
    .select("email, first_name")
    .eq("status", "active");
  if (segment.sources && segment.sources.length > 0) {
    q = q.in("source", segment.sources);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as { email: string; first_name: string | null }[];
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
  // Resend returns { id } on success; capture it so the webhook can
  // correlate later engagement events to this recipient.
  const body = await r.json().catch(() => ({} as { id?: string }));
  return { message_id: typeof body.id === "string" ? body.id : null };
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Auth required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } =
      await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (
      !profile ||
      !ADMIN_ROLES.includes(profile.role as typeof ADMIN_ROLES[number])
    ) {
      return new Response(JSON.stringify({ error: "Admin required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      const { subject, body_html } = body;
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
      await sendOne(user.email, `[TEST] ${subject}`, body_html);
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
      const status =
        action === "schedule" ? "scheduled" : "sending";
      const { data: campaign, error: insertError } = await supabase
        .from("newsletter_campaigns")
        .insert({
          subject,
          preheader: preheader ?? null,
          body_html,
          segment: seg,
          status,
          scheduled_for: action === "schedule" ? scheduled_for : null,
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

      // send_now — dispatch and tally outcomes. EMAIL-WEBHOOK-001: also
      // record one newsletter_deliveries row per recipient with the
      // Resend message_id so the resend-webhook can correlate
      // subsequent engagement events back to this campaign.
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
      // Cap concurrency to be polite to Resend.
      const batchSize = 5;
      for (let i = 0; i < recipients.length; i += batchSize) {
        const batch = recipients.slice(i, i + batchSize);
        const settled = await Promise.allSettled(
          batch.map((r) => sendOne(r.email, subject, body_html)),
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
          // Don't fail the whole send — the deliveries table is for
          // tracking only; the actual emails already went out.
        }
      }

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

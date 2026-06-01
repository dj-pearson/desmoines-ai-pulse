/**
 * Resend Webhook
 *
 * Receives email engagement events from Resend (delivered / opened /
 * clicked / bounced / complained), verifies the Svix signature with
 * RESEND_WEBHOOK_SECRET, updates the matching newsletter_deliveries
 * row by resend_message_id, and bumps the parent campaign counter.
 *
 * SECURITY: verify_jwt = false
 * Reason: webhook receiver. Authentication is via the Svix signature
 * headers Resend sends.
 *
 * Configuration:
 *   - In the Resend dashboard, add a webhook pointing at
 *     https://<project>.functions.supabase.co/resend-webhook
 *   - Copy the signing secret into Supabase as RESEND_WEBHOOK_SECRET
 *   - Subscribe to email.delivered / email.opened / email.clicked /
 *     email.bounced / email.complained
 *
 * Story: EMAIL-WEBHOOK-001
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Webhook } from "https://esm.sh/svix@1.24.0";

const WEBHOOK_SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET");

interface ResendEvent {
  type: string;
  created_at: string;
  data: {
    email_id?: string;
    to?: string[] | string;
    [key: string]: unknown;
  };
}

// Maps the Resend event type to (delivery status, campaign counter field).
const EVENT_MAP: Record<
  string,
  { status: string; counter: string } | undefined
> = {
  "email.delivered": { status: "delivered", counter: "delivered" },
  "email.opened":    { status: "opened",    counter: "opens" },
  "email.clicked":   { status: "clicked",   counter: "clicks" },
  "email.bounced":   { status: "bounced",   counter: "bounces" },
  "email.complained":{ status: "complained",counter: "complaints" },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!WEBHOOK_SECRET) {
    console.error("RESEND_WEBHOOK_SECRET not configured");
    return new Response(
      JSON.stringify({ error: "Webhook not configured" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Resend uses Svix for signing. Validate the headers.
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response(
      JSON.stringify({ error: "Missing svix signature headers" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const rawBody = await req.text();
  let event: ResendEvent;
  try {
    const wh = new Webhook(WEBHOOK_SECRET);
    event = wh.verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ResendEvent;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("Svix signature verification failed:", message);
    return new Response(JSON.stringify({ error: "Bad signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const mapping = EVENT_MAP[event.type];
  if (!mapping) {
    // Acknowledge unknown event types — Resend may add new ones we
    // don't care about. Returning 200 prevents retry storms.
    return new Response(JSON.stringify({ ok: true, ignored: event.type }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const messageId = event.data.email_id;
  if (!messageId) {
    return new Response(
      JSON.stringify({ ok: false, error: "No email_id in event" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Look up the delivery row to discover the campaign + flip status.
    const { data: existing, error: lookupError } = await supabase
      .from("newsletter_deliveries")
      .select("id, campaign_id, status")
      .eq("resend_message_id", messageId)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!existing) {
      // Message id we don't recognize — likely a transactional email
      // from a different sender. Acknowledge and move on.
      return new Response(
        JSON.stringify({ ok: true, ignored: "unknown message_id" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Update the delivery row, retaining the "highest" status seen.
    // (clicked > opened > delivered > queued; bounced/complained are
    // terminal failure states.)
    const statusRank: Record<string, number> = {
      queued: 0,
      delivered: 1,
      opened: 2,
      clicked: 3,
      bounced: 4,
      complained: 5,
    };
    const nextRank = statusRank[mapping.status] ?? 0;
    const prevRank = statusRank[existing.status as string] ?? 0;
    const newStatus = nextRank >= prevRank ? mapping.status : existing.status;

    await supabase
      .from("newsletter_deliveries")
      .update({
        status: newStatus,
        event_at: event.created_at ?? new Date().toISOString(),
      })
      .eq("id", existing.id);

    // Bump the campaign-level counter. Open/click events can fire
    // multiple times per recipient; we tally every occurrence.
    await supabase.rpc("bump_newsletter_campaign_counter", {
      p_campaign_id: existing.campaign_id,
      p_field: mapping.counter,
    });

    return new Response(
      JSON.stringify({ ok: true, type: event.type }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("resend-webhook handler error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

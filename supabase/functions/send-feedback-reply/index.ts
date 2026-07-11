/**
 * Send Feedback Reply
 *
 * Admin-only. Given a contact_submission id and HTML body, sends an
 * email to the submitter via Resend, records a feedback_replies row,
 * and flips the parent submission to status='responded' (stamping
 * responded_at if blank).
 *
 * Story: FEEDBACK-REPLY-001
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
const SUPPORT_FROM =
  Deno.env.get("SUPPORT_FROM")
    ?? Deno.env.get("NEWSLETTER_FROM")
    ?? "Des Moines Insider <support@desmoinesinsider.com>";
const ADMIN_ROLES = ["admin", "root_admin"] as const;

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(
    isOriginAllowed(origin) ? origin : undefined,
  );

  const rateLimit = checkRateLimit(req, {
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: "Too many support replies.",
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
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

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

    const { submission_id, body_html } = await req.json().catch(() => ({}));
    if (!submission_id || !body_html) {
      return new Response(
        JSON.stringify({ error: "submission_id and body_html required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: submission, error: lookupError } = await supabase
      .from("contact_submissions")
      .select("id, name, email, subject, status, responded_at")
      .eq("id", submission_id)
      .single();
    if (lookupError || !submission) {
      return new Response(
        JSON.stringify({ error: "Submission not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const replySubject = submission.subject?.startsWith("Re:")
      ? submission.subject
      : `Re: ${submission.subject ?? "Your message to Des Moines Insider"}`;

    const r = await fetchWithTimeout("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: SUPPORT_FROM,
        to: [submission.email],
        subject: replySubject,
        html: body_html,
      }),
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Resend ${r.status}: ${text.slice(0, 200)}`);
    }
    const sendResp = await r.json().catch(() => ({} as { id?: string }));
    const messageId = typeof sendResp.id === "string" ? sendResp.id : null;

    const { error: insertError } = await supabase
      .from("feedback_replies")
      .insert({
        submission_id,
        direction: "admin_to_user",
        body_html,
        sent_by: user.id,
        resend_message_id: messageId,
      });
    if (insertError) throw insertError;

    // Flip the parent submission to responded if not already.
    const patch: Record<string, unknown> = { status: "responded" };
    if (!submission.responded_at) {
      patch.responded_at = new Date().toISOString();
    }
    await supabase
      .from("contact_submissions")
      .update(patch)
      .eq("id", submission_id);

    return new Response(
      JSON.stringify({ ok: true, message_id: messageId }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("send-feedback-reply error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

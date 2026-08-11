/**
 * Process Stripe Refund
 *
 * Processes refunds for campaign payments through Stripe.
 * Admin-only function with audit trail.
 *
 * Security:
 * - Requires admin authentication
 * - Rate limited
 * - Creates audit trail
 * - Validates refund amounts
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { checkRateLimit, addRateLimitHeaders } from "../_shared/rateLimit.ts";
import { requireAdminOrApiKey, type AdminCaller } from "../_shared/apiKeyAuth.ts";

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Get origin for CORS headers
  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);

  // Rate limiting (strict - 5 refunds per 15 minutes)
  const rateLimit = checkRateLimit(req, {
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: "Too many refund attempts. Please try again later.",
  });

  if (!rateLimit.success && rateLimit.response) {
    return addRateLimitHeaders(rateLimit.response, rateLimit);
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // WEB-SEC-023: was a hand-rolled gate on profiles.role keyed by the row PK.
    const caller: AdminCaller = { user: null };
    const authFailure = await requireAdminOrApiKey(req, corsHeaders, caller);
    if (authFailure) return authFailure;

    // A refund is audited against the admin who issued it, so this endpoint
    // needs a person rather than a shared key.
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

    // Parse request body
    const body = await req.json();
    const {
      campaignId,
      amount,
      reason,
      policyViolation,
      refundReason,
      refundReasonNotes,
    } = body;

    if (!campaignId) {
      return new Response(JSON.stringify({ error: "Campaign ID is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!reason) {
      return new Response(JSON.stringify({ error: "Refund reason is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ADMIN-REFUND-001: enforce structured taxonomy alongside free-text reason.
    const ALLOWED_REASONS = [
      "duplicate_charge",
      "user_request",
      "campaign_cancelled",
      "fraud",
      "technical_issue",
      "content_takedown",
      "accidental_purchase",
      "other",
    ];
    if (!refundReason || !ALLOWED_REASONS.includes(refundReason)) {
      return new Response(
        JSON.stringify({
          error: "Structured refund_reason is required",
          allowed: ALLOWED_REASONS,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get campaign with payment details
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!campaign.stripe_payment_intent_id) {
      return new Response(
        JSON.stringify({ error: "No payment found for this campaign" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate refund amount
    const refundAmount = amount || campaign.total_cost;
    if (refundAmount <= 0 || refundAmount > campaign.total_cost) {
      return new Response(
        JSON.stringify({
          error: `Invalid refund amount. Maximum refundable: $${campaign.total_cost}`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // Generate a STABLE idempotency key to prevent duplicate refunds (SEC-027).
    // It must NOT include a timestamp: if the edge function times out and the
    // request is retried, a time-based key would change and Stripe would treat
    // the retry as a brand-new refund (double refund). Deriving the key from
    // stable request attributes (payment intent + amount in cents + reason)
    // makes identical retries collapse to a single Stripe refund, while a
    // genuinely different refund (different amount/reason) gets its own key.
    const refundAmountCents = Math.round(refundAmount * 100);
    const idempotencyKey = `refund_${campaign.stripe_payment_intent_id}_${refundAmountCents}_${refundReason}`;
    console.log(`Processing refund with idempotency key: ${idempotencyKey}`);

    // Create refund in Stripe
    const refund = await stripe.refunds.create({
      payment_intent: campaign.stripe_payment_intent_id,
      amount: Math.round(refundAmount * 100), // Convert to cents
      reason: policyViolation ? "fraudulent" : "requested_by_customer",
      metadata: {
        campaignId,
        adminUserId: user.id,
        reason,
        policyViolation: policyViolation || "none",
        idempotencyKey,
      },
    }, {
      idempotencyKey,
    });

    // Create refund record in database
    const { error: refundRecordError } = await supabase.from("refunds").insert({
      campaign_id: campaignId,
      admin_user_id: user.id,
      amount: refundAmount,
      reason,
      policy_violation: policyViolation || null,
      status: refund.status === "succeeded" ? "completed" : "pending",
      stripe_refund_id: refund.id,
      refund_reason: refundReason ?? "other",
      refund_reason_notes: refundReasonNotes ?? null,
    });

    // ADMIN-REFUND-001: structured audit log for finance reporting.
    await supabase.from("security_audit_logs").insert({
      event_type: "admin_action",
      identifier: user.email ?? user.id,
      severity: "low",
      action: "refund:process",
      resource: `campaigns:${campaignId}`,
      user_id: user.id,
      details: {
        amount: refundAmount,
        refund_reason: refundReason ?? "other",
        refund_reason_notes: refundReasonNotes ?? null,
        stripe_refund_id: refund.id,
      },
    });

    if (refundRecordError) {
      console.error("Failed to create refund record:", refundRecordError);
      // Continue anyway - the Stripe refund was successful
    }

    // Update campaign status
    const { error: updateError } = await supabase
      .from("campaigns")
      .update({
        status: "refunded",
      })
      .eq("id", campaignId);

    if (updateError) {
      console.error("Failed to update campaign status:", updateError);
    }

    const response = new Response(
      JSON.stringify({
        success: true,
        refundId: refund.id,
        status: refund.status,
        amount: refundAmount,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

    return addRateLimitHeaders(response, rateLimit);
  } catch (error) {
    console.error("Refund error:", error);

    // Handle Stripe-specific errors
    if (error.type === "StripeCardError" || error.type === "StripeInvalidRequestError") {
      return new Response(
        JSON.stringify({
          error: "Payment processor error",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        error: "Failed to process refund",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

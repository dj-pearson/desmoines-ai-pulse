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

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body = await req.json();
    const { campaignId, amount, reason, policyViolation } = body;

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
      },
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
          error: error.message || "Payment processor error",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        error: error.message || "Failed to process refund",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

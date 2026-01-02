/**
 * Verify Campaign Payment
 *
 * Verifies the payment status of a campaign checkout session with Stripe.
 * Called after user returns from Stripe checkout.
 *
 * Security:
 * - Requires authenticated user
 * - Uses environment-aware CORS
 * - Rate limited
 * - Validates campaign ownership
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

  // Rate limiting (20 verification attempts per 15 minutes)
  const rateLimit = checkRateLimit(req, {
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: "Too many verification attempts. Please try again later.",
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
      return new Response(JSON.stringify({ error: "User not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body = await req.json();
    const { campaignId } = body;

    if (!campaignId) {
      return new Response(JSON.stringify({ error: "Campaign ID is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get campaign with stripe session - must belong to authenticated user
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .eq("user_id", user.id)
      .single();

    if (campaignError || !campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!campaign.stripe_session_id) {
      return new Response(
        JSON.stringify({ error: "No payment session found for this campaign" }),
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

    // Check payment status with Stripe
    const session = await stripe.checkout.sessions.retrieve(campaign.stripe_session_id);

    if (session.payment_status === "paid") {
      // Update campaign status if not already updated (webhook might have done it)
      if (campaign.status === "pending_payment") {
        const { error: updateError } = await supabase
          .from("campaigns")
          .update({
            status: "pending_creative",
            stripe_payment_intent_id: session.payment_intent as string,
          })
          .eq("id", campaignId);

        if (updateError) {
          console.error("Failed to update campaign:", updateError);
        }
      }

      const response = new Response(
        JSON.stringify({
          paid: true,
          status: "pending_creative",
          campaignId,
          nextStep: "Upload your creative assets",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );

      return addRateLimitHeaders(response, rateLimit);
    }

    // Payment not complete
    const response = new Response(
      JSON.stringify({
        paid: false,
        status: campaign.status,
        paymentStatus: session.payment_status,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

    return addRateLimitHeaders(response, rateLimit);
  } catch (error) {
    console.error("Verification error:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to verify payment",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

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
import { paymentRecordFromSession, type CheckoutSessionLike } from "../_shared/campaignPayment.ts";

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

    // The session must be THIS campaign's. create-campaign-checkout stamps
    // metadata.campaignId on every session it creates; a stored id that
    // points at some other session (a stale write, a hand edit, a row copied
    // by renew) must not mark this campaign paid on the strength of another
    // one's payment.
    if (session.metadata?.campaignId !== campaignId) {
      console.error("[verify-campaign-payment] session does not belong to campaign", {
        campaignId,
        sessionCampaignId: session.metadata?.campaignId ?? null,
      });
      return new Response(
        JSON.stringify({ error: "This payment session is not for this campaign", code: "SESSION_MISMATCH" }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // What was actually charged, after any promotion code
    // (create-campaign-checkout sets allow_promotion_codes), so the success
    // page can show it instead of the list price. Stripe amounts are cents.
    const amountPaid = typeof session.amount_total === "number" ? session.amount_total / 100 : null;

    if (session.payment_status === "paid") {
      // Update campaign status if not already updated (webhook might have done it).
      // Scoped to pending_payment in the write itself, so a webhook that got
      // there first is not overwritten.
      // WP3 item 10: the status in the answer is the row's, not a constant.
      // This said "pending_creative" for a campaign that was already active,
      // paused, cancelled or refunded, because it never looked.
      let currentStatus: string = campaign.status;
      if (campaign.status === "pending_payment") {
        const { data: advanced, error: updateError } = await supabase
          .from("campaigns")
          .update({
            status: "pending_creative",
            stripe_payment_intent_id: session.payment_intent as string,
          })
          .eq("id", campaignId)
          .eq("status", "pending_payment")
          .select("status");

        if (updateError) {
          console.error("Failed to update campaign:", updateError);
        } else if (advanced && advanced.length > 0) {
          currentStatus = advanced[0].status as string;
        } else {
          // The webhook moved it between our read and our write.
          const { data: fresh } = await supabase
            .from("campaigns")
            .select("status")
            .eq("id", campaignId)
            .maybeSingle();
          if (fresh?.status) currentStatus = fresh.status as string;
        }
      }

      // WP6 item 3, the same record the webhook writes, in case this call
      // gets there first. Amounts only: they are the same whoever writes them,
      // while the promotion code needs a lookup the webhook does, and writing
      // the bare id here could overwrite the code it resolved. Best effort
      // until 20261003000001 is applied.
      const { amount_paid_cents, amount_discount_cents } = paymentRecordFromSession(
        session as unknown as CheckoutSessionLike,
      );
      const { error: recordError } = await supabase
        .from("campaigns")
        .update({ amount_paid_cents, amount_discount_cents })
        .eq("id", campaignId)
        .eq("stripe_session_id", session.id);
      if (recordError) {
        console.warn("[verify-campaign-payment] amounts not recorded:", recordError.message);
      }

      const response = new Response(
        JSON.stringify({
          paid: true,
          status: currentStatus,
          campaignId,
          amountPaid,
          // Still a string, for any shipped reader. Only an unstarted paid
          // campaign needs a creative next; anything else is past that step.
          nextStep: currentStatus === "pending_creative" ? "Upload your creative assets" : "View your campaign",
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
        error: error instanceof Error ? error.message : "Failed to verify payment",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

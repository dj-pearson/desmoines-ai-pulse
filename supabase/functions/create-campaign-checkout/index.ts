/**
 * Create Campaign Checkout Session
 *
 * Creates a Stripe Checkout session for advertising campaign payments (one-time).
 *
 * Security:
 * - Requires authenticated user
 * - Uses environment-aware CORS
 * - Rate limited to prevent abuse
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

  // Rate limiting (10 checkout attempts per 15 minutes)
  const rateLimit = checkRateLimit(req, {
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: "Too many checkout attempts. Please try again later.",
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

    // Get campaign details - must belong to authenticated user
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select(`
        *,
        campaign_placements (*)
      `)
      .eq("id", campaignId)
      .eq("user_id", user.id)
      .single();

    if (campaignError || !campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate campaign status
    if (campaign.status !== "draft" && campaign.status !== "pending_payment") {
      return new Response(
        JSON.stringify({ error: "Campaign is not in a payable state" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate campaign has placements
    if (!campaign.campaign_placements || campaign.campaign_placements.length === 0) {
      return new Response(
        JSON.stringify({ error: "Campaign has no placements" }),
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

    // Check for existing customer
    const customers = await stripe.customers.list({
      email: user.email!,
      limit: 1,
    });

    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    // Create line items from placements
    const placementLabels: Record<string, string> = {
      top_banner: "Top Banner Ad",
      featured_spot: "Featured Spot Ad",
      below_fold: "Below the Fold Ad",
    };

    const lineItems = campaign.campaign_placements.map((placement: {
      placement_type: string;
      days_count: number;
      total_cost: number;
    }) => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: placementLabels[placement.placement_type] || "Ad Placement",
          description: `${placement.days_count} days of advertising on Des Moines Insider`,
          metadata: {
            placement_type: placement.placement_type,
            days_count: placement.days_count.toString(),
          },
        },
        unit_amount: Math.round(placement.total_cost * 100), // Convert to cents
      },
      quantity: 1,
    }));

    // Build success and cancel URLs
    const siteUrl = Deno.env.get("VITE_SITE_URL") || req.headers.get("origin") || "";
    const successUrl = `${siteUrl}/advertise/success?campaign_id=${campaignId}`;
    const cancelUrl = `${siteUrl}/advertise/cancel?campaign_id=${campaignId}`;

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: lineItems,
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        campaignId,
        userId: user.id,
        campaignName: campaign.name,
      },
      // Payment intent data for refunds
      payment_intent_data: {
        metadata: {
          campaignId,
          userId: user.id,
        },
      },
      // Allow promotion codes
      allow_promotion_codes: true,
      // Billing address for receipts
      billing_address_collection: "auto",
      // Expiration (30 minutes)
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    // Update campaign with stripe session
    const { error: updateError } = await supabase
      .from("campaigns")
      .update({
        stripe_session_id: session.id,
        status: "pending_payment",
      })
      .eq("id", campaignId);

    if (updateError) {
      console.error("Failed to update campaign:", updateError);
      // Continue anyway - the checkout session was created
    }

    const response = new Response(
      JSON.stringify({
        url: session.url,
        sessionId: session.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

    return addRateLimitHeaders(response, rateLimit);
  } catch (error) {
    console.error("Checkout error:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to create checkout session",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

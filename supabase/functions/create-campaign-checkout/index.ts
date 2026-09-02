/**
 * Create Campaign Checkout Session
 *
 * Creates a Stripe Checkout session for advertising campaign payments (one-time).
 *
 * Security Layers Applied:
 * - Layer 1 (Authentication): Validates JWT token via securityMiddleware
 * - Layer 2 (Authorization): Requires 'campaigns.update.own' permission
 * - Layer 3 (Ownership): Validates campaign belongs to authenticated user
 * - Layer 4 (RLS): Database policies enforce final security
 *
 * Additional:
 * - Environment-aware CORS
 * - Rate limited to prevent abuse
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { checkRateLimit, addRateLimitHeaders } from "../_shared/rateLimit.ts";
import {
  securityMiddleware,
  securityErrorResponse,
  logSecurityEvent,
  type SecurityContext,
} from "../_shared/securityLayers.ts";

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

    // Parse request body first to get campaignId for security checks
    const body = await req.json();
    const { campaignId } = body;

    if (!campaignId) {
      return new Response(JSON.stringify({ error: "Campaign ID is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // =========================================================================
    // SECURITY LAYERS CHECK
    // =========================================================================
    // Layer 1: Authentication - Validate JWT token
    // Layer 2: Authorization - Check 'campaigns.update.own' permission
    // Layer 3: Ownership - Verify user owns the campaign
    // =========================================================================
    const { context, result: securityResult } = await securityMiddleware(req, supabase, {
      requireAuth: true,
      permission: 'campaigns.update.own',
      ownership: {
        tableName: 'campaigns',
        resourceId: campaignId,
        ownerColumn: 'user_id',
        adminBypass: false, // Users must own their own campaigns for checkout
      },
    });

    if (!securityResult.allowed) {
      // Log the security denial
      await logSecurityEvent(supabase, {
        eventType: 'permission_denied',
        userId: context.userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        resourceType: 'campaign',
        resourceId: campaignId,
        securityLayer: securityResult.deniedByLayer,
        errorCode: securityResult.errorCode,
        metadata: { action: 'create_checkout' },
      });

      return securityErrorResponse(securityResult);
    }

    // Security passed - user is authenticated, authorized, and owns the campaign
    const user = { id: context.userId!, email: context.email };

    // PROD-AUTH-002: require a verified email before taking payment, enforced
    // server-side. securityMiddleware validated the JWT; re-read the user to
    // confirm email verification.
    const verifyToken = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: { user: authedUser } } = await supabase.auth.getUser(verifyToken);
    if (!authedUser?.email_confirmed_at) {
      return new Response(
        JSON.stringify({
          error: "Please verify your email address before paying.",
          code: "email_verification_required",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get campaign details (ownership already verified by security middleware)
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select(`
        *,
        campaign_placements (*)
      `)
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      // This shouldn't happen since ownership was verified, but handle it anyway
      // (could be a race condition or database error)
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Layer 4: RLS - Final enforcement happens automatically in subsequent queries

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
      sponsored_listing: "Sponsored Listing",
    };

    // WEB-ADS-003 — WHAT STRIPE IS ASKED FOR IS COMPUTED HERE, NOT READ.
    //
    // The amount used to be read straight off the stored placement row, which
    // the browser had written into a table with no RLS policy in any migration.
    // PATCHing that column to 0.01 before opening checkout was all it took to
    // buy a campaign for a cent.
    //
    // Every amount below now comes from calculate_campaign_pricing() against
    // the live rate card, for the days the campaign actually runs. days_count
    // is derived from the campaign's own dates rather than trusted: they were
    // independent numbers, and get_active_ads serves on the DATES, so a 30-day
    // campaign could be paid for as seven.
    const startDate = campaign.start_date ? new Date(campaign.start_date) : null;
    const endDate = campaign.end_date ? new Date(campaign.end_date) : null;
    let authoritativeDays: number | null = null;
    if (startDate && endDate) {
      const spanMs = endDate.getTime() - startDate.getTime();
      authoritativeDays = Math.round(spanMs / 86_400_000) + 1;
      if (!Number.isFinite(authoritativeDays) || authoritativeDays < 1) {
        return new Response(
          JSON.stringify({ error: "Campaign end date is before its start date." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const priced: Array<{ placement_type: string; days: number; total: number }> = [];
    for (const placement of campaign.campaign_placements) {
      const days = authoritativeDays ?? placement.days_count ?? 1;
      const { data: pricing, error: pricingError } = await supabase.rpc(
        "calculate_campaign_pricing",
        { p_placement_type: placement.placement_type, p_days_count: days },
      );

      if (pricingError || !pricing || pricing.length === 0) {
        console.error("[create-campaign-checkout] pricing lookup failed", pricingError);
        return new Response(
          JSON.stringify({ error: "Could not price this campaign. Please try again." }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      priced.push({
        placement_type: placement.placement_type,
        days,
        total: Number(pricing[0].total_price),
      });
    }

    const authoritativeTotal = priced.reduce((sum, p) => sum + p.total, 0);
    const storedTotal = campaign.campaign_placements.reduce(
      (sum: number, p: { total_cost: number | null }) => sum + Number(p.total_cost ?? 0),
      0,
    );

    // A disagreement is either tampering or a rate-card change since the
    // campaign was drafted. Both mean the buyer should see the price again
    // before paying, so neither is charged silently. One cent of tolerance
    // absorbs float noise, nothing more.
    if (Math.abs(authoritativeTotal - storedTotal) > 0.01) {
      console.warn("[create-campaign-checkout] stored total rejected", {
        campaignId,
        storedTotal,
        authoritativeTotal,
      });
      return new Response(
        JSON.stringify({
          error: "PRICE_CHANGED",
          message:
            "The price of this campaign has changed since it was created. Please review the updated total and try again.",
          storedTotal,
          currentTotal: authoritativeTotal,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Persist what we are about to charge, so the row, the invoice and the
    // Stripe session cannot drift apart afterwards.
    for (const p of priced) {
      await supabase
        .from("campaign_placements")
        .update({ days_count: p.days, total_cost: p.total })
        .eq("campaign_id", campaignId)
        .eq("placement_type", p.placement_type);
    }

    const lineItems = priced.map((p) => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: placementLabels[p.placement_type] || "Ad Placement",
          description: `${p.days} days of advertising on Des Moines Insider`,
          metadata: {
            placement_type: p.placement_type,
            days_count: p.days.toString(),
          },
        },
        unit_amount: Math.round(p.total * 100), // Convert to cents
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
        error: "Failed to create checkout session",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

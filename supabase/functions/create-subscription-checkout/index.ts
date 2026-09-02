/**
 * Create Subscription Checkout Session
 *
 * Creates a Stripe Checkout session for consumer subscriptions (Insider/VIP plans).
 * Supports both monthly and yearly billing with optional trial periods.
 *
 * Security:
 * - Requires authenticated user
 * - Uses environment-aware CORS
 * - Rate limited to prevent abuse
 * - Validates plan existence in database
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

  // Rate limiting (stricter for checkout - 10 requests per 15 minutes)
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
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PROD-AUTH-002: require a verified email before a paid checkout, enforced
    // server-side (not just by the signup UI) so an unverified session cannot
    // start a subscription.
    if (!user.email_confirmed_at) {
      return new Response(
        JSON.stringify({
          error: "Please verify your email address before subscribing.",
          code: "email_verification_required",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body = await req.json();
    const { planId, billingInterval = "monthly" } = body;

    if (!planId) {
      return new Response(JSON.stringify({ error: "Plan ID is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["monthly", "yearly"].includes(billingInterval)) {
      return new Response(JSON.stringify({ error: "Invalid billing interval" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get plan details from database
    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("id", planId)
      .eq("is_active", true)
      .single();

    if (planError || !plan) {
      return new Response(JSON.stringify({ error: "Plan not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate plan is not free
    if (plan.name === "free") {
      return new Response(JSON.stringify({ error: "Cannot purchase free plan" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the appropriate Stripe price ID
    const stripePriceId = billingInterval === "yearly"
      ? plan.stripe_price_id_yearly
      : plan.stripe_price_id_monthly;

    if (!stripePriceId) {
      console.error(`No Stripe price ID configured for plan ${plan.name} (${billingInterval})`);
      return new Response(
        JSON.stringify({
          error: "Payment not configured for this plan. Please contact support.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    const siteUrl = Deno.env.get("VITE_SITE_URL") || req.headers.get("origin") || "";

    // WEB-FEAT-013 — THE GUARDS USED TO EVAPORATE FOR THE USERS WHO MOST NEEDED
    // THEM.
    //
    // This lookup was .in("status", [...]).single(), with no platform filter. A
    // user may legitimately hold one row PER PLATFORM -- useSubscription and
    // SubscriptionPortal are built around exactly that -- so a subscriber with a
    // web row and an iOS row matched two rows, .single() returned an error with
    // data null, and BOTH double-charge guards below silently passed. The people
    // most likely to be double-charged were the ones already paying twice.
    //
    // Filtering to the web platform is what makes .maybeSingle() honest: Stripe
    // is the only thing this function can act on, and a store subscription is
    // not ours to modify.
    const { data: webSubscription } = await supabase
      .from("user_subscriptions")
      .select("id, stripe_subscription_id, status, cancel_at_period_end, plan_id")
      .eq("user_id", user.id)
      .eq("platform", "web")
      .in("status", ["active", "trialing"])
      .maybeSingle();

    // A store subscription cannot be changed from here -- Apple and Google own
    // that billing relationship -- so selling a web plan on top of one at the
    // same or a higher tier is selling a second charge for entitlements the
    // user already has.
    const { data: storeSubscriptions } = await supabase
      .from("user_subscriptions")
      .select("platform, plan_id, subscription_plans!inner(sort_order, display_name)")
      .eq("user_id", user.id)
      .in("platform", ["ios", "android"])
      .in("status", ["active", "trialing"]);

    const requestedRank = Number(plan.sort_order ?? 0);
    const blockingStoreSub = (storeSubscriptions ?? []).find((row) => {
      const rank = Number(
        (row as { subscription_plans?: { sort_order?: number } }).subscription_plans?.sort_order ?? 0,
      );
      return rank >= requestedRank;
    });

    if (blockingStoreSub) {
      const where = blockingStoreSub.platform === "ios" ? "the App Store" : "Google Play";
      return new Response(
        JSON.stringify({
          error:
            `You already subscribe through ${where}. Manage or change that subscription there -- buying here would charge you twice.`,
          code: "store_subscription_active",
          platform: blockingStoreSub.platform,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // PROD-SUB-005: a subscription set to cancel at period end should be
    // RESUMED from the billing portal, not replaced by a second one.
    if (webSubscription?.cancel_at_period_end) {
      return new Response(
        JSON.stringify({
          error:
            "Your subscription is set to cancel at the end of the period. Please resume it from Manage Subscription instead of buying a new one.",
          code: "resume_required",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (webSubscription && webSubscription.plan_id === planId) {
      return new Response(
        JSON.stringify({
          error: "You already have an active subscription to this plan.",
          code: "already_subscribed",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // A DIFFERENT ACTIVE WEB PLAN IS AN UPGRADE, NOT A SECOND PURCHASE.
    //
    // The comment this replaces said cross-tier upgrades were "left to proceed
    // for now", and proceeding meant a second Checkout session and a second
    // Stripe subscription: two live subscriptions, two invoices, every month.
    // Changing the price on the existing subscription is the operation Stripe
    // provides for this, and create_prorations credits the unused part of the
    // old tier against the new one.
    if (webSubscription?.stripe_subscription_id) {
      try {
        const current = await stripe.subscriptions.retrieve(
          webSubscription.stripe_subscription_id
        );
        const itemId = current.items?.data?.[0]?.id;
        if (!itemId) throw new Error("subscription has no items to update");

        // Priced before it is charged, so the answer can be shown to the user
        // rather than discovered on their statement.
        let prorationAmount: number | null = null;
        try {
          const preview = await stripe.invoices.retrieveUpcoming({
            customer: typeof current.customer === "string" ? current.customer : current.customer?.id,
            subscription: webSubscription.stripe_subscription_id,
            subscription_items: [{ id: itemId, price: stripePriceId }],
            subscription_proration_behavior: "create_prorations",
          });
          prorationAmount = typeof preview.amount_due === "number" ? preview.amount_due : null;
        } catch (previewError) {
          // A preview that fails must not block the upgrade itself; the user
          // simply does not get the figure up front.
          console.warn("[create-subscription-checkout] proration preview failed", previewError);
        }

        const updated = await stripe.subscriptions.update(
          webSubscription.stripe_subscription_id,
          {
            items: [{ id: itemId, price: stripePriceId }],
            proration_behavior: "create_prorations",
            metadata: {
              userId: user.id,
              planId: planId,
              planName: plan.name,
              changedFromPlanId: webSubscription.plan_id ?? "",
            },
          }
        );

        // The stripe-webhook's customer.subscription.updated handler is what
        // moves the row to the new plan; returning here without waiting keeps
        // one writer for that table.
        return new Response(
          JSON.stringify({
            // Same key the client already redirects on, so no shipped build
            // needs to change to stop double-subscribing.
            url: `${siteUrl}/subscription/success?upgraded=true&plan=${encodeURIComponent(plan.name)}`,
            upgraded: true,
            subscriptionId: updated.id,
            prorationAmount,
            code: "plan_changed",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (upgradeError) {
        console.error("[create-subscription-checkout] plan change failed", upgradeError);
        return new Response(
          JSON.stringify({
            error:
              "We could not change your plan. Please try again, or manage your subscription from the billing portal.",
            code: "plan_change_failed",
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Check for existing Stripe customer
    const customers = await stripe.customers.list({
      email: user.email!,
      limit: 1,
    });

    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    // Build success and cancel URLs (siteUrl is declared above)
    const successUrl = `${siteUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${siteUrl}/pricing?canceled=true`;

    // Create checkout session options
    const sessionOptions: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId: user.id,
        planId: planId,
        planName: plan.name,
        billingInterval,
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          planId: planId,
          planName: plan.name,
        },
        // Add 7-day trial for new subscribers
        trial_period_days: webSubscription ? undefined : 7,
      },
      // Allow promotion codes
      allow_promotion_codes: true,
      // Billing address collection
      billing_address_collection: "auto",
      // Tax ID collection for business customers
      tax_id_collection: {
        enabled: true,
      },
    };

    // The "user already has a subscription" branch that used to sit here only
    // logged a line and fell through to creating a SECOND subscription anyway.
    // WEB-FEAT-013 moved that case above, where it now changes the price on the
    // existing subscription and returns, so anything reaching this point has no
    // active web subscription to update.

    const session = await stripe.checkout.sessions.create(sessionOptions);

    // Return the checkout URL
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

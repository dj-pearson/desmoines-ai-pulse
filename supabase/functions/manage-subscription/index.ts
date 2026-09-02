/**
 * Manage Subscription Edge Function
 *
 * Provides subscription management operations:
 * - Create Stripe Customer Portal session (for payment methods, cancel, etc.)
 * - Cancel subscription
 * - Resume subscription (if canceled but period not ended)
 * - Get subscription details
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

/**
 * Validate returnUrl against allowed domains to prevent open redirect attacks (SEC-028).
 */
function validateReturnUrl(returnUrl: string | undefined, siteUrl: string): string {
  if (!returnUrl) return `${siteUrl}/subscription`;

  const lower = returnUrl.toLowerCase().trim();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('//')) {
    return `${siteUrl}/subscription`;
  }

  if (returnUrl.startsWith('/')) {
    return `${siteUrl}${returnUrl}`;
  }

  try {
    const parsed = new URL(returnUrl);
    const site = new URL(siteUrl);
    if (parsed.hostname === site.hostname) {
      return returnUrl;
    }
  } catch {
    // Invalid URL
  }

  return `${siteUrl}/subscription`;
}

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);

  try {
    // Initialize clients
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get the authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { action, returnUrl } = body;

    // Get user's subscription
    const { data: subscription, error: subError } = await supabase
      .from("user_subscriptions")
      .select(`
        *,
        plan:subscription_plans(*)
      `)
      .eq("user_id", user.id)
      .in("status", ["active", "trialing", "past_due"])
      .single();

    // PGRST116 is .single() finding no row: the ordinary "this user has no
    // subscription" case, handled per-action below. EVERY OTHER ERROR WAS
    // DISCARDED, and all four branches read the resulting null as proof of
    // absence - "portal" and "cancel" answer "No active subscription found",
    // and "status" answers subscription: null. So one failed read told a
    // paying customer they had no subscription, and told the UI to render
    // them as a free user.
    //
    // Failing closed is the right side to err on here. With no trustworthy
    // read we cannot distinguish "no subscription" from "could not look",
    // and only one of those is safe to act on.
    if (subError && subError.code !== "PGRST116") {
      console.error("[manage-subscription] subscription read failed", subError);
      return new Response(
        JSON.stringify({ error: "Could not read your subscription. Please try again." }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Handle different actions
    switch (action) {
      case "portal": {
        // Create Stripe Customer Portal session
        if (!subscription?.stripe_customer_id) {
          return new Response(
            JSON.stringify({ error: "No active subscription found" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        // WEB-SEO-023: the fallback was the OLD brand domain, so a missing
        // SITE_URL sent a Stripe customer-portal return_url to a host this site
        // does not serve -- a paying user bounced off the internet after
        // managing their subscription.
        const siteUrl =
          Deno.env.get("SITE_URL") ||
          Deno.env.get("VITE_SITE_URL") ||
          "https://desmoinesinsider.com";

        const portalSession = await stripe.billingPortal.sessions.create({
          customer: subscription.stripe_customer_id,
          return_url: validateReturnUrl(returnUrl, siteUrl),
        });

        return new Response(
          JSON.stringify({ url: portalSession.url }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      case "cancel": {
        // Cancel subscription at period end
        if (!subscription?.stripe_subscription_id) {
          return new Response(
            JSON.stringify({ error: "No active subscription found" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        await stripe.subscriptions.update(subscription.stripe_subscription_id, {
          cancel_at_period_end: true,
        });

        // Update local database
        await supabase
          .from("user_subscriptions")
          .update({
            cancel_at_period_end: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", subscription.id);

        return new Response(
          JSON.stringify({
            success: true,
            message: "Subscription will be canceled at period end",
            cancel_at: subscription.current_period_end,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      case "resume": {
        // Resume a canceled subscription (if still within period)
        if (!subscription?.stripe_subscription_id) {
          return new Response(
            JSON.stringify({ error: "No subscription found" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        if (!subscription.cancel_at_period_end) {
          return new Response(
            JSON.stringify({ error: "Subscription is not scheduled for cancellation" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        await stripe.subscriptions.update(subscription.stripe_subscription_id, {
          cancel_at_period_end: false,
        });

        // Update local database
        await supabase
          .from("user_subscriptions")
          .update({
            cancel_at_period_end: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", subscription.id);

        return new Response(
          JSON.stringify({
            success: true,
            message: "Subscription has been resumed",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      case "details":
      default: {
        // Return subscription details
        if (!subscription) {
          return new Response(
            JSON.stringify({
              subscription: null,
              tier: "free",
              hasActiveSubscription: false,
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        // Get payment history
        const { data: payments } = await supabase
          .from("payments")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10);

        // Get upcoming invoice from Stripe
        let upcomingInvoice = null;
        if (subscription.stripe_subscription_id) {
          try {
            upcomingInvoice = await stripe.invoices.retrieveUpcoming({
              subscription: subscription.stripe_subscription_id,
            });
          } catch {
            // No upcoming invoice (possibly canceled)
          }
        }

        return new Response(
          JSON.stringify({
            subscription: {
              id: subscription.id,
              status: subscription.status,
              plan: subscription.plan,
              currentPeriodStart: subscription.current_period_start,
              currentPeriodEnd: subscription.current_period_end,
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
              trialEnd: subscription.trial_end,
            },
            tier: subscription.plan?.name || "free",
            hasActiveSubscription: true,
            payments: payments || [],
            upcomingInvoice: upcomingInvoice
              ? {
                  amount: upcomingInvoice.amount_due / 100,
                  currency: upcomingInvoice.currency,
                  dueDate: upcomingInvoice.due_date
                    ? new Date(upcomingInvoice.due_date * 1000).toISOString()
                    : null,
                }
              : null,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }
  } catch (error) {
    console.error("Manage subscription error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

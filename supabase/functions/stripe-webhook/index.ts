/**
 * Stripe Webhook Handler
 *
 * Handles incoming Stripe webhook events for:
 * - Checkout session completion (campaigns and subscriptions)
 * - Subscription lifecycle events (created, updated, deleted)
 * - Invoice events (payment succeeded, failed)
 *
 * Security: Verifies webhook signature to prevent spoofed events
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Webhook-specific CORS headers (more restrictive - Stripe only)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Stripe webhooks come from Stripe servers
  "Access-Control-Allow-Headers": "stripe-signature, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get the webhook signature
    const signature = req.headers.get("stripe-signature");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!signature) {
      console.error("No Stripe signature found");
      return new Response(JSON.stringify({ error: "No signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the raw body for signature verification
    const body = await req.text();
    let event: Stripe.Event;

    // Verify webhook signature if secret is configured
    if (webhookSecret) {
      try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      } catch (err) {
        console.error("Webhook signature verification failed:", err);
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    } else {
      // Development mode - parse without verification (NOT recommended for production)
      console.warn("STRIPE_WEBHOOK_SECRET not configured - skipping signature verification");
      event = JSON.parse(body);
    }

    console.log(`Processing Stripe event: ${event.type}`);

    // Handle different event types
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionCompleted(supabase, stripe, session);
        break;
      }

      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCreated(supabase, subscription);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(supabase, subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(supabase, subscription);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentSucceeded(supabase, invoice);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentFailed(supabase, invoice);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

/**
 * Handle checkout.session.completed event
 * Processes both campaign payments and subscription signups
 */
async function handleCheckoutSessionCompleted(
  supabase: ReturnType<typeof createClient>,
  stripe: Stripe,
  session: Stripe.Checkout.Session
) {
  console.log("Processing checkout session completed:", session.id);

  // Determine if this is a campaign or subscription checkout
  const metadata = session.metadata || {};

  if (metadata.campaignId) {
    // Campaign one-time payment
    await handleCampaignPayment(supabase, session, metadata.campaignId);
  } else if (session.mode === "subscription" && metadata.userId && metadata.planId) {
    // Subscription signup
    await handleSubscriptionPayment(supabase, stripe, session, metadata.userId, metadata.planId);
  } else {
    console.log("Unknown checkout session type:", session.id);
  }
}

/**
 * Handle campaign payment completion
 */
async function handleCampaignPayment(
  supabase: ReturnType<typeof createClient>,
  session: Stripe.Checkout.Session,
  campaignId: string
) {
  console.log("Processing campaign payment:", campaignId);

  const { error } = await supabase
    .from("campaigns")
    .update({
      status: "pending_creative",
      stripe_payment_intent_id: session.payment_intent as string,
    })
    .eq("id", campaignId)
    .eq("stripe_session_id", session.id);

  if (error) {
    console.error("Failed to update campaign:", error);
    throw error;
  }

  console.log("Campaign payment processed successfully:", campaignId);
}

/**
 * Handle subscription payment completion
 */
async function handleSubscriptionPayment(
  supabase: ReturnType<typeof createClient>,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  userId: string,
  planId: string
) {
  console.log("Processing subscription payment for user:", userId);

  // Get the subscription details from Stripe
  const subscriptionId = session.subscription as string;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // Check if user already has a subscription (upgrade/downgrade scenario)
  const { data: existingSubscription } = await supabase
    .from("user_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .single();

  const subscriptionData = {
    user_id: userId,
    plan_id: planId,
    status: mapStripeStatus(subscription.status),
    stripe_subscription_id: subscriptionId,
    stripe_customer_id: session.customer as string,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end,
    trial_start: subscription.trial_start
      ? new Date(subscription.trial_start * 1000).toISOString()
      : null,
    trial_end: subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null,
  };

  if (existingSubscription) {
    // Update existing subscription
    const { error } = await supabase
      .from("user_subscriptions")
      .update(subscriptionData)
      .eq("user_id", userId);

    if (error) {
      console.error("Failed to update subscription:", error);
      throw error;
    }
  } else {
    // Create new subscription
    const { error } = await supabase
      .from("user_subscriptions")
      .insert(subscriptionData);

    if (error) {
      console.error("Failed to create subscription:", error);
      throw error;
    }
  }

  console.log("Subscription payment processed successfully for user:", userId);
}

/**
 * Handle subscription created event
 */
async function handleSubscriptionCreated(
  supabase: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription
) {
  console.log("Subscription created:", subscription.id);
  // Most logic is handled in checkout.session.completed
  // This handles cases where subscription is created outside checkout
}

/**
 * Handle subscription updated event
 */
async function handleSubscriptionUpdated(
  supabase: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription
) {
  console.log("Subscription updated:", subscription.id);

  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      status: mapStripeStatus(subscription.status),
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000).toISOString()
        : null,
    })
    .eq("stripe_subscription_id", subscription.id);

  if (error) {
    console.error("Failed to update subscription:", error);
    throw error;
  }
}

/**
 * Handle subscription deleted event
 */
async function handleSubscriptionDeleted(
  supabase: ReturnType<typeof createClient>,
  subscription: Stripe.Subscription
) {
  console.log("Subscription deleted:", subscription.id);

  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);

  if (error) {
    console.error("Failed to update subscription:", error);
    throw error;
  }
}

/**
 * Handle invoice payment succeeded event
 */
async function handleInvoicePaymentSucceeded(
  supabase: ReturnType<typeof createClient>,
  invoice: Stripe.Invoice
) {
  console.log("Invoice payment succeeded:", invoice.id);

  if (!invoice.subscription) return;

  // Update subscription status to active
  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      status: "active",
    })
    .eq("stripe_subscription_id", invoice.subscription as string);

  if (error) {
    console.error("Failed to update subscription after payment:", error);
  }
}

/**
 * Handle invoice payment failed event
 */
async function handleInvoicePaymentFailed(
  supabase: ReturnType<typeof createClient>,
  invoice: Stripe.Invoice
) {
  console.log("Invoice payment failed:", invoice.id);

  if (!invoice.subscription) return;

  // Update subscription status to past_due
  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      status: "past_due",
    })
    .eq("stripe_subscription_id", invoice.subscription as string);

  if (error) {
    console.error("Failed to update subscription after failed payment:", error);
  }
}

/**
 * Map Stripe subscription status to our status
 */
function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): string {
  const statusMap: Record<string, string> = {
    active: "active",
    canceled: "canceled",
    incomplete: "past_due",
    incomplete_expired: "canceled",
    past_due: "past_due",
    trialing: "trialing",
    unpaid: "past_due",
    paused: "paused",
  };

  return statusMap[stripeStatus] || "active";
}

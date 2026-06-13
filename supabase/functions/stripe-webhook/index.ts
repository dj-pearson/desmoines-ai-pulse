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

// Stripe webhooks are server-to-server and do not require CORS headers.
// Removing Access-Control-Allow-Origin prevents browser-based spoofing.
const responseHeaders = {
  "Content-Type": "application/json",
};

serve(async (req) => {
  // Stripe webhooks are server-to-server POST only — no CORS preflight needed
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: responseHeaders,
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

    // SECURITY: Webhook signature verification is REQUIRED.
    // STRIPE_WEBHOOK_SECRET must be configured in all environments.
    const signature = req.headers.get("stripe-signature");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET is not configured — rejecting webhook");
      return new Response(
        JSON.stringify({ error: "Webhook secret not configured" }),
        { status: 500, headers: responseHeaders }
      );
    }

    if (!signature) {
      console.error("No Stripe signature found");
      return new Response(JSON.stringify({ error: "No signature" }), {
        status: 400,
        headers: responseHeaders,
      });
    }

    // Get the raw body for signature verification
    const body = await req.text();
    let event: Stripe.Event;

    // Always verify webhook signature — never skip
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: responseHeaders }
      );
    }

    console.log(`Processing Stripe event: ${event.type} (${event.id})`);

    // IDEMPOTENCY: Stripe delivers events at-least-once and retries on non-2xx.
    // Skip any event id we have already fully processed so a redelivery does not
    // re-run side effects (e.g. duplicate campaign_notifications). The id is only
    // recorded AFTER successful processing below, so a failed/partial event stays
    // unrecorded and is safely reprocessed on Stripe's retry.
    const { data: alreadyProcessed } = await supabase
      .from("stripe_webhook_events")
      .select("id")
      .eq("id", event.id)
      .maybeSingle();

    if (alreadyProcessed) {
      console.log(`Duplicate Stripe event ${event.id} (${event.type}) — already processed, skipping`);
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: responseHeaders,
      });
    }

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

    // Record successful processing so future redeliveries of this event are
    // deduped above. Best-effort: a 23505 means a concurrent delivery already
    // recorded it (fine); any other failure only risks reprocessing a future
    // duplicate, never dropping this event.
    const { error: ledgerError } = await supabase
      .from("stripe_webhook_events")
      .insert({ id: event.id, event_type: event.type });

    if (ledgerError && ledgerError.code !== "23505") {
      console.error("Failed to record processed webhook event:", ledgerError);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: responseHeaders,
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

  // Get campaign details for payment logging
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("user_id, name, total_cost")
    .eq("id", campaignId)
    .single();

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

  // Log payment to payments table
  const amountPaid = (session.amount_total || 0) / 100;
  const paymentData = {
    user_id: campaign?.user_id || null,
    stripe_payment_intent_id: session.payment_intent as string,
    amount: amountPaid,
    currency: session.currency || 'usd',
    payment_type: 'campaign' as const,
    status: 'succeeded' as const,
    campaign_id: campaignId,
    description: `Advertising Campaign - ${campaign?.name || 'Campaign'}`,
    paid_at: new Date().toISOString(),
  };

  const { error: paymentError } = await supabase
    .from("payments")
    .upsert(paymentData, {
      onConflict: 'stripe_payment_intent_id',
      ignoreDuplicates: false,
    });

  if (paymentError) {
    console.error("Failed to log campaign payment:", paymentError);
  }

  // Send payment confirmation notification to the advertiser
  if (campaign?.user_id) {
    await supabase.from("campaign_notifications").insert({
      campaign_id: campaignId,
      recipient_user_id: campaign.user_id,
      notification_type: "payment_received",
      title: `Payment Confirmed: ${campaign.name || 'Campaign'}`,
      message: `Payment of $${amountPaid.toFixed(2)} has been received for your campaign "${campaign.name}". You can now upload your ad creatives.`,
      is_read: false,
      metadata: { amount: amountPaid },
    });
  }

  // Notify admins about the new paid campaign
  const { data: admins } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin");

  if (admins && admins.length > 0) {
    await supabase.from("campaign_notifications").insert(
      admins.map((admin: { id: string }) => ({
        campaign_id: campaignId,
        recipient_user_id: admin.id,
        notification_type: "payment_received",
        title: `New Payment: ${campaign?.name || 'Campaign'}`,
        message: `Payment of $${amountPaid.toFixed(2)} received for campaign "${campaign?.name}". Advertiser can now upload creatives.`,
        is_read: false,
        metadata: { amount: amountPaid },
      }))
    );
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

  // Check if user already has a web/Stripe subscription (upgrade/downgrade scenario).
  // Scoped to platform='web' so iOS/Android rows for the same user aren't touched.
  const { data: existingSubscription } = await supabase
    .from("user_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("platform", "web")
    .maybeSingle();

  const subscriptionData = {
    user_id: userId,
    plan_id: planId,
    status: mapStripeStatus(subscription.status),
    stripe_subscription_id: subscriptionId,
    stripe_customer_id: session.customer as string,
    platform: "web",
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
    // Update existing web subscription
    const { error } = await supabase
      .from("user_subscriptions")
      .update(subscriptionData)
      .eq("user_id", userId)
      .eq("platform", "web");

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

  // WEB-AUTO-013: log the cancellation transition so the lifecycle job can
  // offer a one-per-lapse win-back. Best-effort; web-only.
  await recordSubscriptionEvent(supabase, subscription.id, {
    event_type: "canceled",
    to_status: "canceled",
  });
}

/**
 * Handle invoice payment succeeded event
 */
async function handleInvoicePaymentSucceeded(
  supabase: ReturnType<typeof createClient>,
  invoice: Stripe.Invoice
) {
  console.log("Invoice payment succeeded:", invoice.id);

  // Get user ID from subscription or customer
  let userId: string | null = null;
  let subscriptionId: string | null = null;

  if (invoice.subscription) {
    // Get user from subscription
    const { data: subscription } = await supabase
      .from("user_subscriptions")
      .select("id, user_id")
      .eq("stripe_subscription_id", invoice.subscription as string)
      .single();

    if (subscription) {
      userId = subscription.user_id;
      subscriptionId = subscription.id;
    }

    // Update subscription status to active
    await supabase
      .from("user_subscriptions")
      .update({
        status: "active",
      })
      .eq("stripe_subscription_id", invoice.subscription as string);
  }

  // WEB-AUTO-013: a successful invoice on a previously past_due sub means the
  // dunning lapse recovered — log it (web-only, best-effort).
  if (invoice.subscription) {
    await recordSubscriptionEvent(supabase, invoice.subscription as string, {
      event_type: "payment_recovered",
      to_status: "active",
      amount: (invoice.amount_paid || 0) / 100,
      currency: invoice.currency || "usd",
    });
  }

  // Log payment to payments table
  const paymentData = {
    user_id: userId,
    stripe_invoice_id: invoice.id,
    stripe_charge_id: typeof invoice.charge === 'string' ? invoice.charge : null,
    amount: (invoice.amount_paid || 0) / 100,
    currency: invoice.currency || 'usd',
    payment_type: 'subscription' as const,
    status: 'succeeded' as const,
    subscription_id: subscriptionId,
    description: `Subscription payment - ${invoice.lines?.data?.[0]?.description || 'Monthly/Yearly subscription'}`,
    paid_at: new Date().toISOString(),
  };

  const { error: paymentError } = await supabase
    .from("payments")
    .upsert(paymentData, {
      onConflict: 'stripe_invoice_id',
      ignoreDuplicates: false,
    });

  if (paymentError) {
    console.error("Failed to log payment:", paymentError);
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

  // WEB-AUTO-013: log the failed payment so the lifecycle job can escalate the
  // dunning ladder and eventually downgrade. Best-effort; web-only.
  await recordSubscriptionEvent(supabase, invoice.subscription as string, {
    event_type: "payment_failed",
    to_status: "past_due",
    amount: (invoice.amount_due || 0) / 100,
    currency: invoice.currency || "usd",
    metadata: { attempt_count: invoice.attempt_count ?? null, next_payment_attempt: invoice.next_payment_attempt ?? null },
  });
}

/**
 * WEB-AUTO-013: append a row to subscription_events for an auditable lifecycle
 * trail. Web-only (Apple/Google subs own their own dunning via the stores).
 * Best-effort: never throws, so an audit hiccup can't fail the webhook.
 */
async function recordSubscriptionEvent(
  supabase: ReturnType<typeof createClient>,
  stripeSubscriptionId: string,
  entry: {
    event_type: string;
    from_status?: string;
    to_status?: string;
    amount?: number;
    currency?: string;
    metadata?: Record<string, unknown>;
  }
) {
  try {
    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("id, user_id, platform")
      .eq("stripe_subscription_id", stripeSubscriptionId)
      .maybeSingle();

    // Only log web subscriptions; stores own mobile dunning.
    if (!sub || (sub.platform && sub.platform !== "web")) return;

    await supabase.from("subscription_events").insert({
      user_id: sub.user_id,
      subscription_id: sub.id,
      stripe_subscription_id: stripeSubscriptionId,
      platform: "web",
      event_type: entry.event_type,
      from_status: entry.from_status ?? null,
      to_status: entry.to_status ?? null,
      amount: entry.amount ?? null,
      currency: entry.currency ?? "usd",
      metadata: entry.metadata ?? {},
    });
  } catch (e) {
    console.error("Failed to record subscription_event:", e);
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

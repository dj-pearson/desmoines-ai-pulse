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
import { listAdminUserIds } from "../_shared/apiKeyAuth.ts";
import { sendNurtureEmail } from "../_shared/sendNurtureEmail.ts";
import { sendCampaignEmail } from "../_shared/campaignNotificationEmail.ts";
import { buildTrialNotice, planAmount } from "../_shared/trialNotice.ts";
import {
  subscriptionUpdatePatch,
  webSubscriptionRow,
  type StripeSubscriptionLike,
} from "../_shared/stripeSubscriptionRow.ts";

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
    // Capture the error rather than discarding it. stripe_webhook_events DOES
    // exist, so this guard works today — but dropping the error means that if
    // the table ever becomes unreachable (permission change, outage, a rename),
    // the lookup returns nothing, every redelivery reads as "not yet processed",
    // and the guard fails OPEN silently on a payments webhook. That is exactly
    // how play-rtdn-webhook's identical guard came to be permanently dead
    // without anyone noticing (WEB-BE-030).
    const { data: alreadyProcessed, error: idempotencyLookupError } = await supabase
      .from("stripe_webhook_events")
      .select("id")
      .eq("id", event.id)
      .maybeSingle();

    if (idempotencyLookupError) {
      // Not fatal: returning non-2xx would make Stripe retry the event, which
      // is the very thing this guard exists to make safe. Proceed, but say so
      // loudly — duplicate side effects are recoverable, a silent fail-open is
      // not diagnosable.
      console.error(
        `stripe_webhook_events lookup failed (idempotency DISABLED for event ${event.id}): ${idempotencyLookupError.message}`,
      );
    }

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

      // WEB-ADS-011 AC4. Without this, an abandoned checkout leaves the
      // campaign at pending_payment FOREVER: admin lists count it as awaiting
      // money that is never coming, and the row carries a session id that can
      // no longer be paid. create-campaign-checkout sets expires_at to 30
      // minutes (index.ts:327), so Stripe fires this once, half an hour after
      // the advertiser walked away.
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSessionExpired(supabase, session);
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

      case "customer.subscription.trial_will_end": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleTrialWillEnd(supabase, subscription);
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
 * An abandoned campaign checkout (WEB-ADS-011 AC4).
 *
 * Returns the campaign to `draft` so the advertiser can start again, and tells
 * them once. Subscription checkouts are left alone: nothing is reserved for
 * them, and create-subscription-checkout owns that flow.
 *
 * TWO CONDITIONS ON THE UPDATE, AND BOTH MATTER.
 *   stripe_session_id  scopes the revert to THIS session. That is not
 *                      hypothetical: create-campaign-checkout accepts a
 *                      campaign in `draft` OR `pending_payment` (index.ts:149),
 *                      so an advertiser who retries overwrites the id, and the
 *                      first session's expiry must then match nothing rather
 *                      than drag a live checkout back to draft.
 *   status             a campaign that has since been paid, cancelled or
 *                      rejected must not be dragged back to draft by a late
 *                      webhook. Stripe can deliver out of order.
 *
 * The notification is BEST EFFORT and is not allowed to throw. Its type lives in
 * a CHECK constraint widened by 20260920000000; if that migration has not been
 * applied, the insert fails and the advertiser is not told - but the status
 * revert, which is the part that unsticks them, still happened, and Stripe is
 * not made to retry an event that was processed.
 */
async function handleCheckoutSessionExpired(
  supabase: ReturnType<typeof createClient>,
  session: Stripe.Checkout.Session
) {
  const campaignId = (session.metadata || {}).campaignId;
  if (!campaignId) {
    console.log(`Checkout session ${session.id} expired with no campaignId - nothing to revert.`);
    return;
  }

  console.log(`Processing expired campaign checkout: ${campaignId} (session ${session.id})`);

  const { data: reverted, error } = await supabase
    .from("campaigns")
    .update({ status: "draft", stripe_session_id: null })
    .eq("id", campaignId)
    .eq("stripe_session_id", session.id)
    .eq("status", "pending_payment")
    .select("id, name, user_id");

  // THROW, unlike the notification below. A failed revert is the whole job of
  // this handler, and a non-2xx makes Stripe redeliver - which is what we want,
  // because the alternative is a campaign stuck at pending_payment forever.
  if (error) {
    console.error(`Failed to revert campaign ${campaignId} after checkout expiry: ${error.message}`);
    throw error;
  }

  const campaign = reverted?.[0];
  if (!campaign) {
    // Already paid, already cancelled, or a newer checkout owns the row.
    console.log(`Campaign ${campaignId} was not pending_payment for session ${session.id} - left as is.`);
    return;
  }

  if (!campaign.user_id) {
    console.log(`Campaign ${campaignId} reverted to draft; no user_id to notify.`);
    return;
  }

  const { error: notifyError } = await supabase.from("campaign_notifications").insert({
    campaign_id: campaignId,
    recipient_user_id: campaign.user_id,
    notification_type: "checkout_expired",
    title: `Checkout expired: ${campaign.name || "Campaign"}`,
    message:
      `Your checkout for "${campaign.name || "your campaign"}" expired before payment completed, so the ` +
      `campaign is back in drafts. Nothing was charged. Open it to pick your dates and check out again.`,
    is_read: false,
    metadata: { stripe_session_id: session.id },
  });

  if (notifyError) {
    console.error(
      `Campaign ${campaignId} was reverted to draft but the advertiser was NOT notified: ${notifyError.message}`,
    );
  }

  console.log(`Campaign ${campaignId} returned to draft after checkout expiry.`);
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

  // Get campaign details for payment logging.
  //
  // WEB-BE-032: the error was discarded, and this is NOT the best-effort read it
  // looks like. campaign?.user_id gates the advertiser's "Payment Confirmed"
  // notification below, so a failed lookup means someone paid and was never told
  // it went through - and it also puts user_id: null on the payment row, which
  // is the column any refund or revenue query joins on.
  //
  // It does not THROW, because that would return non-2xx and make Stripe retry
  // an event whose campaign row may genuinely be gone. maybeSingle so a missing
  // row is not reported as an error, and a real failure is logged as one.
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("user_id, name, total_cost")
    .eq("id", campaignId)
    .maybeSingle();

  if (campaignError) {
    console.error(
      `Campaign lookup failed for ${campaignId} - payment will be logged without a user_id ` +
        `and the advertiser will NOT be notified: ${campaignError.message}`,
    );
  } else if (!campaign) {
    console.error(`Campaign ${campaignId} not found while processing its payment.`);
  }

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

  // Send payment confirmation to the advertiser: the stored notification AND an
  // email.
  //
  // WEB-ADS-005: only the row was written, so the advertiser's confirmation was
  // an in-app bell they had to come back and look at, while AdvertiseSuccess.tsx
  // told them "A confirmation email has been sent". The obvious route -
  // invoking send-campaign-notification - does not work from here: that endpoint
  // requires a user bearer token (decision.ts, WEB-ADS-013) and Stripe is not a
  // user. So the renderer and the provider call were extracted to
  // _shared/campaignNotificationEmail.ts and both callers use them.
  if (campaign?.user_id) {
    const title = `Payment Confirmed: ${campaign.name || 'Campaign'}`;
    const message =
      `Payment of $${amountPaid.toFixed(2)} has been received for your campaign ` +
      `"${campaign.name}". You can now upload your ad creatives.`;

    // Resolved here rather than left null so the row records who was mailed.
    // A failure is logged, not thrown - see below.
    const { data: recipient, error: recipientError } = await supabase.auth.admin
      .getUserById(campaign.user_id);
    if (recipientError) {
      console.error(
        `Could not resolve the advertiser's email for campaign ${campaignId}: ${recipientError.message}`,
      );
    }
    const recipientEmail = recipient?.user?.email ?? null;

    await supabase.from("campaign_notifications").insert({
      campaign_id: campaignId,
      recipient_user_id: campaign.user_id,
      recipient_email: recipientEmail,
      notification_type: "payment_received",
      title,
      message,
      is_read: false,
      metadata: { amount: amountPaid },
    });

    // NOT thrown on, deliberately. The payment is taken and the campaign row is
    // already advanced to pending_creative; a mail outage must not return non-2xx
    // and have Stripe redeliver an event whose real work is done. Stripe's own
    // receipt (create-campaign-checkout sets receipt_email) is the second path
    // to the same inbox, so a failure here is not silence.
    if (recipientEmail) {
      const sent = await sendCampaignEmail({
        to: recipientEmail,
        content: {
          title,
          message,
          campaignName: campaign.name || "Campaign",
          campaignId,
          notificationType: "payment_received",
          siteUrl: Deno.env.get("VITE_SITE_URL") || "https://desmoinesinsider.com",
        },
        resendApiKey: Deno.env.get("RESEND_API_KEY") ?? undefined,
        sendgridApiKey: Deno.env.get("SENDGRID_API_KEY") ?? undefined,
        fromEmail: Deno.env.get("NOTIFICATION_FROM_EMAIL") || "noreply@desmoinesinsider.com",
      });
      if (!sent) {
        console.error(`Payment confirmation email was not accepted for campaign ${campaignId}.`);
      }
    } else {
      console.error(
        `Campaign ${campaignId} paid but the advertiser has no email address on file - ` +
          `no confirmation sent.`,
      );
    }
  }

  // Notify admins about the new paid campaign.
  // WEB-SEC-023: this selected profiles.id where profiles.role='admin'. The role
  // column is not in the schema, so the query matched nobody and every paid
  // campaign notified no admin at all — silently, because the result is only
  // length-checked. It also inserted the profiles row PK into
  // recipient_user_id, which expects a user_id. listAdminUserIds returns user_ids.
  const adminUserIds = await listAdminUserIds(supabase);

  if (adminUserIds.length > 0) {
    await supabase.from("campaign_notifications").insert(
      adminUserIds.map((adminUserId: string) => ({
        campaign_id: campaignId,
        recipient_user_id: adminUserId,
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
  //
  // WEB-BE-032: this read decides UPDATE vs INSERT, so discarding its error made
  // a transient failure look like "no existing subscription" and sent a paying
  // customer down the INSERT branch - a duplicate web subscription row for a user
  // who already had one, or a unique-constraint failure after Stripe had already
  // charged them. It throws: the handler returns 500, Stripe retries, and the
  // idempotency id is only recorded after success, so the retry is safe.
  const { data: existingSubscription, error: existingSubscriptionError } = await supabase
    .from("user_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("platform", "web")
    .maybeSingle();

  if (existingSubscriptionError) {
    console.error("Failed to look up existing subscription:", existingSubscriptionError);
    throw existingSubscriptionError;
  }

  // WEB-CI-029. Built by _shared/stripeSubscriptionRow.ts rather than inline, so
  // the mapping this row encodes - including platform='web', which the read and
  // the UPDATE above both scope on, and billing_interval, which WEB-LEGAL-006
  // needs because nothing else records monthly vs yearly and a trial cannot
  // imply it - is reachable by a test. It was not: this file imports Stripe
  // from esm.sh and exports nothing.
  const subscriptionData = webSubscriptionRow({
    userId,
    planId,
    subscription: subscription as unknown as StripeSubscriptionLike,
    stripeCustomerId: session.customer as string,
  });

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
    // WEB-CI-029: the patch, not the full row. Keyed on stripe_subscription_id,
    // so re-sending user_id, plan_id or platform would let a malformed event
    // rewrite who the subscription belongs to. Also backfills billing_interval
    // on existing rows as Stripe sends updates (WEB-LEGAL-006).
    .update(subscriptionUpdatePatch(subscription as unknown as StripeSubscriptionLike))
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

  // Get user ID from subscription or customer
  let userId: string | null = null;
  let subscriptionId: string | null = null;

  if (invoice.subscription) {
    // Get user from subscription
    // WEB-BE-032. Two problems here, and .single() was the second one: it raises
    // PGRST116 when no row matches, so with the error discarded a genuinely
    // missing subscription and a database failure were the same non-result.
    // maybeSingle separates them - an absent row is logged and processing
    // continues (the payment is still worth recording), a real error throws so
    // Stripe retries rather than filing the renewal against user_id: null.
    const { data: subscription, error: subscriptionLookupError } = await supabase
      .from("user_subscriptions")
      .select("id, user_id")
      .eq("stripe_subscription_id", invoice.subscription as string)
      .maybeSingle();

    if (subscriptionLookupError) {
      console.error("Failed to look up subscription for invoice:", subscriptionLookupError);
      throw subscriptionLookupError;
    }

    if (subscription) {
      userId = subscription.user_id;
      subscriptionId = subscription.id;
    } else {
      console.error(
        `No user_subscriptions row for stripe_subscription_id ${invoice.subscription} - ` +
          "logging this payment without a user_id.",
      );
    }

    // Update subscription status to active. This is the entitlement write: if it
    // fails silently the customer has paid and stays locked out, which is the
    // worst outcome in this file, so it throws.
    const { error: activateError } = await supabase
      .from("user_subscriptions")
      .update({
        status: "active",
      })
      .eq("stripe_subscription_id", invoice.subscription as string);

    if (activateError) {
      console.error("Failed to activate subscription after payment:", activateError);
      throw activateError;
    }
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
}

/**
 * Map Stripe subscription status to our status
 */
/**
 * customer.subscription.trial_will_end (WEB-LEGAL-006).
 *
 * Stripe fires this three days before a trial converts, and the event carries
 * the exact price and trial_end, which makes it the authoritative source for
 * the notice. subscription-nurture keeps a daily sweep as a safety net for when
 * this never arrives; both dedupe through the nurture_sends ledger on
 * kind="trial_ending".
 *
 * Deliberately NOT gated on marketing consent and NOT passed through the
 * LLM quality gate. This is a billing disclosure, so suppressing it for someone
 * who opted out of marketing would withhold it from exactly the people most
 * likely to be surprised by the charge.
 */
async function handleTrialWillEnd(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  subscription: Stripe.Subscription,
): Promise<void> {
  if (!subscription.trial_end) return;

  const { data: sub, error: subError } = await supabase
    .from("user_subscriptions")
    .select("user_id, plan_id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  if (subError) {
    // Throwing returns a non-2xx, so Stripe retries and the notice is not lost.
    console.error("trial_will_end: subscription lookup failed:", subError.message);
    throw subError;
  }
  if (!sub?.user_id) {
    console.warn(`trial_will_end: no local subscription for ${subscription.id}`);
    return;
  }

  // Already sent for this trial? The daily sweep may have got there first.
  const { data: priorSend, error: priorError } = await supabase
    .from("nurture_sends")
    .select("id")
    .eq("user_id", sub.user_id)
    .eq("kind", "trial_ending")
    .gte("created_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
    .limit(1);
  if (priorError) {
    // Cannot prove it was already sent. Send anyway: a duplicate notice is a
    // far better failure than a missing one.
    console.warn("trial_will_end: dedupe check failed, sending anyway:", priorError.message);
  } else if (priorSend && priorSend.length > 0) {
    return;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("email")
    .eq("user_id", sub.user_id)
    .maybeSingle();
  if (profileError) {
    console.error("trial_will_end: profile lookup failed:", profileError.message);
    throw profileError;
  }
  if (!profile?.email) {
    console.warn(`trial_will_end: no email for user ${sub.user_id}`);
    return;
  }

  // Best-effort: without the plan row the notice still sends, naming no amount
  // and pointing at the subscription page instead (see buildTrialNotice).
  const { data: plan, error: planError } = await supabase
    .from("subscription_plans")
    .select("display_name, price_monthly, price_yearly")
    .eq("id", sub.plan_id)
    .maybeSingle();
  if (planError) {
    console.warn("trial_will_end: plan lookup failed, notice will omit the amount:", planError.message);
  }

  const price = subscription.items?.data?.[0]?.price;
  const interval = price?.recurring?.interval ?? null;
  // Prefer the amount Stripe will actually charge over the catalogue price.
  const amount =
    typeof price?.unit_amount === "number"
      ? price.unit_amount / 100
      : planAmount(plan, interval);

  const notice = buildTrialNotice({
    planName: plan?.display_name ?? "subscription",
    amount,
    interval,
    chargeAt: new Date(subscription.trial_end * 1000).toISOString(),
    siteUrl: (Deno.env.get("VITE_SITE_URL") || Deno.env.get("SITE_URL") ||
      "https://desmoinesinsider.com").replace(/\/+$/, ""),
  });

  await sendNurtureEmail(supabase, {
    agentKey: "stripe-webhook",
    kind: "trial_ending",
    userId: sub.user_id,
    email: profile.email,
    subject: notice.subject,
    bodyHtml: notice.html,
    bodyText: notice.text,
    category: "transactional",
  });
}

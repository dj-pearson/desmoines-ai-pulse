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
import { requireAdminOrApiKey, type AdminCaller } from "../_shared/apiKeyAuth.ts";
import { refundDecision, refundNoticeText } from "../_shared/campaignPayment.ts";
import { sendCampaignEmail } from "../_shared/campaignNotificationEmail.ts";
import { getSiteUrl } from "../_shared/siteUrl.ts";

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

    // WEB-SEC-023: was a hand-rolled gate on profiles.role keyed by the row PK.
    const caller: AdminCaller = { user: null };
    const authFailure = await requireAdminOrApiKey(req, corsHeaders, caller);
    if (authFailure) return authFailure;

    // A refund is audited against the admin who issued it, so this endpoint
    // needs a person rather than a shared key.
    const user = caller.user;
    if (!user) {
      return new Response(
        JSON.stringify({ error: "This endpoint requires an admin user session" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Parse request body
    const body = await req.json();
    const {
      campaignId,
      amount,
      reason,
      policyViolation,
      refundReason,
      refundReasonNotes,
    } = body;

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

    // ADMIN-REFUND-001: enforce structured taxonomy alongside free-text reason.
    const ALLOWED_REASONS = [
      "duplicate_charge",
      "user_request",
      "campaign_cancelled",
      "fraud",
      "technical_issue",
      "content_takedown",
      "accidental_purchase",
      "other",
    ];
    if (!refundReason || !ALLOWED_REASONS.includes(refundReason)) {
      return new Response(
        JSON.stringify({
          error: "Structured refund_reason is required",
          allowed: ALLOWED_REASONS,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
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

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2023-10-16",
    });

    // WP3 item 4. The cap was campaigns.total_cost: the LIST price, which a
    // promotion code lowers, with no memory of refunds already made, so two
    // "full" refunds could each pass. Stripe's charge is the ledger: what it
    // captured minus what it has already returned.
    let paidCents: number;
    let refundedCents: number;
    try {
      const intent = await stripe.paymentIntents.retrieve(campaign.stripe_payment_intent_id, {
        expand: ["latest_charge"],
      });
      const charge = typeof intent.latest_charge === "string"
        ? await stripe.charges.retrieve(intent.latest_charge)
        : intent.latest_charge;
      if (!charge) throw new Error("payment intent has no charge");
      paidCents = Number(charge.amount_captured ?? charge.amount ?? 0);
      refundedCents = Number(charge.amount_refunded ?? 0);
    } catch (lookupError) {
      console.error("[process-stripe-refund] could not read the charge:", lookupError);
      return new Response(
        JSON.stringify({ error: "Could not read the payment from Stripe. Nothing was refunded; try again." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const decision = refundDecision({
      paidCents,
      refundedCents,
      requestedDollars: amount === undefined || amount === null || amount === "" ? null : Number(amount),
    });
    if (!decision.ok) {
      return new Response(
        JSON.stringify({ error: decision.error, maxRefundable: decision.maxCents / 100 }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const refundAmount = decision.amountCents / 100;

    // Generate a STABLE idempotency key to prevent duplicate refunds (SEC-027).
    // It must NOT include a timestamp: if the edge function times out and the
    // request is retried, a time-based key would change and Stripe would treat
    // the retry as a brand-new refund (double refund). Deriving the key from
    // stable request attributes (payment intent + amount in cents + reason)
    // makes identical retries collapse to a single Stripe refund, while a
    // genuinely different refund (different amount/reason) gets its own key.
    const refundAmountCents = Math.round(refundAmount * 100);
    const idempotencyKey = `refund_${campaign.stripe_payment_intent_id}_${refundAmountCents}_${refundReason}`;
    console.log(`Processing refund with idempotency key: ${idempotencyKey}`);

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
        idempotencyKey,
      },
    }, {
      idempotencyKey,
    });

    // A REPLAYED KEY IS NOT A NEW REFUND. Stripe returns the refund it already
    // made for an identical request within 24 hours. The cap above was read
    // AFTER that refund, so it may even call this one "full". Recording,
    // notifying or ending the campaign again would all be wrong, so a refund
    // id we already hold ends the request here.
    const { data: known, error: knownError } = await supabase
      .from("refunds")
      .select("id")
      .eq("stripe_refund_id", refund.id)
      .limit(1);
    if (knownError) {
      console.error("[process-stripe-refund] could not check for a replayed refund:", knownError.message);
    } else if (known && known.length > 0) {
      const replay = new Response(
        JSON.stringify({
          success: true,
          duplicate: true,
          refundId: refund.id,
          status: refund.status,
          amount: refund.amount / 100,
          message: "This refund was already issued; nothing new was sent to Stripe.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
      return addRateLimitHeaders(replay, rateLimit);
    }

    // Create refund record in database
    const { error: refundRecordError } = await supabase.from("refunds").insert({
      campaign_id: campaignId,
      admin_user_id: user.id,
      amount: refundAmount,
      reason,
      policy_violation: policyViolation || null,
      status: refund.status === "succeeded" ? "completed" : "pending",
      stripe_refund_id: refund.id,
      refund_reason: refundReason ?? "other",
      refund_reason_notes: refundReasonNotes ?? null,
    });

    // ADMIN-REFUND-001: structured audit log for finance reporting.
    await supabase.from("security_audit_logs").insert({
      event_type: "admin_action",
      identifier: user.email ?? user.id,
      severity: "low",
      action: "refund:process",
      resource: `campaigns:${campaignId}`,
      user_id: user.id,
      details: {
        amount: refundAmount,
        refund_reason: refundReason ?? "other",
        refund_reason_notes: refundReasonNotes ?? null,
        stripe_refund_id: refund.id,
      },
    });

    if (refundRecordError) {
      console.error("Failed to create refund record:", refundRecordError);
      // Continue anyway - the Stripe refund was successful
    }

    // WP3 item 4. Only a refund that returns everything ends the campaign.
    // Any refund used to set status 'refunded', which stops the ads (and the
    // sponsorship trigger clears the badge), so a $10 goodwill credit on a
    // running campaign took it down.
    if (decision.full) {
      const { error: updateError } = await supabase
        .from("campaigns")
        .update({ status: "refunded" })
        .eq("id", campaignId);

      if (updateError) {
        console.error("Failed to update campaign status:", updateError);
      }
    }

    // Tell the advertiser. Server-side, after the money moved: the admin
    // pages used to do this from the browser, and AdminRefunds did not do it
    // at all. Best effort; the refund has happened either way.
    await notifyAdvertiserOfRefund(supabase, {
      campaignId,
      campaignName: campaign.name ?? "Campaign",
      userId: campaign.user_id ?? null,
      amount: refundAmount,
      full: decision.full,
      remaining: decision.remainingAfterCents / 100,
      stripeRefundId: refund.id,
    });

    const response = new Response(
      JSON.stringify({
        success: true,
        refundId: refund.id,
        status: refund.status,
        amount: refundAmount,
        full: decision.full,
        remainingRefundable: decision.remainingAfterCents / 100,
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
          error: "Payment processor error",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        error: "Failed to process refund",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

/**
 * The advertiser's refund notice: a campaign_notifications row and an email,
 * the same two paths stripe-webhook uses for "Payment Confirmed". Never
 * throws: the refund is already made, and an error here must not read as
 * "refund failed" to an admin who would then try again.
 */
async function notifyAdvertiserOfRefund(
  supabase: ReturnType<typeof createClient>,
  args: {
    campaignId: string;
    campaignName: string;
    userId: string | null;
    amount: number;
    full: boolean;
    remaining: number;
    stripeRefundId: string;
  },
) {
  if (!args.userId) {
    console.error(`[process-stripe-refund] campaign ${args.campaignId} has no owner to notify.`);
    return;
  }
  const { title, message } = refundNoticeText(args);

  let recipientEmail: string | null = null;
  try {
    const { data, error } = await supabase.auth.admin.getUserById(args.userId);
    if (error) throw error;
    recipientEmail = data?.user?.email ?? null;
  } catch (lookupError) {
    console.error(`[process-stripe-refund] could not resolve the advertiser's email:`, lookupError);
  }

  const { error: rowError } = await supabase.from("campaign_notifications").insert({
    campaign_id: args.campaignId,
    recipient_user_id: args.userId,
    recipient_email: recipientEmail,
    notification_type: "campaign_refunded",
    title,
    message,
    is_read: false,
    metadata: {
      amount: args.amount,
      full: args.full,
      remaining_refundable: args.remaining,
      stripe_refund_id: args.stripeRefundId,
    },
  });
  if (rowError) {
    console.error(`[process-stripe-refund] refund notice row not written: ${rowError.message}`);
  }

  if (!recipientEmail) return;
  const sent = await sendCampaignEmail({
    to: recipientEmail,
    content: {
      title,
      message,
      campaignName: args.campaignName,
      campaignId: args.campaignId,
      notificationType: "campaign_refunded",
      siteUrl: getSiteUrl(),
    },
    resendApiKey: Deno.env.get("RESEND_API_KEY") ?? undefined,
    sendgridApiKey: Deno.env.get("SENDGRID_API_KEY") ?? undefined,
    fromEmail: Deno.env.get("NOTIFICATION_FROM_EMAIL") || "noreply@desmoinesinsider.com",
  });
  if (!sent) {
    console.error(`[process-stripe-refund] refund email was not accepted for campaign ${args.campaignId}.`);
  }
}

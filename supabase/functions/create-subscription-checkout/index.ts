/**
 * Create Subscription Checkout Session
 *
 * Creates a Stripe Checkout session for consumer subscriptions (Insider/VIP plans).
 * Supports both monthly and yearly billing with optional trial periods.
 *
 * Security:
 * - Requires authenticated user
 * - Uses environment-aware CORS
 * - Rate limited per IP and per user; every 429 carries CORS headers
 * - Validates plan existence in database
 *
 * Request: { planId, billingInterval?, preview?, confirm? }
 *   preview: true   a plan change returns a quote and changes nothing.
 *   confirm: true   a plan change the member has seen a quote for: upgrades
 *                   are invoiced now, downgrades are scheduled for period end.
 *   neither         exactly what shipped before, for cached bundles.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleCors, getCorsHeaders, isOriginAllowed, addCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, checkRateLimitPersistent, addRateLimitHeaders } from "../_shared/rateLimit.ts";
import { trialPeriodDays } from "../_shared/trialEligibility.ts";
import { getSiteUrl } from "../_shared/siteUrl.ts";
import { decideCheckout, quoteFromUpcoming, type PlanChangeQuote } from "./decision.ts";

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Get origin for CORS headers
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = isOriginAllowed(origin) ? origin : undefined;
  const corsHeaders = getCorsHeaders(allowedOrigin);

  // Rate limiting (stricter for checkout - 10 requests per 15 minutes)
  const rateLimit = checkRateLimit(req, {
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: "Too many checkout attempts. Please try again later.",
  });

  if (!rateLimit.success && rateLimit.response) {
    // CORS on the 429 too: without it the browser reports a network error
    // and the client cannot read "try again later" (WP5 item 9).
    return addCorsHeaders(addRateLimitHeaders(rateLimit.response, rateLimit), allowedOrigin);
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

    // Per user, persistent across isolates (WP5 item 9). The IP limit above
    // is in-memory and per isolate, and a shared NAT can exhaust it for
    // everyone behind it.
    const userLimit = await checkRateLimitPersistent(req, {
      endpoint: "create-subscription-checkout",
      userId: user.id,
      windowMs: 15 * 60 * 1000,
      max: 10,
      message: "Too many checkout attempts. Please try again later.",
    });
    if (!userLimit.success && userLimit.response) {
      return addCorsHeaders(userLimit.response, allowedOrigin);
    }

    // Parse request body. Malformed JSON is the caller's error, not a 500.
    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      body = parsed as Record<string, unknown>;
    } catch {
      return new Response(
        JSON.stringify({ error: "The request body must be a JSON object.", code: "invalid_json" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const planId = typeof body.planId === "string" ? body.planId : undefined;
    const billingInterval = (body.billingInterval ?? "monthly") as string;
    // Both optional and new (WP5 item 2). Only a literal true counts, so no
    // shipped bundle can send one by accident.
    const preview = body.preview === true;
    const confirm = body.confirm === true;

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

    // Configured, never taken from the request (WP5 item 9). The Origin
    // header is whatever the caller sent, and it becomes the success and
    // cancel URLs Stripe redirects a paying member to.
    const siteUrl = getSiteUrl();

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
    // WEB-CI-032: `error` was discarded on BOTH guard reads below, and a
    // discarded error here is a double charge. supabase-js resolves with an
    // { error } object, so a failed read arrived as data: null - which reads
    // as "this user has no subscription" and lets the sale through. That is
    // the same evaporating-guard failure the comment above describes, reached
    // by a different route. Both now REFUSE rather than sell: declining a
    // checkout is recoverable, charging someone twice is not.
    //
    // WP5 item 3: past_due is read as live too. Stripe is still retrying that
    // subscription, and reading it as "no subscription" sold a second one.
    const { data: webSubscription, error: webSubscriptionError } = await supabase
      .from("user_subscriptions")
      .select("id, stripe_subscription_id, status, cancel_at_period_end, plan_id, billing_interval, subscription_plans(sort_order)")
      .eq("user_id", user.id)
      .eq("platform", "web")
      .in("status", ["active", "trialing", "past_due"])
      .maybeSingle();

    if (webSubscriptionError) {
      console.error("Existing-subscription lookup failed, refusing checkout:", webSubscriptionError);
      return new Response(
        JSON.stringify({
          error: "We could not confirm your current subscription, so we have not started a checkout. Please try again in a moment.",
          code: "subscription_lookup_failed",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // A store subscription cannot be changed from here -- Apple and Google own
    // that billing relationship -- so selling a web plan on top of one at the
    // same or a higher tier is selling a second charge for entitlements the
    // user already has.
    const { data: storeSubscriptions, error: storeSubscriptionsError } = await supabase
      .from("user_subscriptions")
      .select("platform, plan_id, subscription_plans!inner(sort_order, display_name)")
      .eq("user_id", user.id)
      .in("platform", ["ios", "android"])
      .in("status", ["active", "trialing"]);

    if (storeSubscriptionsError) {
      console.error("Store-subscription lookup failed, refusing checkout:", storeSubscriptionsError);
      return new Response(
        JSON.stringify({
          error: "We could not confirm your current subscription, so we have not started a checkout. Please try again in a moment.",
          code: "subscription_lookup_failed",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // WEB-CI-029 AC3. The branch order - store first, then cancel-at-period-end,
    // then same-plan, then upgrade - is the behaviour, and it now lives in a
    // pure module so it can be tested without Stripe or a database. See
    // ./decision.ts for why each check is where it is.
    const outcome = decideCheckout({
      requestedPlanId: planId,
      requestedSortOrder: Number(plan.sort_order ?? 0),
      webSubscription,
      storeSubscriptions,
      requestedInterval: billingInterval,
      quoted: preview || confirm,
    });

    if (outcome.kind === "refuse") {
      return new Response(
        JSON.stringify({
          error: outcome.error,
          code: outcome.code,
          ...(outcome.platform ? { platform: outcome.platform } : {}),
        }),
        { status: outcome.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
    //
    // WP5 item 2: QUOTE, THEN CONFIRM. One click used to charge and only then
    // report the figure. Now:
    //   preview    returns the quote below and changes nothing.
    //   confirm    upgrade / interval: invoiced now (always_invoice), and only
    //              applied if that payment succeeds (pending_if_incomplete),
    //              so the amount charged is the quoted proration.
    //              downgrade: scheduled for period end, no proration.
    //   neither    the legacy one-click path, unchanged for cached bundles.
    if (outcome.kind === "change_plan") {
      try {
        const current = await stripe.subscriptions.retrieve(
          outcome.stripeSubscriptionId
        );
        const currentItem = current.items?.data?.[0];
        const itemId = currentItem?.id;
        if (!itemId) throw new Error("subscription has no items to update");
        const customer = typeof current.customer === "string" ? current.customer : current.customer?.id;

        // A downgrade is deferred only for a client that quoted it. A legacy
        // request keeps the immediate, prorated change it always got.
        const deferDowngrade = outcome.direction === "downgrade" && (preview || confirm);
        const quoteDirection = deferDowngrade
          ? "downgrade"
          : outcome.direction === "interval" ? "interval" : "upgrade";

        // Priced before it is charged, so the answer can be shown to the user
        // rather than discovered on their statement.
        let quote: PlanChangeQuote | null = null;
        try {
          const upcoming = await stripe.invoices.retrieveUpcoming({
            customer,
            subscription: outcome.stripeSubscriptionId,
            subscription_items: [{ id: itemId, price: stripePriceId }],
            subscription_proration_behavior: deferDowngrade ? "none" : "create_prorations",
          });
          quote = quoteFromUpcoming(upcoming, quoteDirection, current.current_period_end);
        } catch (previewError) {
          // Without preview, a failed quote must not block the change itself;
          // the user simply does not get the figure up front.
          console.warn("[create-subscription-checkout] proration preview failed", previewError);
        }

        if (preview) {
          if (!quote) {
            return new Response(
              JSON.stringify({
                error: "We could not price this change right now. Nothing has been changed. Please try again.",
                code: "plan_change_quote_failed",
              }),
              { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          return new Response(
            JSON.stringify({
              ...quote,
              planId,
              planName: plan.name,
              billingInterval,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (deferDowngrade) {
          // A subscription schedule: the current price runs to the end of the
          // period the member paid for, then the lower price starts with no
          // proration. end_behavior 'release' hands the subscription back to
          // normal billing after the switch. customer.subscription.updated
          // fires when the new phase starts, and the webhook moves plan_id
          // from the price then.
          const scheduleId = typeof current.schedule === "string"
            ? current.schedule
            : current.schedule?.id ?? null;
          const schedule = scheduleId
            ? await stripe.subscriptionSchedules.retrieve(scheduleId)
            : await stripe.subscriptionSchedules.create({ from_subscription: outcome.stripeSubscriptionId });
          const currentPhase = schedule.phases?.[0];
          const currentPriceId = currentItem?.price?.id;
          if (!currentPhase || !currentPriceId) throw new Error("subscription schedule has no current phase");

          await stripe.subscriptionSchedules.update(schedule.id, {
            end_behavior: "release",
            phases: [
              {
                items: [{ price: currentPriceId, quantity: currentItem?.quantity ?? 1 }],
                start_date: currentPhase.start_date,
                end_date: current.current_period_end,
                ...(current.status === "trialing" && current.trial_end ? { trial_end: current.trial_end } : {}),
                proration_behavior: "none",
              },
              {
                items: [{ price: stripePriceId, quantity: 1 }],
                proration_behavior: "none",
                iterations: 1,
              },
            ],
            metadata: {
              userId: user.id,
              planId: planId,
              planName: plan.name,
              changedFromPlanId: webSubscription?.plan_id ?? "",
            },
          });

          const effectiveAt = new Date(current.current_period_end * 1000).toISOString();
          return new Response(
            JSON.stringify({
              url: `${siteUrl}/subscription?plan_change=scheduled`,
              upgraded: false,
              scheduled: true,
              effectiveAt,
              subscriptionId: outcome.stripeSubscriptionId,
              code: "plan_change_scheduled",
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const updated = await stripe.subscriptions.update(
          outcome.stripeSubscriptionId,
          confirm
            ? {
                items: [{ id: itemId, price: stripePriceId }],
                // Invoice the quoted proration now, and apply the change only
                // if that invoice is paid. A declined card leaves the member on
                // the plan they have, not on one they did not pay for.
                proration_behavior: "always_invoice",
                payment_behavior: "pending_if_incomplete",
              }
            : {
                items: [{ id: itemId, price: stripePriceId }],
                proration_behavior: "create_prorations",
                metadata: {
                  userId: user.id,
                  planId: planId,
                  planName: plan.name,
                  changedFromPlanId: webSubscription?.plan_id ?? "",
                },
              }
        );

        if (confirm && updated.pending_update) {
          return new Response(
            JSON.stringify({
              error:
                "Your card was declined for the change, so your plan is unchanged. " +
                "Update your payment method from Manage Subscription and try again.",
              code: "plan_change_payment_failed",
            }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // stripe-webhook's customer.subscription.updated handler moves the row
        // to the new plan: it looks the new price up in subscription_plans
        // (planIdForPrice, WP5 item 1). Returning here without waiting keeps
        // one writer for that table.
        return new Response(
          JSON.stringify({
            // Same key the client already redirects on, so no shipped build
            // needs to change to stop double-subscribing.
            url: `${siteUrl}/subscription/success?upgraded=true&plan=${encodeURIComponent(plan.name)}`,
            upgraded: true,
            subscriptionId: updated.id,
            // The proration lines only, in cents; not amount_due, which is the
            // whole next invoice.
            prorationAmount: quote ? quote.amountDueNow : null,
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

    // A quote is only meaningful for a plan change. Anything else asked to
    // preview is answered without opening a Checkout session.
    if (preview) {
      return new Response(
        JSON.stringify({
          error: "There is no current subscription to change, so there is nothing to preview.",
          code: "no_plan_change",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // WP5 item 6: ONE CUSTOMER, SO ONE LIVE CHECKOUT CAN BE ENFORCED.
    //
    // The customer this user already pays through wins: the web row's
    // stripe_customer_id, from any status. Email is the fallback, because an
    // email can change and a second customer is where a second subscription
    // hides. With neither, the customer is created here (idempotently) rather
    // than by Checkout, so every session this user opens hangs off one
    // customer and the open ones can be found and expired below.
    let customerId: string | undefined;
    const { data: customerRow, error: customerRowError } = await supabase
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .eq("platform", "web")
      .not("stripe_customer_id", "is", null)
      .limit(1)
      .maybeSingle();

    if (customerRowError) {
      // Not fatal: the email lookup below finds the same customer for anyone
      // whose email has not changed. Logged, because it is a degraded path.
      console.error("[create-subscription-checkout] customer read failed, falling back to email:", customerRowError);
    } else if (customerRow?.stripe_customer_id) {
      customerId = customerRow.stripe_customer_id as string;
    }

    if (!customerId) {
      const customers = await stripe.customers.list({
        email: user.email!,
        limit: 1,
      });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      }
    }

    // Trial eligibility reads the Stripe history of a customer that existed
    // BEFORE this request; one created just now has none by definition.
    const preexistingCustomerId = customerId;

    if (!customerId) {
      const created = await stripe.customers.create(
        { email: user.email!, metadata: { userId: user.id } },
        { idempotencyKey: `sub-customer:${user.id}` },
      );
      customerId = created.id;
    }

    // WEB-FEAT-014 -- THE TRIAL IS A FIRST-PURCHASE BENEFIT, NOT A PER-PURCHASE ONE.
    //
    // The decision used to be `existingSubscription ? undefined : 7`, reading the
    // active-or-trialing WEB row. Cancel, lapse, resubscribe matched nothing and
    // bought another 7 free days, repeatable once per cancellation. Both reads
    // below are deliberately unfiltered by status and platform: a cancelled row
    // and an iOS row are each a trial this user has already had.
    const { count: priorTrialRowCount, error: trialHistoryError } = await supabase
      .from("user_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .not("trial_start", "is", null);

    if (trialHistoryError) {
      // Same posture as the two guards above: a discarded error here reads as
      // "never had a trial" and hands out the thing this story exists to stop.
      console.error("Trial-history lookup failed, refusing checkout:", trialHistoryError);
      return new Response(
        JSON.stringify({
          error: "We could not confirm your current subscription, so we have not started a checkout. Please try again in a moment.",
          code: "subscription_lookup_failed",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Stripe remembers what our own table does not: delete the account, sign up
    // again with the same email, and the customer -- with its subscription
    // history -- is still there.
    let priorStripeSubscriptionCount = 0;
    if (preexistingCustomerId) {
      const priorStripeSubs = await stripe.subscriptions.list({
        customer: preexistingCustomerId,
        status: "all",
        limit: 1,
      });
      priorStripeSubscriptionCount = priorStripeSubs.data.length;
    }

    const trialDays = trialPeriodDays({
      priorTrialRowCount: priorTrialRowCount ?? 0,
      priorStripeSubscriptionCount,
    });

    // Build success and cancel URLs (siteUrl is declared above)
    const successUrl = `${siteUrl}/subscription/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${siteUrl}/pricing?canceled=true`;

    // Create checkout session options
    const sessionOptions: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      // Stripe requires this when a customer is passed with tax ID collection
      // on; it lets Checkout save the business name the buyer enters.
      customer_update: { name: "auto" },
      // Ties the session to our user without trusting metadata alone.
      client_reference_id: user.id,
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
        // First purchase only -- see the two reads above (WEB-FEAT-014).
        trial_period_days: trialDays,
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

    // A double click, or two tabs, inside the same minute gets the SAME
    // session back instead of a second one.
    const idempotencyKey =
      `sub-checkout:${user.id}:${planId}:${billingInterval}:${Math.floor(Date.now() / 60_000)}`;
    const session = await stripe.checkout.sessions.create(sessionOptions, { idempotencyKey });

    // Every OTHER open subscription checkout for this customer is expired, so
    // a tab left open yesterday cannot be paid as a second subscription. This
    // runs after create rather than before it on purpose: expiring first
    // would also expire the session the idempotency key is about to hand
    // back to a double click. Best effort: a session that survives is caught
    // by the webhook, which refuses to let it replace a live subscription.
    try {
      const open = await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 20 });
      for (const other of open.data) {
        if (other.id === session.id || other.mode !== "subscription") continue;
        try {
          await stripe.checkout.sessions.expire(other.id);
        } catch (expireError) {
          console.warn(`[create-subscription-checkout] could not expire session ${other.id}`, expireError);
        }
      }
    } catch (listError) {
      console.warn("[create-subscription-checkout] could not list open sessions", listError);
    }

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

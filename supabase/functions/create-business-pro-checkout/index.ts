/**
 * Business Pro checkout and billing portal (growth roadmap #3, part 2).
 *
 * POST { listingType, listingId, action?: "checkout" | "portal" }
 *
 * checkout  Starts a Stripe Checkout session for Business Pro on one listing.
 *           Refused unless the caller holds a VERIFIED claim on it, and
 *           refused when Pro is already live there.
 * portal    Opens the Stripe billing portal for that listing's subscription,
 *           which is where an owner cancels or changes the card.
 *
 * MONEY IS DECIDED HERE (CLAUDE.md). The request names a listing and nothing
 * else. The price charged is business_plans.stripe_price_id_monthly, read with
 * the service role; the body is never asked for an amount, a price or a plan.
 * If that price id is not set yet, checkout answers 503 "not_configured" and
 * charges nothing.
 *
 * The session and the subscription both carry kind=business_pro metadata and
 * no planId, so stripe-webhook files them in business_subscriptions and never
 * in user_subscriptions (see _shared/businessPro.ts).
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleCors, getCorsHeaders, isOriginAllowed, addCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, checkRateLimitPersistent, addRateLimitHeaders } from "../_shared/rateLimit.ts";
import { getSiteUrl } from "../_shared/siteUrl.ts";
import {
  BUSINESS_PRO_KIND,
  BUSINESS_PRO_SLUG,
  LIVE_STATUSES,
  businessProMetadata,
  parseCheckoutRequest,
} from "../_shared/businessPro.ts";

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || "";
  const allowedOrigin = isOriginAllowed(origin) ? origin : undefined;
  const corsHeaders = getCorsHeaders(allowedOrigin);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const rateLimit = checkRateLimit(req, {
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: "Too many checkout attempts. Please try again later.",
  });
  if (!rateLimit.success && rateLimit.response) {
    return addCorsHeaders(addRateLimitHeaders(rateLimit.response, rateLimit), allowedOrigin);
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authorization required" }, 401);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return json({ error: "Invalid authentication" }, 401);
    if (!user.email_confirmed_at) {
      return json({ error: "Please verify your email address first.", code: "email_verification_required" }, 403);
    }

    const userLimit = await checkRateLimitPersistent(req, {
      endpoint: "create-business-pro-checkout",
      userId: user.id,
      windowMs: 15 * 60 * 1000,
      max: 10,
      message: "Too many checkout attempts. Please try again later.",
    });
    if (!userLimit.success && userLimit.response) return addCorsHeaders(userLimit.response, allowedOrigin);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "The request body must be a JSON object.", code: "invalid_json" }, 400);
    }
    const parsed = parseCheckoutRequest(body);
    if ("error" in parsed) return json({ error: parsed.error, code: "invalid_request" }, 400);
    const { action, listingType, listingId } = parsed;

    // Only the verified owner of this listing may buy or manage Pro for it.
    const { data: claim, error: claimError } = await supabase
      .from("business_claims")
      .select("id")
      .eq("user_id", user.id)
      .eq("listing_type", listingType)
      .eq("listing_id", listingId)
      .eq("status", "verified")
      .maybeSingle();
    if (claimError) {
      console.error("[create-business-pro-checkout] claim lookup failed:", claimError);
      return json({ error: "We could not confirm you manage this listing. Please try again.", code: "claim_lookup_failed" }, 503);
    }
    if (!claim) return json({ error: "Only the verified owner of this listing can do that.", code: "not_listing_owner" }, 403);

    const { data: existing, error: existingError } = await supabase
      .from("business_subscriptions")
      .select("stripe_subscription_id, stripe_customer_id, status")
      .eq("user_id", user.id)
      .eq("listing_type", listingType)
      .eq("listing_id", listingId)
      .order("created_at", { ascending: false });
    if (existingError) {
      console.error("[create-business-pro-checkout] subscription lookup failed:", existingError);
      return json({ error: "We could not check your current plan. Please try again.", code: "subscription_lookup_failed" }, 503);
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2023-10-16" });
    // Configured, never taken from the request: these become Stripe redirect URLs.
    const siteUrl = getSiteUrl();

    if (action === "portal") {
      const customerId = (existing ?? []).find((r) => r.stripe_customer_id)?.stripe_customer_id;
      if (!customerId) return json({ error: "There is no Business Pro billing for this listing yet.", code: "no_subscription" }, 404);
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${siteUrl}/business`,
      });
      return addRateLimitHeaders(json({ url: portal.url }), rateLimit);
    }

    if ((existing ?? []).some((r) => LIVE_STATUSES.has(r.status))) {
      return json({ error: "Business Pro is already on for this listing.", code: "already_subscribed" }, 409);
    }

    const { data: plan, error: planError } = await supabase
      .from("business_plans")
      .select("id, stripe_price_id_monthly")
      .eq("slug", BUSINESS_PRO_SLUG)
      .eq("is_active", true)
      .maybeSingle();
    if (planError) {
      console.error("[create-business-pro-checkout] plan lookup failed:", planError);
      return json({ error: "Checkout is unavailable right now. Please try again.", code: "plan_lookup_failed" }, 503);
    }
    if (!plan?.stripe_price_id_monthly) {
      // The Stripe price has not been created and set yet. Nothing is charged.
      return json({ error: "Business Pro isn't available to buy yet.", code: "not_configured" }, 503);
    }

    // One Stripe customer per person: reuse the one their reader plan or an
    // earlier Business Pro used, then any customer with their email.
    let customerId: string | undefined =
      (existing ?? []).find((r) => r.stripe_customer_id)?.stripe_customer_id ?? undefined;
    if (!customerId) {
      const { data: readerRow, error: readerRowError } = await supabase
        .from("user_subscriptions")
        .select("stripe_customer_id")
        .eq("user_id", user.id)
        .not("stripe_customer_id", "is", null)
        .limit(1)
        .maybeSingle();
      if (readerRowError) {
        // Best-effort reuse: on a failed read, fall through to the email
        // lookup below, the same fallback create-subscription-checkout uses.
        console.error("[create-business-pro-checkout] reader customer read failed, falling back to email:", readerRowError);
      } else {
        customerId = (readerRow?.stripe_customer_id as string | undefined) ?? undefined;
      }
    }
    if (!customerId) {
      const found = await stripe.customers.list({ email: user.email!, limit: 1 });
      customerId = found.data[0]?.id;
    }
    if (!customerId) {
      const created = await stripe.customers.create(
        { email: user.email!, metadata: { userId: user.id } },
        { idempotencyKey: `bp-customer:${user.id}` },
      );
      customerId = created.id;
    }

    const metadata = businessProMetadata({ userId: user.id, listingType, listingId, businessPlanId: plan.id });
    const session = await stripe.checkout.sessions.create(
      {
        customer: customerId,
        customer_update: { name: "auto" },
        client_reference_id: user.id,
        line_items: [{ price: plan.stripe_price_id_monthly, quantity: 1 }],
        mode: "subscription",
        success_url: `${siteUrl}/business?pro=success`,
        cancel_url: `${siteUrl}/business?pro=canceled`,
        metadata,
        subscription_data: { metadata },
        allow_promotion_codes: true,
        billing_address_collection: "auto",
        tax_id_collection: { enabled: true },
      },
      // A double click in the same minute gets the same session back.
      { idempotencyKey: `bp-checkout:${user.id}:${listingType}:${listingId}:${Math.floor(Date.now() / 60_000)}` },
    );

    // Expire this person's OTHER open Business Pro checkouts for the same
    // listing, so a stale tab cannot be paid as a second subscription. Reader
    // plan checkouts are left alone.
    try {
      const open = await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 20 });
      for (const other of open.data) {
        if (other.id === session.id || other.metadata?.kind !== BUSINESS_PRO_KIND) continue;
        if (other.metadata?.listingId !== listingId) continue;
        try {
          await stripe.checkout.sessions.expire(other.id);
        } catch (expireError) {
          console.warn(`[create-business-pro-checkout] could not expire session ${other.id}`, expireError);
        }
      }
    } catch (listError) {
      console.warn("[create-business-pro-checkout] could not list open sessions", listError);
    }

    return addRateLimitHeaders(json({ url: session.url, sessionId: session.id }), rateLimit);
  } catch (error) {
    console.error("[create-business-pro-checkout] failed:", error);
    return json({ error: "Failed to start checkout" }, 500);
  }
});

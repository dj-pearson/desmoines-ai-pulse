/**
 * Manage Subscription Edge Function
 *
 * Provides subscription management operations:
 * - Create Stripe Customer Portal session (for payment methods, cancel, etc.)
 * - Cancel subscription
 * - Resume subscription (if canceled but period not ended)
 * - Get subscription details (the default when no action is sent)
 * - List Stripe invoices (WP5 item 8)
 *
 * An unknown action is a 400; a missing one is "details", which is what every
 * shipped bundle that omits it has always received.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleCors, getCorsHeaders, isOriginAllowed, addCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimitPersistent } from "../_shared/rateLimit.ts";
import { getSiteUrl, manageAtForPlatform, STORE_MANAGE_URLS, type ManageAt } from "../_shared/siteUrl.ts";

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

/** The Stripe invoice fields the invoices action returns. */
interface InvoiceSummarySource {
  id: string;
  number: string | null;
  created: number;
  status: string | null;
  amount_paid: number;
  currency: string;
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
}

const ACTIONS = ["portal", "cancel", "resume", "details", "invoices"] as const;
type Action = typeof ACTIONS[number];

/** Reads are cheap and polled; writes move Stripe state. */
const LIMITS: Record<"read" | "write", { max: number; windowMs: number }> = {
  read: { max: 60, windowMs: 15 * 60 * 1000 },
  write: { max: 10, windowMs: 15 * 60 * 1000 },
};

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || "";
  const allowedOrigin = isOriginAllowed(origin) ? origin : undefined;
  const corsHeaders = getCorsHeaders(allowedOrigin);

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
    const { returnUrl } = body ?? {};
    const requestedAction = body?.action ?? "details";
    if (!ACTIONS.includes(requestedAction)) {
      return new Response(
        JSON.stringify({ error: "Unknown action.", code: "unknown_action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const action = requestedAction as Action;

    // Per user, persistent (WP5 item 8). Looser for the reads the portal
    // polls, tight for the ones that change a Stripe subscription.
    const limitKind = action === "details" || action === "invoices" ? "read" : "write";
    const limit = await checkRateLimitPersistent(req, {
      endpoint: `manage-subscription:${limitKind}`,
      userId: user.id,
      ...LIMITS[limitKind],
    });
    if (!limit.success && limit.response) {
      return addCorsHeaders(limit.response, allowedOrigin);
    }

    // WEB-FEAT-015 -- ONE ROW PER PLATFORM, SO .single() WAS NEVER SAFE HERE.
    //
    // This was a single unfiltered .single() over every platform. A user may
    // legitimately hold one row PER platform, so a subscriber with a web row
    // and an iOS row matched two and .single() returned PGRST116 with data
    // null: read as "no subscription" by all four branches. The users it broke
    // were the ones paying us the most.
    //
    // Splitting the read also answers the iOS-only case properly. Those rows
    // carry no stripe_customer_id, so they used to fall into the same "No
    // active subscription found" message; Stripe cannot act on them, but the
    // App Store can, and that is what manageAt below tells the client.
    const SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due"];

    const { data: subscription, error: subError } = await supabase
      .from("user_subscriptions")
      .select(`
        *,
        plan:subscription_plans(*)
      `)
      .eq("user_id", user.id)
      .eq("platform", "web")
      .in("status", SUBSCRIPTION_STATUSES)
      .maybeSingle();

    const { data: storeSubscriptions, error: storeSubError } = await supabase
      .from("user_subscriptions")
      .select(`
        *,
        plan:subscription_plans(*)
      `)
      .eq("user_id", user.id)
      .in("platform", ["ios", "android"])
      .in("status", SUBSCRIPTION_STATUSES);

    // EVERY ERROR WAS DISCARDED here, and all four branches read the resulting
    // null as proof of absence - "portal" and "cancel" answer "No active
    // subscription found", and "details" answers subscription: null. So one
    // failed read told a paying customer they had no subscription, and told the
    // UI to render them as a free user.
    //
    // Failing closed is the right side to err on. With no trustworthy read we
    // cannot distinguish "no subscription" from "could not look", and only one
    // of those is safe to act on. maybeSingle() does not raise PGRST116 for the
    // empty case, so there is no longer an error code to special-case.
    if (subError || storeSubError) {
      console.error("[manage-subscription] subscription read failed", subError ?? storeSubError);
      return new Response(
        JSON.stringify({ error: "Could not read your subscription. Please try again." }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Apple and Google own the billing relationship for their rows; the most
    // recently started one is the one to send the user to.
    const storeRows = (storeSubscriptions ?? []) as Array<Record<string, unknown>>;
    const storeSubscription = storeRows
      .slice()
      .sort((a, b) =>
        String(b["current_period_start"] ?? "").localeCompare(String(a["current_period_start"] ?? "")),
      )[0];
    const manageAt: ManageAt | null = storeSubscription
      ? manageAtForPlatform(storeSubscription["platform"] as string | null)
      : null;

    /**
     * The answer for a store-billed subscriber. 200, not an error: the request
     * is answerable, just not by Stripe, and supabase.functions.invoke drops
     * the body of a non-2xx response - so a 4xx here would hand the client a
     * generic failure and lose the deep link that is the entire point.
     */
    const storeManagedResponse = () =>
      new Response(
        JSON.stringify({
          managedExternally: true,
          manageAt,
          manageUrl: manageAt ? STORE_MANAGE_URLS[manageAt] : null,
          platform: storeSubscription?.["platform"] ?? null,
          message:
            manageAt === "appstore"
              ? "Your subscription is billed by the App Store. Manage or cancel it there."
              : "Your subscription is billed by Google Play. Manage or cancel it there.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );

    // Handle different actions
    switch (action) {
      case "portal": {
        // Create Stripe Customer Portal session
        if (!subscription?.stripe_customer_id) {
          // A store-billed subscriber is not a subscriber without a
          // subscription. Send them where their billing actually lives.
          if (manageAt) return storeManagedResponse();

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
        // managing their subscription. WEB-FEAT-015 moved the resolution into
        // _shared/siteUrl.ts so the literal lives in exactly one place.
        const siteUrl = getSiteUrl();

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
          // Stripe cannot cancel what Apple or Google bills.
          if (manageAt) return storeManagedResponse();

          return new Response(
            JSON.stringify({ error: "No active subscription found" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        const canceled = await stripe.subscriptions.update(subscription.stripe_subscription_id, {
          cancel_at_period_end: true,
        });

        // Update local database. Stripe has already changed, so a failed write
        // is logged, not returned as a failure: the member did cancel, and
        // customer.subscription.updated writes the same column shortly.
        const { error: cancelWriteError } = await supabase
          .from("user_subscriptions")
          .update({
            cancel_at_period_end: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", subscription.id);
        if (cancelWriteError) {
          console.error("[manage-subscription] local cancel write failed; the webhook will sync it", cancelWriteError);
        }

        // The state is Stripe's answer, not a restatement of our row, so the
        // portal can render it without a refetch (WP5 item 8).
        const canceledPeriodEnd = new Date(canceled.current_period_end * 1000).toISOString();
        return new Response(
          JSON.stringify({
            success: true,
            message: "Subscription will be canceled at period end",
            cancel_at: canceledPeriodEnd,
            cancelAtPeriodEnd: canceled.cancel_at_period_end,
            currentPeriodEnd: canceledPeriodEnd,
            synced: !cancelWriteError,
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
          if (manageAt) return storeManagedResponse();

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

        const resumed = await stripe.subscriptions.update(subscription.stripe_subscription_id, {
          cancel_at_period_end: false,
        });

        // Same posture as cancel: Stripe is the record, the row follows.
        const { error: resumeWriteError } = await supabase
          .from("user_subscriptions")
          .update({
            cancel_at_period_end: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", subscription.id);
        if (resumeWriteError) {
          console.error("[manage-subscription] local resume write failed; the webhook will sync it", resumeWriteError);
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: "Subscription has been resumed",
            cancelAtPeriodEnd: resumed.cancel_at_period_end,
            currentPeriodEnd: new Date(resumed.current_period_end * 1000).toISOString(),
            synced: !resumeWriteError,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      case "invoices": {
        // Stripe is the ledger (pricing plan, "Billing history"): the local
        // payments and invoices tables are not in production, and a second
        // record of the same money is one more thing to disagree with it.
        // Any web row with a customer counts, so a member who cancelled can
        // still fetch last year's receipts.
        const { data: customerRow, error: customerError } = await supabase
          .from("user_subscriptions")
          .select("stripe_customer_id")
          .eq("user_id", user.id)
          .eq("platform", "web")
          .not("stripe_customer_id", "is", null)
          .limit(1)
          .maybeSingle();

        if (customerError) {
          console.error("[manage-subscription] customer read failed", customerError);
          return new Response(
            JSON.stringify({ error: "Could not read your billing history. Please try again." }),
            { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!customerRow?.stripe_customer_id) {
          // Nothing Stripe billed. A store subscriber's receipts live with
          // the store, so say where.
          return new Response(
            JSON.stringify({
              invoices: [],
              manageAt,
              manageUrl: manageAt ? STORE_MANAGE_URLS[manageAt] : null,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const list = await stripe.invoices.list({
          customer: customerRow.stripe_customer_id as string,
          limit: 12,
        });

        return new Response(
          JSON.stringify({
            invoices: list.data.map((invoice: InvoiceSummarySource) => ({
              id: invoice.id,
              number: invoice.number,
              created: new Date(invoice.created * 1000).toISOString(),
              status: invoice.status,
              // Cents, as Stripe gives them. The client formats; it does not
              // do arithmetic on money.
              amountPaid: invoice.amount_paid,
              currency: invoice.currency,
              hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
              invoicePdf: invoice.invoice_pdf ?? null,
            })),
            manageAt: null,
            manageUrl: null,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "details": {
        // WEB-FEAT-015: a store-billed subscriber used to land here with
        // subscription null and be reported as tier "free" -- the portal then
        // offered them the plan they were already paying for. Every row the
        // user holds counts, whoever bills it.
        const allRows = [
          ...(subscription ? [subscription as Record<string, unknown>] : []),
          ...storeRows,
        ];

        if (allRows.length === 0) {
          return new Response(
            JSON.stringify({
              subscription: null,
              tier: "free",
              hasActiveSubscription: false,
              manageAt: null,
              manageUrl: null,
              platforms: [],
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        const planOf = (row: Record<string, unknown>) =>
          (row["plan"] ?? null) as { name?: string; sort_order?: number } | null;

        // The web row is what cancel/resume act on, so it stays the primary one
        // when it exists; a store-only subscriber gets their store row instead.
        const primary = (subscription ?? storeSubscription) as Record<string, unknown>;

        // Tier is the HIGHEST plan the user holds anywhere. Reporting the web
        // row's tier to someone whose iOS row is higher understates what they
        // have already paid for.
        const highest = allRows
          .slice()
          .sort((a, b) => Number(planOf(b)?.sort_order ?? 0) - Number(planOf(a)?.sort_order ?? 0))[0];

        const platforms = allRows.map((row) => ({
          platform: row["platform"] ?? "web",
          tier: planOf(row)?.name ?? "free",
          status: row["status"] ?? null,
          currentPeriodEnd: row["current_period_end"] ?? null,
          cancelAtPeriodEnd: row["cancel_at_period_end"] ?? false,
          manageAt: manageAtForPlatform(row["platform"] as string | null),
        }));

        // The payments read that stood here is gone (WP5 item 8): that table
        // is not in production, so every call paid for a failed query and
        // reported an empty history. `payments: []` stays in the response
        // below for bundles that read the key; the `invoices` action is the
        // real billing history.

        // Get upcoming invoice from Stripe. Only a Stripe-billed row has one --
        // Apple and Google do not expose the next charge to us.
        let upcomingInvoice = null;
        if (subscription?.stripe_subscription_id) {
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
              id: primary["id"],
              status: primary["status"],
              plan: planOf(primary),
              platform: primary["platform"] ?? "web",
              currentPeriodStart: primary["current_period_start"],
              currentPeriodEnd: primary["current_period_end"],
              cancelAtPeriodEnd: primary["cancel_at_period_end"],
              trialEnd: primary["trial_end"],
            },
            tier: planOf(highest)?.name || "free",
            hasActiveSubscription: true,
            // Null for a web subscriber; the store deep link for anyone whose
            // billing this function cannot touch.
            manageAt: subscription ? null : manageAt,
            manageUrl: subscription || !manageAt ? null : STORE_MANAGE_URLS[manageAt],
            platforms,
            payments: [],
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

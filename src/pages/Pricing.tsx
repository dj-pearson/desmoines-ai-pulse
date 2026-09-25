import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import FAQSchema from "@/components/schema/FAQSchema";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToastAction } from "@/components/ui/toast";
import { PlanCard, planCtaId, type PlanCardCta } from "@/components/pricing/PlanCard";
import { BillingPeriodToggle, type BillingPeriod } from "@/components/pricing/BillingPeriodToggle";
import { PricingFaq, PRICING_FAQS, faqAnswerText } from "@/components/pricing/PricingFaq";
import { YourPlanPanel, tierLabel } from "@/components/pricing/YourPlanPanel";
import { useAuth } from "@/hooks/useAuth";
import { isCheckoutFailure, useSubscription } from "@/hooks/useSubscription";
import { useTrialEligibility } from "@/hooks/useTrialEligibility";
import { useToast } from "@/hooks/use-toast";
import { useConversionFunnel } from "@/hooks/useConversionFunnel";
import { handleError } from "@/lib/errorHandler";
import { getCanonicalUrl } from "@/lib/brandConfig";
import { benefitsFor, displayPrice, yearlySavings, type PlanName } from "@/lib/planBenefits";
import {
  IN_PLACE_PLAN_CHANGE_ENABLED,
  PLAN_CHANGE_PAUSED_CODE,
  PLAN_CHANGE_PAUSED_MESSAGE,
} from "@/lib/billingStatus";

/**
 * /pricing (pricing plan WP2).
 *
 * WHAT THIS PAGE MAY SAY. Benefit lines come only from benefitsFor() in
 * src/lib/planBenefits.ts, which holds lines for keys that have a gate reading
 * them (WEB-FEAT-016), and plan-features-truthful.test.ts scans this file's
 * whole text for withdrawn phrases. Do not write a benefit line here. The trip
 * planner line appears only while AI_PLANNER_AVAILABLE is true, and its quota
 * comes from TRIP_PLANNER_MONTHLY_QUOTA, which the Deno test pins to the quota
 * generate-itinerary enforces (Insider 5 a month, VIP no limit).
 *
 * VIP today adds one thing over Insider: no cap on saved searches (the live
 * create_event_saved_search caps Insider at 10). Whether that is worth its
 * price, or VIP should be withdrawn, is the owner's decision (pricing D-VIP).
 * "Advanced search filters" stays on Insider verbatim until Search D2 decides
 * it; that line lives in planBenefits.ts, not here.
 *
 * MONEY. Every figure on this page is display only. displayPrice reads the
 * plan rows; the charge is decided by the Stripe price object that
 * create-subscription-checkout picks from the plan id we send. Nothing here
 * computes an amount that reaches Stripe or a row.
 */

interface PlanMeta {
  id: PlanName;
  name: string;
  description: string;
  paidCta: string;
  featured?: boolean;
  badge?: string;
}

const PLAN_META: PlanMeta[] = [
  {
    id: "free",
    name: "Free",
    description: "Browse everything on in Des Moines and keep a short list.",
    paidCta: "Create free account",
  },
  {
    id: "insider",
    name: "Insider",
    description: "For regulars who want alerts, reviews and no ads.",
    paidCta: "Become an Insider",
    featured: true,
    badge: "Recommended",
  },
  {
    id: "vip",
    name: "VIP",
    description: "Insider with no cap on saved searches.",
    paidCta: "Go VIP",
  },
];

const PAID: PlanName[] = ["insider", "vip"];
const isPlanName = (v: string | null): v is PlanName => v === "free" || v === "insider" || v === "vip";

const STORE_NAME: Record<string, string> = { ios: "the App Store", android: "Google Play" };
const STORE_MANAGE_URL: Record<string, string> = {
  ios: "https://apps.apple.com/account/subscriptions",
  android: "https://play.google.com/store/account/subscriptions",
};

const money = (n: number) => `$${n.toFixed(2)}`;

export default function Pricing() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, user, resendVerification } = useAuth();
  const {
    plans: dbPlans,
    plansLoading,
    plansError,
    subscriptions,
    subscriptionLoading,
    startCheckout,
    tier: currentTier,
  } = useSubscription();
  const { isEligibleForTrial } = useTrialEligibility();
  const { toast } = useToast();
  const { trackFunnelEvent } = useConversionFunnel();

  const requestedPlan = searchParams.get("plan");
  const [billing, setBilling] = useState<BillingPeriod>(
    searchParams.get("billing") === "yearly" ? "yearly" : "monthly",
  );
  const [loadingPlan, setLoadingPlan] = useState<PlanName | null>(null);
  const [changePlanTarget, setChangePlanTarget] = useState<PlanName | null>(null);
  const [continueDismissed, setContinueDismissed] = useState(false);

  const signedIn = isAuthenticated && !!user;
  const tierKnown = signedIn && !subscriptionLoading;

  // An active or trialing WEB row on a paid tier. While in-place plan changes
  // are paused (billingStatus.ts), a click on another paid tier must not reach
  // create-subscription-checkout: today that charges the new price and the
  // webhook never moves the row (pricing plan WP5 item 1, D1).
  const webPaidPlan = useMemo<PlanName | null>(() => {
    const row = subscriptions.find(
      (s) =>
        s.platform === "web" &&
        (s.status === "active" || s.status === "trialing") &&
        (s.plan?.name === "insider" || s.plan?.name === "vip"),
    );
    return row?.plan?.name === "insider" || row?.plan?.name === "vip" ? row.plan.name : null;
  }, [subscriptions]);

  const isCurrent = useCallback(
    (id: PlanName) => tierKnown && (currentTier === id || webPaidPlan === id),
    [tierKnown, currentTier, webPaidPlan],
  );

  // Track pricing page view
  useEffect(() => {
    trackFunnelEvent("funnel_pricing_page_viewed");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Returned from a cancelled Stripe checkout. The flag is stripped after the
  // toast so a reload doesn't log a second abandonment.
  useEffect(() => {
    if (searchParams.get("canceled") !== "true") return;
    trackFunnelEvent("funnel_checkout_abandoned");
    toast({
      title: "Checkout cancelled",
      description: "Nothing was charged. Your account is as it was.",
    });
    const next = new URLSearchParams(searchParams);
    next.delete("canceled");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep ?billing= in step with the toggle, so a shared or reloaded URL shows
  // the same prices and the sign-in hand-off carries the choice.
  const changeBilling = (next: BillingPeriod) => {
    setBilling(next);
    const params = new URLSearchParams(searchParams);
    params.set("billing", next);
    setSearchParams(params, { replace: true });
  };

  // A plan-row read failure is not "no plans": say so, report it, offer a retry.
  useEffect(() => {
    if (plansError) handleError(plansError, { component: "Pricing", action: "loadPlans" });
  }, [plansError]);

  const retryPlans = () => {
    void queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
  };

  // ?plan= from the paywall or the sign-in round trip: scroll to that card and
  // focus its button once it can take focus (paid buttons are disabled while
  // the plan rows load). Never starts checkout on its own.
  const focusedFromParam = useRef(false);
  useEffect(() => {
    if (focusedFromParam.current || !isPlanName(requestedPlan)) return;
    if (plansLoading || (signedIn && subscriptionLoading)) return;
    focusedFromParam.current = true;
    const frame = requestAnimationFrame(() => {
      const card = document.getElementById(`plan-${requestedPlan}`);
      const button = document.getElementById(planCtaId(requestedPlan));
      card?.scrollIntoView({ block: "center" });
      button?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [requestedPlan, plansLoading, signedIn, subscriptionLoading]);

  const signInRedirect = (id: PlanName) =>
    "/auth?redirect=" + encodeURIComponent("/pricing?plan=" + id + "&billing=" + billing);

  const showCheckoutFailure = (
    planId: PlanName,
    result: { code: string | null; message: string; platform?: "ios" | "android" },
  ) => {
    switch (result.code) {
      case PLAN_CHANGE_PAUSED_CODE:
        // The hook refused before calling the server; same dialog as the card.
        setChangePlanTarget(planId);
        return;
      case "email_verification_required": {
        const email = user?.email;
        toast({
          title: "Verify your email first",
          description: result.message || "Please verify your email address before subscribing.",
          variant: "destructive",
          action: email ? (
            <ToastAction
              altText="Resend verification email"
              onClick={async () => {
                try {
                  const sent = await resendVerification(email);
                  toast(
                    sent.success
                      ? { title: "Verification email sent", description: `Check ${email}, then come back and subscribe.` }
                      : { title: "Couldn't send the email", description: sent.error || "Try again in a minute.", variant: "destructive" },
                  );
                } catch (error) {
                  handleError(error, { component: "Pricing", action: "resendVerification" });
                  toast({ title: "Couldn't send the email", description: "Try again in a minute.", variant: "destructive" });
                }
              }}
            >
              Resend email
            </ToastAction>
          ) : undefined,
        });
        return;
      }
      case "store_subscription_active": {
        const store = result.platform ? STORE_NAME[result.platform] : null;
        const url = result.platform ? STORE_MANAGE_URL[result.platform] : null;
        toast({
          title: store ? `You already have a plan through ${store}` : "You already have a plan in the app",
          description: result.message,
          action: url ? (
            <ToastAction altText={`Manage in ${store}`} onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
              Manage
            </ToastAction>
          ) : undefined,
        });
        return;
      }
      case "resume_required":
      case "already_subscribed":
        toast({
          title: result.code === "resume_required" ? "Your plan is set to end" : "You already have this plan",
          description: result.message,
          action: (
            <ToastAction altText="Open your subscription" onClick={() => navigate("/subscription")}>
              Open
            </ToastAction>
          ),
        });
        return;
      default:
        toast({
          title: "Checkout didn't start",
          description: result.message || "Something went wrong on our side. Nothing was charged.",
          variant: "destructive",
        });
    }
  };

  const handleSelectPlan = async (planId: PlanName) => {
    trackFunnelEvent("funnel_plan_selected", { planId, billing });

    if (planId === "free") {
      navigate(signedIn ? "/subscription" : "/auth?mode=signup");
      return;
    }

    if (!signedIn) {
      navigate(signInRedirect(planId));
      return;
    }

    if (isCurrent(planId)) return;

    if (webPaidPlan && webPaidPlan !== planId && !IN_PLACE_PLAN_CHANGE_ENABLED) {
      setChangePlanTarget(planId);
      return;
    }

    const plan = dbPlans.find((p) => p.name === planId);
    if (!plan) {
      toast({
        title: "Plans couldn't load",
        description: "Reload the page and try again. Nothing was charged.",
        variant: "destructive",
      });
      return;
    }

    const priceId = billing === "yearly" ? plan.stripe_price_id_yearly : plan.stripe_price_id_monthly;
    if (!priceId) {
      toast({
        title: "Not available online yet",
        description: "This plan can't be bought on the website yet. Email billing@desmoinesinsider.com and we'll help.",
      });
      return;
    }

    trackFunnelEvent("funnel_checkout_started", { planId, planDbId: plan.id, billing });
    setLoadingPlan(planId);
    try {
      const result = await startCheckout(plan.id, billing);
      // On success startCheckout has already navigated to Stripe; keep the
      // spinner until the page unloads.
      if (!isCheckoutFailure(result)) return;
      showCheckoutFailure(planId, result);
    } catch (error) {
      handleError(error, { component: "Pricing", action: "checkout" });
      toast({
        title: "Checkout didn't start",
        description: "Something went wrong on our side. Nothing was charged.",
        variant: "destructive",
      });
    }
    setLoadingPlan(null);
  };

  // Display prices, from the plan rows (fallback figures only while they load).
  const priceFor = (id: PlanName, period: BillingPeriod): number | null =>
    id === "free" ? 0 : displayPrice(dbPlans, id, period);

  const maxYearlySavingsPct = useMemo(() => {
    const pcts = PAID.map((id) => {
      const m = displayPrice(dbPlans, id, "monthly");
      const y = displayPrice(dbPlans, id, "yearly");
      return m && y ? Math.round((1 - y / (m * 12)) * 100) : null;
    }).filter((p): p is number => p !== null);
    return pcts.length ? Math.max(...pcts) : null;
  }, [dbPlans]);

  const limitsOf = (id: PlanName) => dbPlans.find((p) => p.name === id)?.limits;

  const ctaFor = (id: PlanName, meta: PlanMeta): PlanCardCta => {
    if (id === "free") {
      if (!signedIn) return { label: "Create free account", href: "/auth?mode=signup" };
      if (tierKnown && currentTier === "free") return { label: "Your plan", disabled: true };
      if (tierKnown) return { label: "Manage subscription", href: "/subscription" };
      return { label: "Free", disabled: true };
    }
    if (isCurrent(id)) return { label: "Current plan", disabled: true };
    const blockedByData = plansLoading || !!plansError || (signedIn && subscriptionLoading);
    if (signedIn && webPaidPlan && webPaidPlan !== id && !IN_PLACE_PLAN_CHANGE_ENABLED) {
      return { label: "Change plan", onClick: () => void handleSelectPlan(id), disabled: blockedByData };
    }
    return {
      label: meta.paidCta,
      onClick: () => void handleSelectPlan(id),
      disabled: blockedByData || (loadingPlan !== null && loadingPlan !== id),
      loading: loadingPlan === id,
    };
  };

  // "Continue to checkout" after the sign-in round trip. A tap, never
  // automatic: a fresh signup gets the email-verification 403 first.
  const continuePlan =
    signedIn && tierKnown && isPlanName(requestedPlan) && requestedPlan !== "free" && !isCurrent(requestedPlan)
      ? requestedPlan
      : null;

  const heroPrices = PLAN_META.map((m) => {
    const p = priceFor(m.id, billing);
    if (p === null) return null;
    return m.id === "free" ? "Free $0" : `${m.name} ${money(p)}/${billing === "yearly" ? "yr" : "mo"}`;
  }).filter((s): s is string => s !== null);

  const isPaidMember = tierKnown && currentTier !== "free";

  // JSON-LD: one Offer per paid plan and period. The FAQPage block comes from
  // the shared <FAQSchema> below, built from the same questions the page shows
  // (scripts/__tests__/faq-single-emitter.test.mjs allows no other emitter).
  const structuredData = useMemo(() => {
    const offers = PAID.flatMap((id) =>
      (["monthly", "yearly"] as const).flatMap((period) => {
        const price = displayPrice(dbPlans, id, period);
        if (price === null) return [];
        return [
          {
            "@type": "Offer",
            name: `${tierLabel(id)} (${period})`,
            price: price.toFixed(2),
            priceCurrency: "USD",
            url: getCanonicalUrl("/pricing"),
          },
        ];
      }),
    );
    return {
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Des Moines Insider membership",
      description: "Insider and VIP plans for Des Moines Insider.",
      offers,
    };
  }, [dbPlans]);

  const faqSchemaItems = useMemo(
    () => PRICING_FAQS.map((f) => ({ question: f.question, answer: faqAnswerText(f) })),
    [],
  );

  return (
    <>
      <SEOHead
        title="Plans and Pricing | Des Moines Insider"
        description="Des Moines Insider plans: Free, or Insider for unlimited favorites, saved-search alerts, reviews and no ads. Prices, trial terms and how to cancel."
        keywords={["Des Moines Insider pricing", "Des Moines events membership", "Des Moines Insider plans"]}
        url={getCanonicalUrl("/pricing")}
        structuredData={structuredData}
      />
      <FAQSchema faqItems={faqSchemaItems} />

      <div className="min-h-screen bg-background">
        <Header />

        <div id="pricing-content">
          <div className="container mx-auto px-4">
            <Breadcrumbs className="mb-4 pt-4" items={[{ label: "Home", href: "/" }, { label: "Pricing" }]} />
          </div>

          <section className="pb-10 pt-6">
            <div className="container mx-auto px-4 text-center">
              {isEligibleForTrial && (
                <Badge variant="secondary" className="mb-4">
                  7-day free trial for first-time subscribers
                </Badge>
              )}
              {/* text-foreground is load-bearing: index.html's critical CSS
                  paints every h1 white for the home hero, so an h1 without a
                  colour class is invisible here. */}
              <h1 className="mx-auto mb-4 max-w-3xl text-3xl font-bold tracking-tight text-foreground md:text-5xl">
                Free to browse. Insider for alerts, reviews and no ads.
              </h1>
              {heroPrices.length > 0 && (
                <p className="mb-2 text-lg text-foreground" aria-live="polite">
                  {heroPrices.join(", ")}
                </p>
              )}
              <p className="mx-auto mb-8 max-w-2xl text-muted-foreground">
                Every line on these plans is checked against the code that enforces it.
              </p>

              <BillingPeriodToggle value={billing} onChange={changeBilling} maxYearlySavingsPct={maxYearlySavingsPct} />
            </div>
          </section>

          <section aria-labelledby="plans-heading" className="pb-12">
            <h2 id="plans-heading" className="sr-only">
              Plans
            </h2>
            <div className="container mx-auto px-4">
              {signedIn && <YourPlanPanel />}

              {continuePlan && !continueDismissed && (
                <div
                  role="region"
                  aria-label="Continue to checkout"
                  className="mx-auto mb-8 flex max-w-3xl flex-col items-start gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="text-sm text-foreground">
                    You picked {tierLabel(continuePlan)}, billed {billing === "yearly" ? "yearly" : "monthly"}.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      className="min-h-11"
                      onClick={() => void handleSelectPlan(continuePlan)}
                      disabled={loadingPlan !== null || plansLoading || !!plansError}
                    >
                      Continue to {tierLabel(continuePlan)} checkout
                    </Button>
                    <Button variant="ghost" className="min-h-11" onClick={() => setContinueDismissed(true)}>
                      Not now
                    </Button>
                  </div>
                </div>
              )}

              {plansError && (
                <div role="alert" className="mx-auto mb-8 flex max-w-3xl flex-col items-start gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-foreground">
                    Plans couldn't load, so checkout is off until they do. Prices shown may be out of date.
                  </p>
                  <Button variant="outline" className="min-h-11" onClick={retryPlans}>
                    Retry
                  </Button>
                </div>
              )}

              <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
                {PLAN_META.map((meta) => {
                  const id = meta.id;
                  const included = benefitsFor(id, limitsOf(id));
                  const excluded = id === "free" ? benefitsFor("insider", limitsOf("insider")) : [];
                  return (
                    <PlanCard
                      key={id}
                      planId={id}
                      name={meta.name}
                      description={meta.description}
                      featured={meta.featured}
                      badge={meta.badge}
                      price={priceFor(id, billing)}
                      period={billing}
                      yearlySaving={id === "free" ? null : yearlySavings(dbPlans, id)}
                      leadIn={id === "insider" ? "Everything in Free, plus:" : undefined}
                      included={included}
                      excluded={excluded}
                      trialEligible={isEligibleForTrial}
                      cta={ctaFor(id, meta)}
                    />
                  );
                })}
              </div>
            </div>
          </section>

          {/* WEB-LEGAL-002: a testimonials section stood here and was removed.
              It carried three invented members with hardcoded five-star
              ratings. Fabricated endorsements are prohibited under the FTC
              endorsement guides (16 CFR 255) and the Rule on Consumer Reviews
              and Testimonials (16 CFR 465). If real reviews are wired up later
              they belong here, attributed to people who wrote them; user_ratings
              is the place to start. Do not add placeholder quotes "for layout".

              A four-tile "core features" block also stood here and was removed
              (pricing plan WP2 item 10): it made an unverified volume claim,
              sold an Insider-only feature as core, and described
              recommendations with no gate behind them. The Free card's own list
              is what every account gets. */}

          <PricingFaq />

          <section className="border-t bg-muted/40 py-16">
            <div className="container mx-auto px-4 text-center">
              {isPaidMember ? (
                <>
                  <h2 className="mb-4 text-3xl font-bold text-foreground">Your plan, your terms</h2>
                  <p className="mx-auto mb-8 max-w-2xl text-muted-foreground">
                    See your next renewal, cancel or resume from your subscription page.
                  </p>
                  <Button asChild size="lg" className="min-h-11">
                    <Link to="/subscription">Manage subscription</Link>
                  </Button>
                </>
              ) : (
                <>
                  <h2 className="mb-4 text-3xl font-bold text-foreground">Start with what you need</h2>
                  <p className="mx-auto mb-8 max-w-2xl text-muted-foreground">
                    {signedIn
                      ? "Your free account stays free. Upgrade when alerts or reviews would help."
                      : "A free account needs no card. Upgrade when alerts or reviews would help."}
                  </p>
                  <div className="flex flex-col justify-center gap-4 sm:flex-row">
                    {!signedIn && (
                      <Button asChild size="lg" className="min-h-11">
                        <Link to="/auth?mode=signup">Create free account</Link>
                      </Button>
                    )}
                    <Button
                      size="lg"
                      variant={signedIn ? "default" : "outline"}
                      className="min-h-11"
                      onClick={() => void handleSelectPlan("insider")}
                      disabled={signedIn && (plansLoading || !!plansError || subscriptionLoading || loadingPlan !== null)}
                    >
                      {isEligibleForTrial ? "Try Insider free for 7 days" : "Start Insider"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>

        <Footer />
      </div>

      <Dialog open={changePlanTarget !== null} onOpenChange={(open) => !open && setChangePlanTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change plan</DialogTitle>
            <DialogDescription>{PLAN_CHANGE_PAUSED_MESSAGE}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            To switch to {changePlanTarget ? tierLabel(changePlanTarget) : "another plan"} now, email
            billing@desmoinesinsider.com and we'll do it for you.
          </p>
          <DialogFooter>
            <Button variant="outline" className="min-h-11" onClick={() => setChangePlanTarget(null)}>
              Close
            </Button>
            <Button asChild className="min-h-11">
              <Link to="/subscription">Go to your subscription</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

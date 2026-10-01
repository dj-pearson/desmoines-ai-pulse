import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { CheckCircle, Crown, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { PlanStatusLine } from "@/components/subscription/PlanStatusLine";
import { useAuth } from "@/hooks/useAuth";
import { useConversionFunnel } from "@/hooks/useConversionFunnel";
import {
  isSubscriptionEntitled,
  useSubscription,
  type UserSubscription,
} from "@/hooks/useSubscription";
import { benefitsFor, type PlanName } from "@/lib/planBenefits";
import { AI_PLANNER_AVAILABLE } from "@/lib/tripPlannerStatus";
import { sessionStore } from "@/lib/safeStorage";

/**
 * Where Stripe Checkout lands (docs/page-plans/pricing.md, WP3 items 1-3).
 *
 * Stripe redirects here as soon as checkout completes, which is before
 * stripe-webhook has written the user_subscriptions row. This page used to
 * sleep 2s and then announce "Your subscription is now active" with an
 * "Active" badge and eight benefits whatever the row said. Now it polls the
 * row, every POLL_INTERVAL_MS for at most POLL_LIMIT_MS, and says only what
 * the row says: confirmed, still activating, or signed out.
 */

const POLL_INTERVAL_MS = 2_000;
const POLL_LIMIT_MS = 20_000;

const TIER_LABEL: Record<Exclude<PlanName, "free">, string> = {
  insider: "Insider",
  vip: "VIP",
};

const BILLED_BY: Record<UserSubscription["platform"], string> = {
  web: "Stripe",
  ios: "the App Store",
  android: "Google Play",
};

// Tier colours match PremiumBadge and SubscriptionPortal: Insider is amber,
// VIP is the brand red.
const TIER_STYLE: Record<Exclude<PlanName, "free">, { icon: typeof Sparkles; chip: string }> = {
  insider: {
    icon: Sparkles,
    chip: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  },
  vip: {
    icon: Crown,
    chip: "bg-secondary/10 text-secondary",
  },
};

function isPaidPlan(value: string | null): value is Exclude<PlanName, "free"> {
  return value === "insider" || value === "vip";
}

type SubscriptionRowWithTrial = UserSubscription & { trial_end?: string | null };

function RobotsNoindex({ title }: { title: string }) {
  return (
    <Helmet>
      <title>{title} - Des Moines Insider</title>
      <meta name="robots" content="noindex" />
    </Helmet>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      {/* App.tsx already renders the page's <main>; this is its content column. */}
      <div className="container mx-auto px-4 py-12 md:py-16" id="subscription-success">
        <div className="mx-auto max-w-2xl">{children}</div>
      </div>
      <Footer />
    </div>
  );
}

function HelpLine() {
  return (
    <p className="mt-8 text-center text-sm text-muted-foreground">
      Questions about your subscription?{" "}
      <Link to="/contact" className="text-primary underline-offset-4 hover:underline">
        Contact us
      </Link>
    </p>
  );
}

export default function SubscriptionSuccess() {
  const [searchParams] = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();
  const { tier, subscriptions, limits, subscriptionLoading, refetchSubscription } =
    useSubscription();
  const { trackFunnelEvent } = useConversionFunnel();

  // The upgrade path (create-subscription-checkout's in-place change) sends
  // ?plan=<name>; a new checkout sends ?session_id=<cs_...>.
  const planParam = searchParams.get("plan");
  const expectedPlan = isPaidPlan(planParam) ? planParam : null;
  const sessionId = searchParams.get("session_id");

  const confirmed = expectedPlan ? tier === expectedPlan : tier !== "free";
  const [timedOut, setTimedOut] = useState(false);
  const [checkingAgain, setCheckingAgain] = useState(false);

  // Bounded poll. Stops when the row confirms, when the limit passes, or on
  // unmount. The query's own first read plus at most ten polls keeps this to
  // eleven reads of user_subscriptions.
  const confirmedRef = useRef(confirmed);
  confirmedRef.current = confirmed;
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    if (confirmedRef.current) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (confirmedRef.current) {
        window.clearInterval(timer);
        return;
      }
      if (Date.now() - startedAt >= POLL_LIMIT_MS) {
        window.clearInterval(timer);
        setTimedOut(true);
        return;
      }
      void refetchSubscription();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [userId, refetchSubscription]);

  // funnel_checkout_completed, once per checkout, only when the row confirms.
  // Consent is checked inside trackFunnelEvent. Pricing plan D4 moves this to
  // the webhook.
  const trackedRef = useRef(false);
  useEffect(() => {
    if (!confirmed || !user || trackedRef.current) return;
    trackedRef.current = true;
    const onceKey = `dmi-checkout-completed:${sessionId ?? expectedPlan ?? tier}`;
    if (sessionStore.get<boolean>(onceKey)) return;
    sessionStore.set(onceKey, true);
    void trackFunnelEvent("funnel_checkout_completed", {
      plan: tier,
      ...(sessionId ? { sessionId } : {}),
    });
  }, [confirmed, user, sessionId, expectedPlan, tier, trackFunnelEvent]);

  const checkAgain = useCallback(async () => {
    setCheckingAgain(true);
    try {
      await refetchSubscription();
    } finally {
      setCheckingAgain(false);
    }
  }, [refetchSubscription]);

  if (authLoading || (user && subscriptionLoading)) {
    return (
      <>
        <RobotsNoindex title="Confirming your plan" />
        <PageShell>
          <div role="status" aria-live="polite" className="text-center">
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-primary" aria-hidden="true" />
            <h1 className="mb-2 text-2xl font-bold text-foreground">Confirming your plan</h1>
            <p className="text-muted-foreground">Checking your account for the new subscription.</p>
          </div>
        </PageShell>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <RobotsNoindex title="Sign in to see your plan" />
        <PageShell>
          <div className="text-center">
            <h1 className="mb-3 text-3xl font-bold text-foreground">Sign in to see your plan</h1>
            <p className="mb-6 text-muted-foreground">
              Your checkout is tied to your account. Sign in and we'll show you
              what's active.
            </p>
            <Button asChild>
              <Link to={`/auth?redirect=${encodeURIComponent("/subscription")}`}>Sign in</Link>
            </Button>
          </div>
          <HelpLine />
        </PageShell>
      </>
    );
  }

  if (!confirmed) {
    return (
      <>
        <RobotsNoindex title="Your plan is activating" />
        <PageShell>
          <div role="status" aria-live="polite" className="text-center">
            {timedOut ? (
              <>
                <h1 className="mb-3 text-3xl font-bold text-foreground">Your plan is activating</h1>
                <p className="mb-2 text-muted-foreground">
                  Checkout went through, but your account doesn't show the new
                  plan yet. This can take a minute.
                </p>
                <p className="mb-6 text-muted-foreground">
                  Your subscription page will show the plan once it's ready.
                </p>
                <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Button onClick={() => void checkAgain()} disabled={checkingAgain}>
                    {checkingAgain ? "Checking..." : "Check again"}
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/subscription">Go to your subscription</Link>
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-primary" aria-hidden="true" />
                <h1 className="mb-2 text-2xl font-bold text-foreground">Confirming your plan</h1>
                <p className="text-muted-foreground">
                  Checkout is done. We're waiting for your account to show the
                  new plan.
                </p>
              </>
            )}
          </div>
          <HelpLine />
        </PageShell>
      </>
    );
  }

  // Confirmed: `tier` is a paid plan held by an entitled row.
  const paidTier = tier as Exclude<PlanName, "free">;
  const tierLabel = TIER_LABEL[paidTier];
  const { icon: TierIcon, chip } = TIER_STYLE[paidTier];
  const row = (subscriptions.find(
    (s) => s.plan?.name === paidTier && isSubscriptionEntitled(s),
  ) ?? null) as SubscriptionRowWithTrial | null;
  const benefits = benefitsFor(paidTier, limits);

  return (
    <>
      <RobotsNoindex title={`Welcome to ${tierLabel}`} />
      <PageShell>
        <div className="mb-8 text-center">
          <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
            <CheckCircle className="h-8 w-8 text-green-700 dark:text-green-300" aria-hidden="true" />
          </div>
          <h1 className="mb-3 text-3xl font-bold text-foreground md:text-4xl">Welcome to {tierLabel}</h1>
          <p className="text-lg text-muted-foreground" role="status" aria-live="polite">
            You're on {tierLabel}
            {row ? `, billed by ${BILLED_BY[row.platform]}` : ""}.
          </p>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={`inline-flex rounded-full p-2 ${chip}`}>
                  <TierIcon className="h-5 w-5" aria-hidden="true" />
                </span>
                <CardTitle className="text-xl">{tierLabel}</CardTitle>
              </div>
              {row?.status === "trialing" && (
                <Badge variant="secondary">Trial</Badge>
              )}
              {row?.status === "active" && (
                <Badge className="bg-green-100 text-green-900 hover:bg-green-100 dark:bg-green-950 dark:text-green-200">
                  Active
                </Badge>
              )}
            </div>
            {row && (
              <PlanStatusLine
                className="pt-1"
                status={row.status}
                cancelAtPeriodEnd={row.cancel_at_period_end}
                currentPeriodEnd={row.current_period_end ?? null}
                trialEnd={row.trial_end ?? null}
              />
            )}
          </CardHeader>
          <CardContent>
            <h2 className="mb-3 text-base font-semibold text-foreground">What {tierLabel} includes</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {benefits.map((benefit) => (
                <li key={benefit.key} className="flex items-start gap-2 text-sm">
                  <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-700 dark:text-green-400" aria-hidden="true" />
                  {benefit.href ? (
                    <Link to={benefit.href} className="underline-offset-4 hover:underline">
                      {benefit.text}
                    </Link>
                  ) : (
                    <span>{benefit.text}</span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Get started</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button asChild className="w-full justify-between">
                <Link to="/events">
                  Browse events
                  <SpriteIcon name="arrow-right" className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-between">
                <Link to="/restaurants">
                  Find restaurants
                  <SpriteIcon name="arrow-right" className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              {AI_PLANNER_AVAILABLE && (
                <Button asChild variant="outline" className="w-full justify-between">
                  <Link to="/trip-planner">
                    Plan a trip
                    <SpriteIcon name="arrow-right" className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              )}
              <Button asChild variant="outline" className="w-full justify-between">
                <Link to="/subscription">
                  Manage subscription
                  <SpriteIcon name="arrow-right" className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <HelpLine />
      </PageShell>
    </>
  );
}

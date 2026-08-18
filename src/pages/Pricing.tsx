import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { useConversionFunnel } from "@/hooks/useConversionFunnel";
import {
  Check,
  Star,
  Crown,
  Sparkles,
  Calendar,
  Bell,
  Heart,
  Search,
  Zap,
  Shield,
  MessageCircle,
  Smartphone,
  Gift,
  Users,
  ArrowRight,
  Loader2,
} from "lucide-react";

interface PlanFeature {
  text: string;
  included: boolean;
  highlight?: boolean;
}

interface PricingPlan {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  icon: React.ReactNode;
  features: PlanFeature[];
  cta: string;
  popular?: boolean;
  badge?: string;
}

const plans: PricingPlan[] = [
  {
    id: "free",
    name: "Free",
    description: "Perfect for casual browsing",
    priceMonthly: 0,
    priceYearly: 0,
    icon: <Star className="h-6 w-6" />,
    cta: "Get Started Free",
    features: [
      { text: "Browse all events & restaurants", included: true },
      { text: "Basic text search", included: true },
      { text: "Save up to 3 favorites", included: true },
      { text: "View ratings & reviews", included: true },
      { text: "Weekly email digest", included: true },
      { text: "Earn XP & badges", included: true },
      { text: "AI Trip Planner", included: false },
      { text: "Advanced filters", included: false },
      { text: "Write reviews", included: false },
      { text: "Ad-free experience", included: false },
    ],
  },
  {
    id: "insider",
    name: "Insider",
    description: "For the passionate Des Moines explorer",
    priceMonthly: 4.99,
    priceYearly: 49.99,
    icon: <Sparkles className="h-6 w-6" />,
    cta: "Become an Insider",
    popular: true,
    badge: "Most Popular",
    features: [
      { text: "Everything in Free, plus:", included: true },
      { text: "AI Trip Planner (5 trips/month)", included: true, highlight: true },
      { text: "Unlimited favorites", included: true, highlight: true },
      { text: "Advanced search filters", included: true, highlight: true },
      { text: "Write reviews & ratings", included: true },
      { text: "Saved searches & event alerts", included: true },
      { text: "Early access to hot events", included: true },
      { text: "Ad-free experience", included: true },
      { text: "Daily personalized digest", included: true },
      { text: "2x XP earning rate", included: true },
    ],
  },
  {
    id: "vip",
    name: "VIP",
    description: "The ultimate Des Moines experience",
    priceMonthly: 12.99,
    priceYearly: 129.99,
    icon: <Crown className="h-6 w-6" />,
    cta: "Go VIP",
    badge: "Best Value",
    features: [
      { text: "Everything in Insider, plus:", included: true },
      { text: "Unlimited AI Trip Planner", included: true, highlight: true },
      { text: "Exclusive VIP-only events", included: true, highlight: true },
      { text: "Restaurant reservation help", included: true, highlight: true },
      { text: "SMS alerts for your interests", included: true },
      { text: "Monthly local business perks", included: true },
      { text: "Concierge support", included: true },
      { text: "3x XP earning rate", included: true },
      { text: "Exclusive VIP badge", included: true },
    ],
  },
];

const faqs = [
  {
    question: "Do subscriptions auto-renew?",
    answer: "Yes. Insider and VIP subscriptions renew automatically at the end of each billing period (monthly plans every month, yearly plans every year) at the same price, until you cancel. We'll email you a receipt for every successful renewal. You can cancel any time from your account's subscription page — cancellation is online and takes about 30 seconds (no phone call, no retention gate). You keep access until the end of the period you already paid for.",
  },
  {
    question: "Can I cancel anytime?",
    answer: "Yes. Open Account › Subscription in the web app and click Cancel — that single click stops all future charges. You'll continue to have access until the end of your current billing period. (iOS subscribers: because Apple manages iOS in-app billing, please cancel from Settings › Apple ID › Subscriptions.)",
  },
  {
    question: "Is there a free trial?",
    answer: "New Insider and VIP members get a 7-day free trial. If you don't cancel before the trial ends, your card will be charged the plan price shown at checkout and will auto-renew at the same price each period. Cancel any time during the trial from Account › Subscription and you won't be charged.",
  },
  {
    question: "What payment methods do you accept?",
    answer: "We accept all major credit cards, debit cards, and Apple Pay through our secure Stripe payment system. Card numbers are never stored on our servers — Stripe handles PCI-compliant tokenization.",
  },
  {
    question: "Can I switch plans?",
    answer: "Absolutely! You can upgrade or downgrade your plan at any time. Upgrades take effect immediately (prorated); downgrades take effect at the next renewal date. You can always see your next charge in Account › Subscription.",
  },
  {
    question: "What about refunds?",
    answer: "We don't issue prorated refunds for partial months or years — instead, when you cancel you keep access through the end of the period you already paid for. If you think you were charged in error, email billing@desmoinesinsider.com within 30 days and we'll take a look.",
  },
];

export default function Pricing() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, user } = useAuth();
  const {
    plans: dbPlans,
    startCheckout,
    checkoutLoading,
    checkoutError,
    tier: currentTier,
    isPremium,
  } = useSubscription();
  const { toast } = useToast();
  const { trackFunnelEvent } = useConversionFunnel();
  const [isYearly, setIsYearly] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  // Track pricing page view
  useEffect(() => {
    trackFunnelEvent('funnel_pricing_page_viewed');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show toast if redirected from canceled checkout
  useEffect(() => {
    if (searchParams.get("canceled") === "true") {
      trackFunnelEvent('funnel_checkout_abandoned');
      toast({
        title: "Checkout canceled",
        description: "No worries! Your account is still active. You can subscribe anytime.",
      });
    }
  }, [searchParams, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectPlan = async (planId: string) => {
    trackFunnelEvent('funnel_plan_selected', { planId, billing: isYearly ? 'yearly' : 'monthly' });

    if (planId === "free") {
      navigate("/auth");
      return;
    }

    // For paid plans, check if user is logged in
    if (!isAuthenticated || !user) {
      // Redirect to auth with plan info - they'll be redirected back after login
      navigate(`/auth?redirect=/pricing&plan=${planId}&billing=${isYearly ? "yearly" : "monthly"}`);
      return;
    }

    // Check if user already has this tier
    if (currentTier === planId) {
      toast({
        title: "Already subscribed",
        description: `You're already on the ${planId} plan!`,
      });
      return;
    }

    // Get the plan ID from database
    const plan = dbPlans.find(p => p.name === planId);
    if (!plan) {
      toast({
        title: "Plan not found",
        description: "Unable to find the selected plan. Please try again.",
        variant: "destructive",
      });
      return;
    }

    // Check if Stripe is configured
    const priceId = isYearly ? plan.stripe_price_id_yearly : plan.stripe_price_id_monthly;
    if (!priceId) {
      toast({
        title: "Coming soon",
        description: "Online subscription is being set up. Please check back soon or contact support.",
      });
      return;
    }

    // Start checkout
    trackFunnelEvent('funnel_checkout_started', { planId, planDbId: plan.id, billing: isYearly ? 'yearly' : 'monthly' });
    setLoadingPlan(planId);
    const success = await startCheckout(plan.id, isYearly ? "yearly" : "monthly");

    if (!success && checkoutError) {
      toast({
        title: "Checkout failed",
        description: checkoutError,
        variant: "destructive",
      });
    }
    setLoadingPlan(null);
  };

  const getPrice = (plan: PricingPlan) => {
    if (plan.priceMonthly === 0) return "Free";
    const price = isYearly ? plan.priceYearly : plan.priceMonthly;
    return `$${price.toFixed(2)}`;
  };

  const getSavings = (plan: PricingPlan) => {
    if (plan.priceMonthly === 0) return null;
    const monthlyTotal = plan.priceMonthly * 12;
    const savings = monthlyTotal - plan.priceYearly;
    if (savings <= 0) return null;
    return Math.round(savings);
  };

  return (
    <>
      <Helmet>
        <title>Pricing - Des Moines Insider | Unlock Premium Local Experiences</title>
        <meta
          name="description"
          content="Choose your Des Moines Insider membership. Get early event access, unlimited favorites, personalized recommendations, and exclusive VIP perks."
        />
        <meta name="keywords" content="Des Moines membership, local events subscription, VIP experiences Iowa" />
      </Helmet>

      <div className="min-h-screen bg-background">
        <Header />

        <div>
          <div className="container mx-auto px-4">
            <Breadcrumbs
              className="mb-4 pt-4"
              items={[
                { label: "Home", href: "/" },
                { label: "Pricing" },
              ]}
            />
          </div>

          {/* Hero Section */}
          <section className="py-16 bg-gradient-to-br from-primary/5 via-background to-secondary/5">
            <div className="container mx-auto px-4 text-center">
              <Badge variant="secondary" className="mb-4">
                <Gift className="h-3 w-3 mr-1" />
                7-Day Free Trial on Paid Plans
              </Badge>
              <h1 className="text-4xl md:text-5xl font-bold mb-4">
                Unlock the Best of Des Moines
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
                From free explorer to VIP insider - choose the experience that fits your lifestyle
              </p>

              {/* Billing Toggle */}
              <div className="flex items-center justify-center gap-4 mb-12">
                <Label
                  htmlFor="billing-toggle"
                  className={!isYearly ? "font-semibold" : "text-muted-foreground"}
                >
                  Monthly
                </Label>
                <Switch
                  id="billing-toggle"
                  checked={isYearly}
                  onCheckedChange={setIsYearly}
                />
                <Label
                  htmlFor="billing-toggle"
                  className={isYearly ? "font-semibold" : "text-muted-foreground"}
                >
                  Yearly
                  <Badge variant="secondary" className="ml-2 bg-green-100 text-green-800">
                    Save 17%
                  </Badge>
                </Label>
              </div>
            </div>
          </section>

          {/* Pricing Cards */}
          <section className="py-12 -mt-8">
            <div className="container mx-auto px-4">
              {/* Pre-purchase auto-renewal disclosure — FTC "click-to-cancel"
                  §465.3 / ROSCA / California ARL require clear and conspicuous
                  disclosure of renewal terms BEFORE the subscription CTA. */}
              <div
                role="note"
                aria-label="Subscription renewal disclosure"
                className="max-w-3xl mx-auto mb-6 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4 text-sm"
              >
                <p className="font-semibold text-foreground mb-1">
                  Before you subscribe
                </p>
                <ul className="list-disc ml-5 space-y-1 text-muted-foreground">
                  <li>
                    Paid plans <strong>auto-renew</strong> at the end of each
                    billing period ({isYearly ? "every 12 months" : "every month"}) at
                    the same price shown above, until you cancel.
                  </li>
                  <li>
                    The 7-day free trial converts to a paid subscription at the
                    displayed price if you don&apos;t cancel before it ends.
                  </li>
                  <li>
                    You can cancel online any time from{" "}
                    <strong>Account › Subscription</strong> — one click, no phone
                    call required.
                  </li>
                  <li>
                    iOS in-app purchases are billed by Apple; cancel from
                    Settings › Apple ID › Subscriptions.
                  </li>
                </ul>
              </div>

              <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
                {plans.map((plan) => (
                  <Card
                    key={plan.id}
                    className={`relative flex flex-col ${
                      plan.popular
                        ? "border-primary shadow-lg scale-105 z-10"
                        : "border-border"
                    }`}
                  >
                    {plan.badge && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge
                          className={
                            plan.popular
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary"
                          }
                        >
                          {plan.badge}
                        </Badge>
                      </div>
                    )}

                    <CardHeader className="text-center pb-4">
                      <div
                        className={`mx-auto mb-3 p-3 rounded-full ${
                          plan.popular
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {plan.icon}
                      </div>
                      <CardTitle className="text-2xl">{plan.name}</CardTitle>
                      <CardDescription>{plan.description}</CardDescription>
                    </CardHeader>

                    <CardContent className="flex-1 flex flex-col">
                      {/* Price */}
                      <div className="text-center mb-6">
                        <div className="text-4xl font-bold">
                          {getPrice(plan)}
                          {plan.priceMonthly > 0 && (
                            <span className="text-lg font-normal text-muted-foreground">
                              /{isYearly ? "year" : "mo"}
                            </span>
                          )}
                        </div>
                        {isYearly && getSavings(plan) && (
                          <p className="text-sm text-green-600 mt-1">
                            Save ${getSavings(plan)} per year
                          </p>
                        )}
                        {plan.priceMonthly > 0 && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Auto-renews at ${isYearly ? plan.priceYearly.toFixed(2) : plan.priceMonthly.toFixed(2)}/
                            {isYearly ? "yr" : "mo"}. Cancel anytime.
                          </p>
                        )}
                      </div>

                      {/* Features */}
                      <ul className="space-y-3 mb-6 flex-1">
                        {plan.features.map((feature, idx) => (
                          <li
                            key={idx}
                            className={`flex items-start gap-2 text-sm ${
                              !feature.included ? "text-muted-foreground" : ""
                            }`}
                          >
                            <Check
                              className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                                feature.included
                                  ? feature.highlight
                                    ? "text-primary"
                                    : "text-green-500"
                                  : "text-muted-foreground/30"
                              }`}
                            />
                            <span className={feature.highlight ? "font-medium" : ""}>
                              {feature.text}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {/* CTA Button */}
                      <Button
                        onClick={() => handleSelectPlan(plan.id)}
                        className={`w-full ${
                          plan.popular ? "" : "variant-outline"
                        }`}
                        variant={plan.popular ? "default" : "outline"}
                        size="lg"
                        disabled={loadingPlan === plan.id || checkoutLoading}
                      >
                        {loadingPlan === plan.id ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : currentTier === plan.id ? (
                          "Current Plan"
                        ) : (
                          <>
                            {plan.cta}
                            <ArrowRight className="h-4 w-4 ml-2" />
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          {/* Feature Comparison */}
          <section className="py-16 bg-muted/30">
            <div className="container mx-auto px-4">
              <h2 className="text-3xl font-bold text-center mb-4">
                What You Get With Each Plan
              </h2>
              <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
                Every plan includes our core features. Upgrade for more power and perks.
              </p>

              <div className="grid md:grid-cols-4 gap-6 max-w-5xl mx-auto">
                <div className="p-6 bg-card rounded-lg border text-center">
                  <Calendar className="h-8 w-8 mx-auto mb-3 text-primary" />
                  <h3 className="font-semibold mb-2">Event Discovery</h3>
                  <p className="text-sm text-muted-foreground">
                    Browse thousands of local events updated daily
                  </p>
                </div>
                <div className="p-6 bg-card rounded-lg border text-center">
                  <Search className="h-8 w-8 mx-auto mb-3 text-primary" />
                  <h3 className="font-semibold mb-2">Smart Search</h3>
                  <p className="text-sm text-muted-foreground">
                    Find exactly what you're looking for with powerful filters
                  </p>
                </div>
                <div className="p-6 bg-card rounded-lg border text-center">
                  <Bell className="h-8 w-8 mx-auto mb-3 text-primary" />
                  <h3 className="font-semibold mb-2">Alerts & Notifications</h3>
                  <p className="text-sm text-muted-foreground">
                    Never miss events that match your interests
                  </p>
                </div>
                <div className="p-6 bg-card rounded-lg border text-center">
                  <Zap className="h-8 w-8 mx-auto mb-3 text-primary" />
                  <h3 className="font-semibold mb-2">AI Recommendations</h3>
                  <p className="text-sm text-muted-foreground">
                    Personalized suggestions based on your preferences
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* WEB-LEGAL-002: a testimonials section stood here and was removed.
              It carried three invented members - "Sarah M.", "Mike T." and
              "Jessica L." - each with a hardcoded five-star rating, under
              "Loved by Des Moines Explorers" and "Join thousands of happy
              members". Nobody by those names subscribed, and nothing counts
              members. Fabricated consumer endorsements are prohibited under the
              FTC endorsement guides (16 CFR 255) and, since 2024, carry civil
              penalties under 16 CFR 465. If real testimonials are wired up later
              they belong here, attributed to people who actually said them. Do
              not reintroduce placeholder quotes "for layout". */}

          {/* FAQ */}
          <section className="py-16 bg-muted/30">
            <div className="container mx-auto px-4">
              <h2 className="text-3xl font-bold text-center mb-12">
                Frequently Asked Questions
              </h2>

              <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                {faqs.map((faq, idx) => (
                  <Card key={idx}>
                    <CardHeader>
                      <CardTitle className="text-lg">{faq.question}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">{faq.answer}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          {/* Final CTA */}
          <section className="py-16 bg-gradient-to-r from-primary/10 to-secondary/10">
            <div className="container mx-auto px-4 text-center">
              <h2 className="text-3xl font-bold mb-4">
                Ready to Discover More of Des Moines?
              </h2>
              <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                Start with a free account and upgrade anytime. No credit card required.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" onClick={() => navigate("/auth")}>
                  Get Started Free
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => handleSelectPlan("insider")}
                >
                  Try Insider Free for 7 Days
                </Button>
              </div>
            </div>
          </section>
        </div>

        <Footer />
      </div>
    </>
  );
}

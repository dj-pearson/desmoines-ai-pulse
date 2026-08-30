import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Crown,
  Sparkles,
  Check,
  Zap,
  Heart,
  Bell,
  Filter,
  Star,
  X,
} from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { logPaywallEvent } from "@/lib/paywallAnalytics";
import { cn } from "@/lib/utils";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature?: string;
  requiredTier?: "insider" | "vip";
}

const featureDescriptions: Record<
  string,
  { title: string; description: string; tier: "insider" | "vip" }
> = {
  unlimited_favorites: {
    title: "Unlimited Favorites",
    description: "Save as many events and restaurants as you want — free accounts are limited to 3",
    tier: "insider",
  },
  early_access: {
    title: "Early Access",
    description: "Be the first to know about new events before they sell out",
    tier: "insider",
  },
  advanced_filters: {
    title: "Advanced Filters",
    description: "Filter by distance, price range, rating, time of day, and more",
    tier: "insider",
  },
  ad_free: {
    title: "Ad-Free Experience",
    description: "Browse without interruptions from advertisements",
    tier: "insider",
  },
  daily_digest: {
    title: "Daily Personalized Digest",
    description: "Get daily recommendations tailored just for you",
    tier: "insider",
  },
  trip_planner: {
    title: "AI Trip Planner",
    description: "Plan your perfect Des Moines trip with AI-powered itineraries. Insider members get 5 trips/month",
    tier: "insider",
  },
  write_reviews: {
    title: "Write Reviews",
    description: "Share your experiences by writing reviews for events and restaurants",
    tier: "insider",
  },
  save_searches: {
    title: "Saved Searches",
    description: "Save your search criteria and get notified when new matches appear",
    tier: "insider",
  },
  create_alerts: {
    title: "Custom Event Alerts",
    description: "Set up alerts to be notified when events match your interests",
    tier: "insider",
  },
  insider_tips: {
    title: "Insider & Dining Tips",
    description: "Unlock curated local dining tips and insider picks for the best of Des Moines",
    tier: "insider",
  },
  vip_events: {
    title: "VIP Events Access",
    description: "Exclusive access to VIP-only events and experiences",
    tier: "vip",
  },
  reservation_assistance: {
    title: "Reservation Assistance",
    description: "Let us help book hard-to-get restaurant reservations",
    tier: "vip",
  },
  sms_alerts: {
    title: "SMS Alerts",
    description: "Instant text notifications for events you care about",
    tier: "vip",
  },
  concierge: {
    title: "Concierge Support",
    description: "Personalized recommendations from our local experts",
    tier: "vip",
  },
};

const insiderFeatures = [
  { icon: Heart, text: "Unlimited favorites" },
  { icon: Zap, text: "AI Trip Planner (5/month)" },
  { icon: Filter, text: "Advanced search filters" },
  { icon: Star, text: "Ad-free experience" },
  { icon: Bell, text: "Alerts & saved searches" },
  { icon: Zap, text: "Write reviews & ratings" },
  { icon: Zap, text: "Early access to events" },
];

const vipFeatures = [
  { icon: Crown, text: "Exclusive VIP events" },
  { icon: Star, text: "Reservation assistance" },
  { icon: Bell, text: "SMS alerts for your interests" },
  { icon: Sparkles, text: "Monthly local business perks" },
];

// Plan prices — must match the Pricing page + iOS SKUs (WEB-FEAT-002).
const PLAN_PRICING: Record<"insider" | "vip", { monthly: number; yearly: number }> = {
  insider: { monthly: 4.99, yearly: 49.99 },
  vip: { monthly: 12.99, yearly: 129.99 },
};

function yearlySavingsPct(plan: "insider" | "vip"): number {
  const { monthly, yearly } = PLAN_PRICING[plan];
  return Math.round((1 - yearly / (monthly * 12)) * 100);
}

// Largest annual discount across paid plans — drives the toggle badge.
const MAX_YEARLY_SAVINGS_PCT = Math.max(
  yearlySavingsPct("insider"),
  yearlySavingsPct("vip"),
);

function formatPlanPrice(plan: "insider" | "vip", billing: "monthly" | "yearly"): string {
  return `$${PLAN_PRICING[plan][billing].toFixed(2)}`;
}

export function UpgradeModal({
  open,
  onOpenChange,
  feature,
  requiredTier = "insider",
}: UpgradeModalProps) {
  const { tier: currentTier } = useSubscription();
  const [selectedPlan, setSelectedPlan] = useState<"insider" | "vip">(
    requiredTier
  );
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");

  const featureInfo = feature ? featureDescriptions[feature] : null;
  // Context id for funnel logging — the feature key, or "generic".
  const contextId = feature || "generic";
  const checkoutStartedRef = useRef(false);

  // Log present once per open; log dismiss on close unless checkout started.
  useEffect(() => {
    if (open) {
      checkoutStartedRef.current = false;
      logPaywallEvent("paywall_present", contextId);
    }
  }, [open, contextId]);

  const handleOpenChange = (next: boolean) => {
    if (!next && open && !checkoutStartedRef.current) {
      logPaywallEvent("paywall_dismiss", contextId);
    }
    onOpenChange(next);
  };

  const handleCheckoutStart = (plan: "insider" | "vip") => {
    checkoutStartedRef.current = true;
    logPaywallEvent("paywall_checkout_start", contextId, { plan, billing });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <SpriteIcon name="sparkles" className="h-5 w-5 text-amber-500" />
            Unlock Premium Features
          </DialogTitle>
          <DialogDescription>
            {featureInfo ? (
              <>
                <span className="font-medium text-foreground">
                  {featureInfo.title}
                </span>{" "}
                is available with our{" "}
                <span className="capitalize">{featureInfo.tier}</span> plan.
              </>
            ) : (
              "Upgrade to access exclusive features and get more out of Des Moines."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {/* Billing interval toggle */}
          <div className="flex items-center justify-center gap-3">
            <Label
              htmlFor="paywall-billing-toggle"
              className={cn(
                "text-sm cursor-pointer",
                billing === "monthly" ? "font-semibold" : "text-muted-foreground"
              )}
            >
              Monthly
            </Label>
            <Switch
              id="paywall-billing-toggle"
              checked={billing === "yearly"}
              onCheckedChange={(checked) => setBilling(checked ? "yearly" : "monthly")}
              aria-label="Toggle annual billing"
            />
            <Label
              htmlFor="paywall-billing-toggle"
              className={cn(
                "text-sm cursor-pointer flex items-center gap-2",
                billing === "yearly" ? "font-semibold" : "text-muted-foreground"
              )}
            >
              Yearly
              <Badge variant="secondary" className="bg-green-100 text-green-800 text-[10px]">
                Save up to {MAX_YEARLY_SAVINGS_PCT}%
              </Badge>
            </Label>
          </div>

          {/* Plan Selection */}
          <div className="grid grid-cols-2 gap-3">
            {/* Insider Plan */}
            <button
              type="button"
              onClick={() => setSelectedPlan("insider")}
              className={cn(
                "relative p-4 rounded-lg border-2 text-left transition-all",
                selectedPlan === "insider"
                  ? "border-amber-500 bg-amber-50 dark:bg-amber-950/20"
                  : "border-muted hover:border-amber-300"
              )}
            >
              {selectedPlan === "insider" && (
                <div className="absolute -top-2 -right-2">
                  <Check className="h-5 w-5 text-amber-500 bg-white dark:bg-background rounded-full" />
                </div>
              )}
              <div className="flex items-center gap-2 mb-2">
                <SpriteIcon name="sparkles" className="h-4 w-4 text-amber-500" />
                <span className="font-semibold">Insider</span>
              </div>
              <div className="text-2xl font-bold">
                {formatPlanPrice("insider", billing)}
                <span className="text-sm font-normal text-muted-foreground">
                  /{billing === "yearly" ? "yr" : "mo"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {billing === "yearly"
                  ? `Save ${yearlySavingsPct("insider")}% vs monthly`
                  : `or ${formatPlanPrice("insider", "yearly")}/yr`}
              </p>
            </button>

            {/* VIP Plan */}
            <button
              type="button"
              onClick={() => setSelectedPlan("vip")}
              className={cn(
                "relative p-4 rounded-lg border-2 text-left transition-all",
                selectedPlan === "vip"
                  ? "border-purple-500 bg-purple-50 dark:bg-purple-950/20"
                  : "border-muted hover:border-purple-300"
              )}
            >
              <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0 text-[10px]">
                BEST VALUE
              </Badge>
              {selectedPlan === "vip" && (
                <div className="absolute -top-2 -right-2">
                  <Check className="h-5 w-5 text-purple-500 bg-white dark:bg-background rounded-full" />
                </div>
              )}
              <div className="flex items-center gap-2 mb-2">
                <Crown className="h-4 w-4 text-purple-500" />
                <span className="font-semibold">VIP</span>
              </div>
              <div className="text-2xl font-bold">
                {formatPlanPrice("vip", billing)}
                <span className="text-sm font-normal text-muted-foreground">
                  /{billing === "yearly" ? "yr" : "mo"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {billing === "yearly"
                  ? `Save ${yearlySavingsPct("vip")}% vs monthly`
                  : `or ${formatPlanPrice("vip", "yearly")}/yr`}
              </p>
            </button>
          </div>

          {/* Features List */}
          <div className="bg-muted/50 rounded-lg p-4">
            <h4 className="font-medium mb-3 flex items-center gap-2">
              {selectedPlan === "insider" ? (
                <>
                  <SpriteIcon name="sparkles" className="h-4 w-4 text-amber-500" />
                  Insider Features
                </>
              ) : (
                <>
                  <Crown className="h-4 w-4 text-purple-500" />
                  VIP Features (includes Insider)
                </>
              )}
            </h4>
            <ul className="space-y-2">
              {(selectedPlan === "insider"
                ? insiderFeatures
                : [...insiderFeatures, ...vipFeatures]
              ).map((feat, idx) => (
                <li key={idx} className="flex items-center gap-2 text-sm">
                  <feat.icon className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span>{feat.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col gap-2">
            <Button
              asChild
              className={cn(
                "w-full",
                selectedPlan === "insider"
                  ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                  : "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              )}
            >
              <Link
                to={`/pricing?plan=${selectedPlan}&billing=${billing}`}
                onClick={() => handleCheckoutStart(selectedPlan)}
              >
                Upgrade to {selectedPlan === "insider" ? "Insider" : "VIP"}
              </Link>
            </Button>
            <Button
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              className="text-muted-foreground"
            >
              Maybe later
            </Button>
          </div>

          {/* Trust Indicators */}
          <p className="text-xs text-center text-muted-foreground">
            Cancel anytime • 7-day free trial • Secure checkout
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Hook for easy modal usage
export function useUpgradeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [modalProps, setModalProps] = useState<{
    feature?: string;
    requiredTier?: "insider" | "vip";
  }>({});

  const openUpgradeModal = (
    feature?: string,
    requiredTier?: "insider" | "vip"
  ) => {
    setModalProps({ feature, requiredTier });
    setIsOpen(true);
  };

  const closeUpgradeModal = () => {
    setIsOpen(false);
  };

  return {
    isOpen,
    openUpgradeModal,
    closeUpgradeModal,
    UpgradeModalComponent: () => (
      <UpgradeModal
        open={isOpen}
        onOpenChange={setIsOpen}
        feature={modalProps.feature}
        requiredTier={modalProps.requiredTier}
      />
    ),
  };
}

export default UpgradeModal;

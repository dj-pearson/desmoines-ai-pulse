import { useState } from "react";
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
import { cn } from "@/lib/utils";

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
    description: "Save as many events and restaurants as you want",
    tier: "insider",
  },
  early_access: {
    title: "Early Access",
    description: "Be the first to know about new events before they sell out",
    tier: "insider",
  },
  advanced_filters: {
    title: "Advanced Filters",
    description: "Filter by specific cuisines, price ranges, and more",
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
  { icon: Zap, text: "Early access to events" },
  { icon: Filter, text: "Advanced filters" },
  { icon: Star, text: "Ad-free experience" },
  { icon: Bell, text: "Daily personalized digest" },
];

const vipFeatures = [
  { icon: Crown, text: "Exclusive VIP events" },
  { icon: Star, text: "Reservation assistance" },
  { icon: Bell, text: "SMS alerts for your interests" },
  { icon: Sparkles, text: "Monthly local business perks" },
];

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

  const featureInfo = feature ? featureDescriptions[feature] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-amber-500" />
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
                <Sparkles className="h-4 w-4 text-amber-500" />
                <span className="font-semibold">Insider</span>
              </div>
              <div className="text-2xl font-bold">
                $4.99
                <span className="text-sm font-normal text-muted-foreground">
                  /mo
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Save 17% yearly
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
                $12.99
                <span className="text-sm font-normal text-muted-foreground">
                  /mo
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Everything included
              </p>
            </button>
          </div>

          {/* Features List */}
          <div className="bg-muted/50 rounded-lg p-4">
            <h4 className="font-medium mb-3 flex items-center gap-2">
              {selectedPlan === "insider" ? (
                <>
                  <Sparkles className="h-4 w-4 text-amber-500" />
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
              <Link to="/pricing" onClick={() => onOpenChange(false)}>
                Upgrade to {selectedPlan === "insider" ? "Insider" : "VIP"}
              </Link>
            </Button>
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
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

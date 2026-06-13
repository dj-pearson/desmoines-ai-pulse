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
import { Crown, Sparkles, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  resolvePaywallContext,
  type PaywallTier,
} from "@/lib/paywallContexts";
import { trackPaywallEvent } from "@/lib/paywallAnalytics";

interface PaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Context/feature id — resolves tailored copy (e.g. "trip_planner"). */
  context?: string;
  /** Optional tier override; defaults to the context's recommended tier. */
  requiredTier?: PaywallTier;
}

const PLAN_PRICE: Record<PaywallTier, string> = {
  insider: "$4.99",
  vip: "$12.99",
};

/**
 * Contextual paywall modal (WEB-FEAT-001) — web parity with the iOS PaywallView.
 * Surfaces per-feature copy at the moment of desire, lets the user pick a tier,
 * and hands off to the existing Stripe checkout via /pricing. Accessibility
 * (focus trap, Escape, focus restore) is provided by the Radix Dialog; every
 * present/dismiss/checkout-start is logged with the context id for per-surface
 * conversion measurement.
 */
export function PaywallModal({
  open,
  onOpenChange,
  context,
  requiredTier,
}: PaywallModalProps) {
  const ctx = resolvePaywallContext(context);
  const recommended = requiredTier ?? ctx.recommendedTier;
  const [selectedPlan, setSelectedPlan] = useState<PaywallTier>(recommended);

  // Track whether the modal was closed via a checkout-start so we don't also
  // log a dismiss for the same interaction.
  const checkoutStartedRef = useRef(false);
  const ContextIcon = ctx.icon;

  // Keep the selected plan in sync with the recommended tier each time the
  // modal opens for a new context.
  useEffect(() => {
    if (open) {
      setSelectedPlan(recommended);
      checkoutStartedRef.current = false;
      trackPaywallEvent("present", ctx.id, recommended);
    }
    // Only re-run when visibility or the context changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ctx.id]);

  const handleOpenChange = (next: boolean) => {
    if (!next && open && !checkoutStartedRef.current) {
      trackPaywallEvent("dismiss", ctx.id, selectedPlan);
    }
    onOpenChange(next);
  };

  const handleCheckoutStart = () => {
    checkoutStartedRef.current = true;
    trackPaywallEvent("checkout_start", ctx.id, selectedPlan);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full",
                recommended === "vip"
                  ? "bg-gradient-to-br from-purple-500 to-pink-500"
                  : "bg-gradient-to-br from-amber-500 to-orange-500",
              )}
            >
              <ContextIcon className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 text-left">
              <DialogTitle className="text-lg leading-tight">
                {ctx.headline}
              </DialogTitle>
            </div>
          </div>
          <DialogDescription className="text-left pt-1">
            {ctx.subheadline}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          {/* Contextual benefit bullets */}
          <ul className="space-y-2">
            {ctx.benefits.map((benefit, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>

          {/* Plan selection */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setSelectedPlan("insider")}
              aria-pressed={selectedPlan === "insider"}
              className={cn(
                "relative rounded-lg border-2 p-3 text-left transition-all",
                selectedPlan === "insider"
                  ? "border-amber-500 bg-amber-50 dark:bg-amber-950/20"
                  : "border-muted hover:border-amber-300",
              )}
            >
              {selectedPlan === "insider" && (
                <Check className="absolute -right-2 -top-2 h-5 w-5 rounded-full bg-white text-amber-500 dark:bg-background" />
              )}
              <div className="mb-1 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <span className="font-semibold">Insider</span>
              </div>
              <div className="text-xl font-bold">
                {PLAN_PRICE.insider}
                <span className="text-sm font-normal text-muted-foreground">
                  /mo
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedPlan("vip")}
              aria-pressed={selectedPlan === "vip"}
              className={cn(
                "relative rounded-lg border-2 p-3 text-left transition-all",
                selectedPlan === "vip"
                  ? "border-purple-500 bg-purple-50 dark:bg-purple-950/20"
                  : "border-muted hover:border-purple-300",
              )}
            >
              <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 border-0 bg-gradient-to-r from-purple-500 to-pink-500 text-[10px] text-white">
                BEST VALUE
              </Badge>
              {selectedPlan === "vip" && (
                <Check className="absolute -right-2 -top-2 h-5 w-5 rounded-full bg-white text-purple-500 dark:bg-background" />
              )}
              <div className="mb-1 flex items-center gap-1.5">
                <Crown className="h-4 w-4 text-purple-500" />
                <span className="font-semibold">VIP</span>
              </div>
              <div className="text-xl font-bold">
                {PLAN_PRICE.vip}
                <span className="text-sm font-normal text-muted-foreground">
                  /mo
                </span>
              </div>
            </button>
          </div>

          {/* CTA */}
          <div className="flex flex-col gap-2">
            <Button
              asChild
              className={cn(
                "w-full",
                selectedPlan === "vip"
                  ? "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                  : "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600",
              )}
            >
              <Link to="/pricing" onClick={handleCheckoutStart}>
                Upgrade to {selectedPlan === "vip" ? "VIP" : "Insider"}
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

          <p className="text-center text-xs text-muted-foreground">
            Cancel anytime • 7-day free trial • Secure checkout
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PaywallModal;

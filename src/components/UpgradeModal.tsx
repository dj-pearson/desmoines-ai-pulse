import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Crown, Check } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { useTrialEligibility } from "@/hooks/useTrialEligibility";
import { logPaywallEvent } from "@/lib/paywallAnalytics";
import {
  benefitsFor,
  displayPrice,
  yearlySavings,
  TRIP_PLANNER_MONTHLY_QUOTA,
  type BillingInterval,
} from "@/lib/planBenefits";
import { IN_PLACE_PLAN_CHANGE_ENABLED, PLAN_CHANGE_PAUSED_MESSAGE } from "@/lib/billingStatus";
import { cn } from "@/lib/utils";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

type PaidPlan = "insider" | "vip";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature?: string;
  requiredTier?: PaidPlan;
  /**
   * The cap the viewer hit and how much of it they have used, when the caller
   * knows (a saved-search limit, a trip-plan quota). Both come from the
   * server's refusal or the caller's own count; the modal never estimates them.
   */
  limit?: number;
  used?: number;
}

const featureDescriptions: Record<string, { title: string; description: string }> = {
  // WEB-FEAT-016 removed the copy for five entitlement keys nothing delivers
  // (the vip_* keys, reservation_assistance, sms_alerts, concierge, and the
  // insider early-events key). WP4 removed daily_digest (the digest is weekly
  // and free) and insider_tips (a key in neither entitlement map). The keys
  // stay in _shared/entitlements.ts and useSubscription so no shipped mobile
  // build loses a feature it can ask about; what is gone is the promise.
  // The tier each feature needs comes from the caller's requiredTier, not here.
  unlimited_favorites: {
    title: "Unlimited favorites",
    // The free cap in the sentence comes from the free plan row at render.
    description: "",
  },
  // Lists only what /search/advanced applies (search plan WP4 item 2). It
  // used to promise distance, price range and time of day, none of which any
  // query read. Search WP4 Stage B owns this entry (pricing plan D-D2).
  advanced_filters: {
    title: "Advanced Filters",
    description: "Filter search by minimum rating, area, event dates and featured picks",
  },
  ad_free: {
    title: "Ad-free browsing",
    description: "Browse without ads.",
  },
  trip_planner: {
    title: "AI trip plans",
    description: "Build a Des Moines itinerary with AI.",
  },
  write_reviews: {
    title: "Writing reviews",
    description: "Rate and review events, restaurants and attractions.",
  },
  save_searches: {
    title: "Saved searches",
    description: "Save a search and get an email when new events match it.",
  },
  create_alerts: {
    title: "Event alerts",
    description: "Get an email when new events match what you follow.",
  },
};

/** What the viewer ran out of, for "You've used 10 of 10 saved searches." */
const USAGE_NOUN: Record<string, string> = {
  save_searches: "saved searches",
  create_alerts: "saved searches",
  trip_planner: "trip plans this month",
  unlimited_favorites: "favorites",
};

const PLAN_LABEL: Record<PaidPlan, string> = { insider: "Insider", vip: "VIP" };

function formatDollars(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function nextPlanFor(tier: string, requiredTier: PaidPlan): PaidPlan[] {
  if (tier === "vip") return [];
  if (tier === "insider") return ["vip"];
  return requiredTier === "vip" ? ["vip"] : ["insider", "vip"];
}

export function UpgradeModal({
  open,
  onOpenChange,
  feature,
  requiredTier = "insider",
  limit,
  used,
}: UpgradeModalProps) {
  const { tier: currentTier, plans, subscriptions } = useSubscription();
  // WEB-FEAT-014: an Insider upgrading to VIP, and anyone resubscribing after a
  // cancellation, gets no trial. Promising one here was copy the checkout refuses.
  const { isEligibleForTrial } = useTrialEligibility();

  // An Insider is only ever offered VIP; a free viewer sent here for a VIP
  // feature is offered VIP alone, since Insider would not unlock it.
  const offered = nextPlanFor(currentTier, requiredTier);
  const preferred: PaidPlan | null = offered.includes(requiredTier) ? requiredTier : offered[0] ?? null;

  const [selectedPlan, setSelectedPlan] = useState<PaidPlan>(preferred ?? requiredTier);
  const [billing, setBilling] = useState<BillingInterval>("monthly");

  // The dialog can stay mounted between openings (PremiumGate), and the tier
  // can resolve after it opens, so the selection follows both.
  useEffect(() => {
    if (open && preferred) setSelectedPlan(preferred);
  }, [open, preferred]);

  // A web subscriber changing tier goes through /subscription while in-place
  // changes are paused (billingStatus.ts, pricing plan D1).
  const heldWebPlan =
    subscriptions.find(
      (s) => s.platform === "web" && (s.status === "active" || s.status === "trialing"),
    )?.plan?.name ?? null;
  const planChangePaused = !IN_PLACE_PLAN_CHANGE_ENABLED && !!heldWebPlan;

  const featureInfo = feature ? featureDescriptions[feature] : null;
  const contextId = feature || "generic";
  const ctaClickedRef = useRef(false);

  // Log present once per open; log dismiss on close unless the CTA was used.
  useEffect(() => {
    if (open) {
      ctaClickedRef.current = false;
      logPaywallEvent("paywall_present", contextId, { tier: currentTier });
    }
    // currentTier is context for the row, not a reason to log again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contextId]);

  const handleOpenChange = (next: boolean) => {
    if (!next && open && !ctaClickedRef.current) {
      logPaywallEvent("paywall_dismiss", contextId);
    }
    onOpenChange(next);
  };

  const handleCtaClick = (destination: "pricing" | "subscription") => {
    ctaClickedRef.current = true;
    logPaywallEvent("paywall_cta_click", contextId, { plan: selectedPlan, billing, destination });
    onOpenChange(false);
  };

  const rowFor = (name: PaidPlan) => plans.find((p) => p.name === name);
  const benefits = benefitsFor(selectedPlan, rowFor(selectedPlan)?.limits);

  const usageLine = (() => {
    if (typeof limit !== "number" || typeof used !== "number" || limit < 0) return null;
    const noun = feature ? USAGE_NOUN[feature] : undefined;
    if (!noun) return null;
    let vipNote = "";
    if (feature === "trip_planner" && TRIP_PLANNER_MONTHLY_QUOTA.vip === -1) {
      vipNote = " VIP has no monthly cap.";
    } else if (feature === "save_searches" || feature === "create_alerts") {
      const vipCap = rowFor("vip")?.limits?.saved_searches;
      if (vipCap === -1) vipNote = " VIP has no cap.";
    }
    return `You've used ${used} of ${limit} ${noun}.${vipNote}`;
  })();

  const freeFavorites = plans.find((p) => p.name === "free")?.limits?.favorites;
  const featureDetail = (() => {
    if (!featureInfo) return null;
    if (feature === "unlimited_favorites" && typeof freeFavorites === "number" && freeFavorites > 0) {
      return `Free accounts can save ${freeFavorites}.`;
    }
    if (feature === "unlimited_favorites") return null;
    const text = featureInfo.description;
    return text.endsWith(".") ? text : `${text}.`;
  })();

  const description: ReactNode = (() => {
    if (offered.length === 0) return "You're on VIP, which includes this.";
    if (usageLine) return usageLine;
    if (currentTier === "insider") {
      return featureInfo ? (
        <>
          <span className="font-medium text-foreground">{featureInfo.title}</span> needs VIP. Here's
          what VIP adds to your Insider plan.
        </>
      ) : (
        "Here's what VIP adds to your Insider plan."
      );
    }
    return featureInfo ? (
      <>
        <span className="font-medium text-foreground">{featureInfo.title}</span> is part of{" "}
        {PLAN_LABEL[requiredTier]}.{featureDetail ? ` ${featureDetail}` : ""}
      </>
    ) : (
      "Pick a plan to see what it adds."
    );
  })();

  // Roving focus for the plan radio group (arrow keys move the selection).
  const cardRefs = useRef<Record<PaidPlan, HTMLButtonElement | null>>({ insider: null, vip: null });
  const onCardKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (offered.length < 2) return;
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const at = offered.indexOf(selectedPlan);
    const next = offered[(at + step + offered.length) % offered.length];
    setSelectedPlan(next);
    cardRefs.current[next]?.focus();
  };

  const selectedLabel = PLAN_LABEL[selectedPlan];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <SpriteIcon name="sparkles" className="h-5 w-5 text-amber-700 dark:text-amber-500" />
            {currentTier === "insider" ? "Move up to VIP" : "Unlock Premium Features"}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {offered.length === 0 ? (
          <div className="mt-4 flex justify-end">
            <Button variant="ghost" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
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
                aria-label="Bill yearly"
              />
              <Label
                htmlFor="paywall-billing-toggle"
                className={cn(
                  "text-sm cursor-pointer",
                  billing === "yearly" ? "font-semibold" : "text-muted-foreground"
                )}
              >
                Yearly
              </Label>
            </div>

            <div
              role="radiogroup"
              aria-label="Choose a plan"
              className={cn("grid gap-3", offered.length > 1 ? "grid-cols-2" : "grid-cols-1")}
            >
              {offered.map((plan) => {
                const selected = selectedPlan === plan;
                const price = displayPrice(plans, plan, billing);
                const yearlyPrice = displayPrice(plans, plan, "yearly");
                const saved = yearlySavings(plans, plan);
                const isVip = plan === "vip";
                return (
                  <button
                    key={plan}
                    ref={(el) => {
                      cardRefs.current[plan] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    tabIndex={selected ? 0 : -1}
                    data-plan={plan}
                    onClick={() => setSelectedPlan(plan)}
                    onKeyDown={onCardKeyDown}
                    className={cn(
                      "relative p-4 rounded-xl border-2 text-left transition-colors min-h-11",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      selected
                        ? isVip
                          ? "border-secondary bg-secondary/5"
                          : "border-amber-700 bg-amber-50 dark:border-amber-500 dark:bg-amber-950/20"
                        : isVip
                          ? "border-muted hover:border-secondary/40"
                          : "border-muted hover:border-amber-700/40"
                    )}
                  >
                    {selected && (
                      <span className="absolute -top-2 -right-2" aria-hidden="true">
                        <Check
                          className={cn(
                            "h-5 w-5 rounded-full bg-background",
                            isVip ? "text-secondary" : "text-amber-700 dark:text-amber-500"
                          )}
                        />
                      </span>
                    )}
                    <span className="flex items-center gap-2 mb-2">
                      {isVip ? (
                        <Crown className="h-4 w-4 text-secondary" aria-hidden="true" />
                      ) : (
                        <SpriteIcon name="sparkles" className="h-4 w-4 text-amber-700 dark:text-amber-500" />
                      )}
                      <span className="font-semibold">{PLAN_LABEL[plan]}</span>
                    </span>
                    {price === null ? (
                      <span className="block text-sm text-muted-foreground">Price on the plans page</span>
                    ) : (
                      <span className="block text-2xl font-bold">
                        {formatDollars(price)}
                        <span className="text-sm font-normal text-muted-foreground">
                          /{billing === "yearly" ? "yr" : "mo"}
                        </span>
                      </span>
                    )}
                    <span className="block text-xs text-muted-foreground mt-1">
                      {billing === "yearly"
                        ? saved !== null
                          ? `${formatDollars(saved)} less than paying monthly`
                          : null
                        : yearlyPrice !== null
                          ? `or ${formatDollars(yearlyPrice)}/yr`
                          : null}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="bg-muted/50 rounded-xl p-4">
              <h3 className="font-medium mb-3">
                {selectedPlan === "vip" && currentTier === "insider"
                  ? "What VIP adds"
                  : selectedPlan === "vip"
                    ? "What VIP includes"
                    : "What Insider includes"}
              </h3>
              <ul className="space-y-2">
                {benefits.map((b) => (
                  <li key={b.key} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-green-700 dark:text-green-500 flex-shrink-0" aria-hidden="true" />
                    <span>{b.text}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-2">
              {planChangePaused ? (
                <>
                  <p className="text-sm text-muted-foreground" role="status">
                    {PLAN_CHANGE_PAUSED_MESSAGE}
                  </p>
                  <Button asChild variant="outline" className="w-full min-h-11">
                    <Link to="/subscription" onClick={() => handleCtaClick("subscription")}>
                      Manage your plan
                    </Link>
                  </Button>
                </>
              ) : (
                <Button
                  asChild
                  className={cn(
                    "w-full min-h-11",
                    selectedPlan === "insider"
                      ? "bg-amber-700 text-white hover:bg-amber-800"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/90"
                  )}
                >
                  <Link
                    to={`/pricing?plan=${selectedPlan}&billing=${billing}`}
                    onClick={() => handleCtaClick("pricing")}
                  >
                    Upgrade to {selectedLabel}
                  </Link>
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => handleOpenChange(false)}
                className="text-muted-foreground min-h-11"
              >
                Maybe later
              </Button>
            </div>

            {!planChangePaused && (
              <p className="text-xs text-center text-muted-foreground">
                {isEligibleForTrial ? "7-day free trial. " : ""}Cancel anytime. Checkout is handled by Stripe.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface UpgradeModalRequest {
  feature?: string;
  requiredTier?: PaidPlan;
  limit?: number;
  used?: number;
}

/**
 * Local modal state for a component that opens the paywall itself.
 *
 * `UpgradeModalComponent` keeps its identity until the modal opens, closes or
 * gets new props. It used to be a fresh arrow function each render, which React
 * treats as a new component type: any parent re-render (a toast, a query
 * resolving) unmounted and remounted the open dialog, reset its selection and
 * logged paywall_present again.
 */
export function useUpgradeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [modalProps, setModalProps] = useState<UpgradeModalRequest>({});

  const openUpgradeModal = useCallback(
    (feature?: string, requiredTier?: PaidPlan, usage?: { limit?: number; used?: number }) => {
      setModalProps({ feature, requiredTier, limit: usage?.limit, used: usage?.used });
      setIsOpen(true);
    },
    [],
  );

  const closeUpgradeModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  const UpgradeModalComponent = useMemo(() => {
    function BoundUpgradeModal() {
      return (
        <UpgradeModal
          open={isOpen}
          onOpenChange={setIsOpen}
          feature={modalProps.feature}
          requiredTier={modalProps.requiredTier}
          limit={modalProps.limit}
          used={modalProps.used}
        />
      );
    }
    return BoundUpgradeModal;
  }, [isOpen, modalProps]);

  return {
    isOpen,
    openUpgradeModal,
    closeUpgradeModal,
    UpgradeModalComponent,
  };
}

export default UpgradeModal;

import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Lock, Crown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuthFlags } from "@/hooks/useAuth";
import { UpgradeModal } from "@/components/UpgradeModal";
import { FeatureTag } from "@/components/PremiumBadge";
import { requiredTierFor } from "@/lib/premiumFeatures";
import { isValidRedirectUrl } from "@/lib/redirectSafety";
import { handleError } from "@/lib/errorHandler";
import { createLogger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

type PaidTier = "insider" | "vip";

interface PremiumGateProps {
  children: ReactNode;
  feature: string;
  /**
   * Kept for existing call sites. The tier a feature needs comes from
   * PREMIUM_FEATURES (src/lib/premiumFeatures.ts); a prop that disagrees with
   * the map is reported in development and the map wins.
   */
  requiredTier?: PaidTier;
  // Display modes
  mode?: "blur" | "lock" | "hide" | "inline";
  // Custom messaging
  title?: string;
  description?: string;
  // Styling
  className?: string;
  // For inline mode - show condensed version
  inline?: boolean;
}

const log = createLogger("PremiumGate");

const TIER_LABEL: Record<PaidTier, string> = { insider: "Insider", vip: "VIP" };

/**
 * Whether someone is signed in. The gate is also rendered in unit tests with
 * no AuthProvider, where useAuthFlags throws; with no provider there is no
 * session to know about, so the gate answers as it did before it asked
 * (the upgrade prompt). The hook call itself is unconditional.
 */
function useIsSignedIn(): boolean {
  try {
    return useAuthFlags().isAuthenticated;
  } catch {
    return true;
  }
}

function resolveRequiredTier(feature: string, prop: PaidTier | undefined): PaidTier {
  const mapped = requiredTierFor(feature);
  if (import.meta.env.DEV && mapped && prop && mapped !== prop) {
    log.warn(
      "resolveRequiredTier",
      `feature="${feature}" has requiredTier="${prop}" but PREMIUM_FEATURES says "${mapped}"; using "${mapped}".`,
    );
  }
  return mapped ?? prop ?? "insider";
}

function tierButtonClass(tier: PaidTier): string {
  return tier === "vip"
    ? "bg-secondary text-secondary-foreground hover:bg-secondary/90"
    : "bg-amber-700 text-white hover:bg-amber-800";
}

function TierIcon({ tier, className }: { tier: PaidTier; className?: string }) {
  return tier === "vip" ? (
    <Crown className={cn("text-secondary", className)} aria-hidden="true" />
  ) : (
    <SpriteIcon name="sparkles" className={cn("text-amber-700 dark:text-amber-500", className)} />
  );
}

export function PremiumGate({
  children,
  feature,
  requiredTier: requiredTierProp,
  mode = "lock",
  title,
  description,
  className,
}: PremiumGateProps) {
  const {
    hasFeature,
    tier,
    subscriptionLoading,
    subscriptionError,
    refetchSubscription,
    isPastDue,
    inGracePeriod,
  } = useSubscription();
  const signedIn = useIsSignedIn();
  const { pathname, search } = useLocation();
  const [showModal, setShowModal] = useState(false);
  const requiredTier = resolveRequiredTier(feature, requiredTierProp);

  // Pricing plan WP4 item 6: a failed read is "don't know", not "free".
  useEffect(() => {
    if (subscriptionError) {
      handleError(subscriptionError, { component: "PremiumGate", action: "readSubscription" });
    }
  }, [subscriptionError]);

  // WEB-FEAT-018: do not answer before the answer is known.
  //
  // useSubscription reports tier "free" until the user-subscriptions query
  // resolves, so a paying subscriber was shown "Upgrade to Unlock" on every
  // load of /trip-planner and every gated section, for as long as that request
  // took. Charging someone and then telling them to upgrade is the worst
  // version of this component's job.
  //
  // subscriptionLoading, not isLoading: isLoading also covers the
  // subscription_plans query, which runs for signed-out visitors too and would
  // put a skeleton in front of the paywall they are meant to see. A disabled
  // query (no user) is not loading, so anonymous visitors reach the gate
  // immediately, as before.
  if (subscriptionLoading) {
    // Hide mode renders nothing either way, so there is nothing to hold back.
    if (mode === "hide") return null;
    return (
      <div
        className={cn("animate-pulse rounded-lg bg-muted/60 min-h-24", className)}
        aria-busy="true"
        aria-label="Checking your subscription"
      />
    );
  }

  // Cached rows can still grant access after a failed refetch.
  if (hasFeature(feature)) {
    return <>{children}</>;
  }

  if (mode === "hide") {
    return null;
  }

  // The read failed, so this may well be a paying member. Offer a retry, never
  // the paywall.
  if (subscriptionError) {
    const retry = () => {
      void refetchSubscription?.();
    };
    if (mode === "inline") {
      return (
        <div
          role="status"
          className={cn("flex flex-wrap items-center gap-2 text-sm text-muted-foreground", className)}
        >
          <span>Couldn't check your plan.</span>
          <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={retry}>
            <RefreshCw className="h-4 w-4 mr-1" aria-hidden="true" />
            Retry
          </Button>
        </div>
      );
    }
    return (
      <Card className={cn("border-dashed", className)}>
        <CardContent role="status" className="flex flex-col items-center justify-center py-8 text-center">
          <h3 className="font-semibold mb-1">Couldn't check your plan</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-sm">
            We couldn't reach our servers to confirm your membership. Nothing has changed on your account.
          </p>
          <Button type="button" variant="outline" className="min-h-11" onClick={retry}>
            <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const tierLabel = TIER_LABEL[requiredTier];
  const featureName = title || `This ${tierLabel} feature`;

  // Pricing plan WP4 item 8: what to say depends on who is looking.
  const here = `${pathname}${search}`;
  const authHref = `/auth?redirect=${encodeURIComponent(isValidRedirectUrl(here) ? here : "/")}`;
  const lapsedPastDue = signedIn && isPastDue && !inGracePeriod;

  let heading: string;
  let body: string;
  let primary: ReactNode;
  let secondary: ReactNode = null;

  if (!signedIn) {
    heading = title || `${tierLabel} feature`;
    body = description || `${featureName} is part of ${tierLabel}. Start with a free account, then pick a plan.`;
    primary = (
      <Button asChild className="min-h-11">
        <Link to={authHref}>Create a free account</Link>
      </Button>
    );
    secondary = (
      <Button type="button" variant="ghost" className="min-h-11" onClick={() => setShowModal(true)}>
        See what {tierLabel} includes
      </Button>
    );
  } else if (lapsedPastDue) {
    heading = "Update your payment";
    body = `Your last payment didn't go through and the grace period has ended. Update your card to get ${tierLabel} back.`;
    primary = (
      <Button asChild className="min-h-11">
        <Link to="/subscription">Update payment</Link>
      </Button>
    );
  } else {
    const needsHigherTier = requiredTier === "vip" && tier === "insider";
    heading = title || (needsHigherTier ? "VIP feature" : `${tierLabel} feature`);
    body =
      description ||
      (needsHigherTier ? "Move up to VIP to use this." : `Upgrade to ${tierLabel} to use this.`);
    primary = (
      <Button type="button" onClick={() => setShowModal(true)} className={cn("min-h-11", tierButtonClass(requiredTier))}>
        <TierIcon tier={requiredTier} className="h-4 w-4 mr-2 text-current" />
        {mode === "blur" ? "Unlock" : "Upgrade to Unlock"}
      </Button>
    );
  }

  const modal = (
    <UpgradeModal
      open={showModal}
      onOpenChange={setShowModal}
      feature={feature}
      requiredTier={requiredTier}
    />
  );

  // Blur mode - show blurred content with overlay
  if (mode === "blur") {
    return (
      <div className={cn("relative", className)}>
        <div className="blur-sm pointer-events-none select-none" aria-hidden="true">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-lg">
          <div className="text-center p-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-3">
              <Lock className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <h3 className="font-semibold mb-1">{heading}</h3>
            <p className="text-sm text-muted-foreground mb-3">{body}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {primary}
              {secondary}
            </div>
          </div>
        </div>
        {modal}
      </div>
    );
  }

  // Inline mode - a compact prompt with its description
  if (mode === "inline") {
    const lockedLabel = (
      <>
        <Lock className="h-4 w-4" aria-hidden="true" />
        <span>{heading}</span>
        <FeatureTag requiredTier={requiredTier} size="sm" />
      </>
    );
    const rowClass =
      "flex items-center gap-2 min-h-11 px-3 py-2 rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-muted/50 transition-colors";
    return (
      <div className={cn("space-y-1", className)}>
        {!signedIn ? (
          <Link to={authHref} className={rowClass}>
            {lockedLabel}
          </Link>
        ) : lapsedPastDue ? (
          <Link to="/subscription" className={rowClass}>
            {lockedLabel}
          </Link>
        ) : (
          <button type="button" onClick={() => setShowModal(true)} className={rowClass}>
            {lockedLabel}
          </button>
        )}
        <p className="text-xs text-muted-foreground">{body}</p>
        {modal}
      </div>
    );
  }

  // Lock mode (default) - show a locked card
  return (
    <>
      <Card className={cn("border-dashed", className)}>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-muted mb-4">
            <TierIcon tier={requiredTier} className="h-6 w-6" />
          </div>
          <FeatureTag requiredTier={requiredTier} size="md" />
          <h3 className="font-semibold mt-3 mb-1">{heading}</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-sm">{body}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {primary}
            {secondary}
          </div>
        </CardContent>
      </Card>
      {modal}
    </>
  );
}

// Wrapper component for premium-only sections
interface PremiumSectionProps {
  children: ReactNode;
  feature: string;
  requiredTier?: "insider" | "vip";
  fallback?: ReactNode;
}

export function PremiumSection({
  children,
  feature,
  requiredTier = "insider",
  fallback,
}: PremiumSectionProps) {
  const { hasFeature, subscriptionLoading } = useSubscription();

  // WEB-FEAT-018. Rendering the fallback first and the real section a moment
  // later is the same flash PremiumGate had; this section has no skeleton to
  // show, so it waits.
  if (subscriptionLoading) {
    return null;
  }

  if (hasFeature(feature)) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return null;
}

// Button that triggers upgrade modal when user doesn't have feature
interface PremiumButtonProps {
  feature: string;
  requiredTier?: "insider" | "vip";
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "sm" | "default" | "lg";
  disabled?: boolean;
}

export function PremiumButton({
  feature,
  requiredTier = "insider",
  onClick,
  children,
  className,
  variant = "default",
  size = "default",
  disabled,
}: PremiumButtonProps) {
  const { hasFeature, subscriptionLoading } = useSubscription();
  const [showModal, setShowModal] = useState(false);

  const handleClick = () => {
    // WEB-FEAT-018: a click that lands before the subscription resolves must
    // not be answered with the upgrade modal. The button is disabled below for
    // exactly that window, so this is the belt to that braces.
    if (subscriptionLoading) return;
    if (hasFeature(feature)) {
      onClick?.();
    } else {
      setShowModal(true);
    }
  };

  const hasAccess = hasFeature(feature);
  // While the subscription is resolving the answer is unknown, so the button
  // carries no upgrade tag - a subscriber saw one appear and then vanish.
  const showUpgradeTag = !subscriptionLoading && !hasAccess;

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={handleClick}
        disabled={disabled || subscriptionLoading}
        className={cn(
          showUpgradeTag && "relative",
          className
        )}
      >
        {children}
        {showUpgradeTag && (
          <FeatureTag
            requiredTier={requiredTier}
            size="sm"
          />
        )}
      </Button>
      <UpgradeModal
        open={showModal}
        onOpenChange={setShowModal}
        feature={feature}
        requiredTier={requiredTier}
      />
    </>
  );
}

export default PremiumGate;

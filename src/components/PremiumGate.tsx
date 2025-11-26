import { useState, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Lock, Crown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSubscription } from "@/hooks/useSubscription";
import { UpgradeModal } from "@/components/UpgradeModal";
import { FeatureTag } from "@/components/PremiumBadge";
import { cn } from "@/lib/utils";

interface PremiumGateProps {
  children: ReactNode;
  feature: string;
  requiredTier?: "insider" | "vip";
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

export function PremiumGate({
  children,
  feature,
  requiredTier = "insider",
  mode = "lock",
  title,
  description,
  className,
}: PremiumGateProps) {
  const { hasFeature, tier, isPremium } = useSubscription();
  const [showModal, setShowModal] = useState(false);

  // Check if user has access
  const hasAccess = hasFeature(feature);

  // If user has access, show content
  if (hasAccess) {
    return <>{children}</>;
  }

  // Determine if current tier is lower than required
  const needsHigherTier =
    requiredTier === "vip" && tier === "insider" ? true : false;

  const defaultTitle = needsHigherTier
    ? "VIP Feature"
    : `${requiredTier === "vip" ? "VIP" : "Insider"} Feature`;

  const defaultDescription = needsHigherTier
    ? "Upgrade to VIP to unlock this feature"
    : `Upgrade to ${requiredTier === "vip" ? "VIP" : "Insider"} to access this feature`;

  // Hide mode - don't show anything
  if (mode === "hide") {
    return null;
  }

  // Blur mode - show blurred content with overlay
  if (mode === "blur") {
    return (
      <div className={cn("relative", className)}>
        <div className="blur-sm pointer-events-none select-none">{children}</div>
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-lg">
          <div className="text-center p-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-3">
              <Lock className="h-5 w-5 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-1">{title || defaultTitle}</h3>
            <p className="text-sm text-muted-foreground mb-3">
              {description || defaultDescription}
            </p>
            <Button
              size="sm"
              onClick={() => setShowModal(true)}
              className={cn(
                requiredTier === "vip"
                  ? "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                  : "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
              )}
            >
              {requiredTier === "vip" ? (
                <Crown className="h-4 w-4 mr-1" />
              ) : (
                <Sparkles className="h-4 w-4 mr-1" />
              )}
              Unlock
            </Button>
          </div>
        </div>
        <UpgradeModal
          open={showModal}
          onOpenChange={setShowModal}
          feature={feature}
          requiredTier={requiredTier}
        />
      </div>
    );
  }

  // Inline mode - small inline prompt
  if (mode === "inline") {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-muted/50 transition-colors",
            className
          )}
        >
          <Lock className="h-4 w-4" />
          <span>{title || defaultTitle}</span>
          <FeatureTag requiredTier={requiredTier} size="sm" />
        </button>
        <UpgradeModal
          open={showModal}
          onOpenChange={setShowModal}
          feature={feature}
          requiredTier={requiredTier}
        />
      </>
    );
  }

  // Lock mode (default) - show a locked card
  return (
    <>
      <Card className={cn("border-dashed", className)}>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-muted mb-4">
            {requiredTier === "vip" ? (
              <Crown className="h-6 w-6 text-purple-500" />
            ) : (
              <Sparkles className="h-6 w-6 text-amber-500" />
            )}
          </div>
          <FeatureTag requiredTier={requiredTier} size="md" />
          <h3 className="font-semibold mt-3 mb-1">{title || defaultTitle}</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-sm">
            {description || defaultDescription}
          </p>
          <Button
            onClick={() => setShowModal(true)}
            className={cn(
              requiredTier === "vip"
                ? "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                : "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
            )}
          >
            {requiredTier === "vip" ? (
              <Crown className="h-4 w-4 mr-2" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Upgrade to Unlock
          </Button>
        </CardContent>
      </Card>
      <UpgradeModal
        open={showModal}
        onOpenChange={setShowModal}
        feature={feature}
        requiredTier={requiredTier}
      />
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
  const { hasFeature } = useSubscription();

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
  const { hasFeature } = useSubscription();
  const [showModal, setShowModal] = useState(false);

  const handleClick = () => {
    if (hasFeature(feature)) {
      onClick?.();
    } else {
      setShowModal(true);
    }
  };

  const hasAccess = hasFeature(feature);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={handleClick}
        disabled={disabled}
        className={cn(
          !hasAccess && "relative",
          className
        )}
      >
        {children}
        {!hasAccess && (
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

import { Crown, Sparkles, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSubscription, SubscriptionTier } from "@/hooks/useSubscription";
import { cn } from "@/lib/utils";

interface PremiumBadgeProps {
  showTier?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Tier surfaces are flat, not gradients, and every one carries white text at
 * >= 4.5:1.
 *
 * What was here before was white text on `from-slate-400 to-slate-500`
 * (3.0:1 at the light end), `from-amber-400 to-orange-500` (1.7:1 - the
 * Insider label was effectively invisible) and `from-purple-500 to-pink-500`.
 * The badge renders at text-[10px] in FeatureTag, so WCAG 1.4.3 wants 4.5:1,
 * and none of the three cleared it.
 *
 * Measured against white: slate-600 7.58, amber-700 5.02, and the brand red
 * --secondary 6.08 light / 5.23 dark. VIP now reads as the platform's own red
 * rather than a purple-to-pink gradient that belongs to no part of this brand.
 */
const tierConfig: Record<
  SubscriptionTier,
  {
    icon: React.ElementType;
    label: string;
    surface: string;
    tooltip: string;
  }
> = {
  free: {
    icon: Star,
    label: "Free",
    surface: "bg-slate-600 text-white",
    tooltip: "Free plan",
  },
  insider: {
    icon: Sparkles,
    label: "Insider",
    surface: "bg-amber-700 text-white",
    tooltip: "Insider member - Unlock premium features",
  },
  vip: {
    icon: Crown,
    label: "VIP",
    surface: "bg-secondary text-secondary-foreground",
    tooltip: "VIP member - Full access to all features",
  },
};

const sizeConfig = {
  sm: {
    badge: "text-xs px-2 py-0.5",
    icon: "h-3 w-3",
  },
  md: {
    badge: "text-sm px-2.5 py-1",
    icon: "h-3.5 w-3.5",
  },
  lg: {
    badge: "text-base px-3 py-1.5",
    icon: "h-4 w-4",
  },
};

export function PremiumBadge({
  showTier = true,
  size = "sm",
  className,
}: PremiumBadgeProps) {
  const { tier, isPremium } = useSubscription();

  // Don't show anything for free users unless specifically requested
  if (!isPremium && !showTier) return null;

  const config = tierConfig[tier];
  const sizeStyles = sizeConfig[size];
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "border-0 font-medium",
              config.surface,
              sizeStyles.badge,
              className
            )}
          >
            <Icon className={cn(sizeStyles.icon, showTier && "mr-1")} />
            {showTier && config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{config.tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Inline badge for use in text
export function PremiumInlineBadge({ tier }: { tier: SubscriptionTier }) {
  const config = tierConfig[tier];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium",
        config.surface
      )}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

// Feature tag to show what tier is required for a feature
interface FeatureTagProps {
  requiredTier: "insider" | "vip";
  size?: "sm" | "md";
}

export function FeatureTag({ requiredTier, size = "sm" }: FeatureTagProps) {
  const config = tierConfig[requiredTier];
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full font-medium",
              config.surface,
              size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1"
            )}
          >
            <Icon className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
            {requiredTier === "vip" ? "VIP" : "Insider"}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>Requires {config.label} subscription</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default PremiumBadge;

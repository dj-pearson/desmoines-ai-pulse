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

const tierConfig: Record<
  SubscriptionTier,
  {
    icon: React.ElementType;
    label: string;
    gradient: string;
    tooltip: string;
  }
> = {
  free: {
    icon: Star,
    label: "Free",
    gradient: "from-slate-400 to-slate-500",
    tooltip: "Free plan",
  },
  insider: {
    icon: Sparkles,
    label: "Insider",
    gradient: "from-amber-400 to-orange-500",
    tooltip: "Insider member - Unlock premium features",
  },
  vip: {
    icon: Crown,
    label: "VIP",
    gradient: "from-purple-500 to-pink-500",
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
              "bg-gradient-to-r text-white border-0 font-medium",
              config.gradient,
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
        "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-gradient-to-r text-white",
        config.gradient
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
              "inline-flex items-center gap-1 rounded-full font-medium bg-gradient-to-r text-white",
              config.gradient,
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

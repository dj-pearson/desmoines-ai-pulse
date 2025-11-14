import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Info, Sparkles, TrendingUp, MapPin, Clock, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RecommendationBadgeProps {
  reason?: string;
  score?: number;
  signals?: {
    interestMatch?: number;
    locationMatch?: number;
    timeMatch?: number;
    popularityBoost?: number;
  };
  className?: string;
  showTooltip?: boolean;
}

export function RecommendationBadge({
  reason,
  score,
  signals,
  className,
  showTooltip = true,
}: RecommendationBadgeProps) {
  if (!reason && !score) return null;

  const getReasonIcon = () => {
    if (!reason) return <Sparkles className="h-3 w-3" />;

    const lowerReason = reason.toLowerCase();
    if (lowerReason.includes('interest') || lowerReason.includes('matches your')) {
      return <Heart className="h-3 w-3" />;
    }
    if (lowerReason.includes('location') || lowerReason.includes('neighborhood')) {
      return <MapPin className="h-3 w-3" />;
    }
    if (lowerReason.includes('time') || lowerReason.includes('soon')) {
      return <Clock className="h-3 w-3" />;
    }
    if (lowerReason.includes('trending') || lowerReason.includes('popular')) {
      return <TrendingUp className="h-3 w-3" />;
    }
    return <Sparkles className="h-3 w-3" />;
  };

  const badge = (
    <Badge
      variant="secondary"
      className={cn(
        'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 transition-colors cursor-help',
        className
      )}
    >
      {getReasonIcon()}
      <span className="ml-1 text-xs">{reason || 'Recommended'}</span>
      {score !== undefined && (
        <span className="ml-1 text-xs font-bold">
          {Math.round(score)}%
        </span>
      )}
    </Badge>
  );

  if (!showTooltip || !signals) {
    return badge;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="space-y-2">
            <div className="font-semibold text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Why we recommend this
            </div>
            <div className="space-y-1 text-xs">
              {signals.interestMatch && signals.interestMatch > 0 && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Heart className="h-3 w-3" />
                    Interest match
                  </span>
                  <span className="font-medium">+{signals.interestMatch}</span>
                </div>
              )}
              {signals.locationMatch && signals.locationMatch > 0 && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    Location match
                  </span>
                  <span className="font-medium">+{signals.locationMatch}</span>
                </div>
              )}
              {signals.timeMatch && signals.timeMatch > 0 && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Time preference
                  </span>
                  <span className="font-medium">+{signals.timeMatch}</span>
                </div>
              )}
              {signals.popularityBoost && signals.popularityBoost > 0 && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    Popularity
                  </span>
                  <span className="font-medium">+{signals.popularityBoost}</span>
                </div>
              )}
            </div>
            {score !== undefined && (
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between font-semibold">
                  <span>Total Score</span>
                  <span className="text-primary">{Math.round(score)}</span>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground pt-1">
              {reason || 'Based on your preferences and activity'}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Compact version for smaller spaces
 */
export function RecommendationDot({
  reason,
  className,
}: {
  reason?: string;
  className?: string;
}) {
  if (!reason) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'h-2 w-2 rounded-full bg-primary animate-pulse cursor-help',
              className
            )}
          />
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex items-center gap-2">
            <Sparkles className="h-3 w-3" />
            <span className="text-xs">{reason}</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

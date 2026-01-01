import { Badge } from "@/components/ui/badge";
import { TrendingUp, Eye, Users, Flame, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface SocialProofBadgeProps {
  type: "trending" | "popular" | "selling-fast" | "new" | "last-chance";
  count?: number;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function SocialProofBadge({
  type,
  count,
  className,
  size = "md",
}: SocialProofBadgeProps) {
  const sizeClasses = {
    sm: "text-xs py-0.5 px-2",
    md: "text-sm py-1 px-3",
    lg: "text-base py-1.5 px-4",
  };

  const badges = {
    trending: {
      icon: <Flame className={cn("h-3 w-3 mr-1", size === "lg" && "h-4 w-4")} />,
      text: count ? `${count}+ viewing now` : "Trending Now",
      className: "bg-orange-500/90 text-white border-orange-600 animate-pulse",
    },
    popular: {
      icon: <TrendingUp className={cn("h-3 w-3 mr-1", size === "lg" && "h-4 w-4")} />,
      text: count ? `${count}+ interested` : "Popular",
      className: "bg-blue-500/90 text-white border-blue-600",
    },
    "selling-fast": {
      icon: <Clock className={cn("h-3 w-3 mr-1", size === "lg" && "h-4 w-4")} />,
      text: count ? `Only ${count} tickets left` : "Selling Fast",
      className: "bg-red-500/90 text-white border-red-600 animate-pulse",
    },
    new: {
      icon: <Eye className={cn("h-3 w-3 mr-1", size === "lg" && "h-4 w-4")} />,
      text: "New This Week",
      className: "bg-green-500/90 text-white border-green-600",
    },
    "last-chance": {
      icon: <Clock className={cn("h-3 w-3 mr-1", size === "lg" && "h-4 w-4")} />,
      text: "Last Chance",
      className: "bg-purple-500/90 text-white border-purple-600",
    },
  };

  const badge = badges[type];

  return (
    <Badge
      className={cn(
        "flex items-center gap-1 font-semibold shadow-lg backdrop-blur-sm",
        badge.className,
        sizeClasses[size],
        className
      )}
    >
      {badge.icon}
      <span>{badge.text}</span>
    </Badge>
  );
}

interface ViewCountBadgeProps {
  viewCount: number;
  timeframe?: string;
  className?: string;
}

export function ViewCountBadge({
  viewCount,
  timeframe = "last hour",
  className,
}: ViewCountBadgeProps) {
  if (viewCount < 10) return null; // Only show for significant view counts

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm text-muted-foreground",
        className
      )}
    >
      <Eye className="h-4 w-4" />
      <span>
        {viewCount}+ people viewed this in the {timeframe}
      </span>
    </div>
  );
}

interface AttendeeAvatarsProps {
  attendeeCount: number;
  avatarUrls?: string[];
  className?: string;
}

export function AttendeeAvatars({
  attendeeCount,
  avatarUrls = [],
  className,
}: AttendeeAvatarsProps) {
  const displayAvatars = avatarUrls.slice(0, 5);
  const remainingCount = attendeeCount - displayAvatars.length;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex -space-x-2">
        {displayAvatars.map((url, idx) => (
          <div
            key={idx}
            className="h-8 w-8 rounded-full border-2 border-background bg-muted overflow-hidden"
          >
            <img
              src={url}
              alt={`Event attendee ${idx + 1}`}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        ))}
        {remainingCount > 0 && (
          <div className="h-8 w-8 rounded-full border-2 border-background bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
            +{remainingCount}
          </div>
        )}
      </div>
      <span className="text-sm text-muted-foreground">
        <Users className="h-4 w-4 inline mr-1" />
        {attendeeCount} {attendeeCount === 1 ? "person is" : "people are"}{" "}
        going
      </span>
    </div>
  );
}

interface TrendingIndicatorProps {
  percentageIncrease: number;
  className?: string;
}

export function TrendingIndicator({
  percentageIncrease,
  className,
}: TrendingIndicatorProps) {
  if (percentageIncrease < 50) return null; // Only show significant trends

  return (
    <Badge
      variant="secondary"
      className={cn(
        "bg-gradient-to-r from-orange-500 to-red-500 text-white border-0",
        className
      )}
    >
      <Flame className="h-3 w-3 mr-1 animate-pulse" />
      <TrendingUp className="h-3 w-3 mr-1" />
      +{percentageIncrease}% views today
    </Badge>
  );
}

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sun, Navigation } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

interface QuickActionProps {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  href?: string;
  onClick?: () => void;
  variant?: "default" | "primary" | "secondary";
  className?: string;
}

function QuickAction({
  icon,
  label,
  sublabel,
  href,
  onClick,
  variant = "default",
  className,
}: QuickActionProps) {
  const variantStyles = {
    default:
      "bg-white/10 hover:bg-white/20 text-white border-white/20 hover:border-white/30",
    // WEB-UX-030: the leading bg-[#FFC107] is a solid fallback UNDER the
    // gradient. #2D1B69 on this gold measures 10.17:1 at the gradient's start
    // and 7.22:1 at its end, but a gradient sets background-IMAGE and leaves
    // background-color transparent, so axe resolves the text against the
    // nearest solid ancestor instead — the page. In the dark theme that is
    // near-black, and the button was reported as a 4.5:1 failure it does not
    // actually have. The solid base makes the computed colour honest, and
    // doubles as a fallback if the gradient never paints.
    primary:
      "bg-[#FFC107] bg-gradient-to-r from-[#FFD700] to-[#FFA500] hover:from-[#FFA500] hover:to-[#FFD700] text-[#2D1B69] border-0 shadow-lg hover:shadow-xl",
    secondary:
      "bg-white/5 hover:bg-white/15 text-white/90 border-white/10 hover:border-white/20",
  };

  const content = (
    <div className="flex flex-col items-center justify-center gap-2 p-4 h-full min-h-[120px]">
      <div className="text-2xl">{icon}</div>
      <div className="text-center">
        <div className="font-semibold text-sm">{label}</div>
        {sublabel && (
          <div className="text-xs opacity-80 mt-1">{sublabel}</div>
        )}
      </div>
    </div>
  );

  const classes = cn(
    "relative overflow-hidden transition-all duration-300 hover:scale-105 active:scale-95 touch-target",
    variantStyles[variant],
    className
  );

  if (href) {
    return (
      <Link to={href}>
        <Card className={classes}>{content}</Card>
      </Link>
    );
  }

  return (
    <Card
      className={cn(classes, "cursor-pointer")}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onClick?.();
        }
      }}
    >
      {content}
    </Card>
  );
}

interface QuickActionsProps {
  className?: string;
  onAIPlanClick?: () => void;
}

export function QuickActions({ className, onAIPlanClick }: QuickActionsProps) {
  return (
    <div className={cn("w-full", className)}>
      {/* Main Headline */}
      <div className="text-center mb-6">
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
          What are you looking for?
        </h2>
        <p className="text-white/80 text-sm md:text-base">
          Quick access to the best of Des Moines
        </p>
      </div>

      {/* AI Plan My Night — featured, routes to the working /trip-planner */}
      <div className="max-w-4xl mx-auto mb-3 md:mb-4">
        <QuickAction
          icon={<SpriteIcon name="sparkles" className="h-6 w-6" aria-hidden="true" />}
          label="AI Plan My Night"
          // "Let AI build your itinerary" promised something a logged-out
          // visitor cannot have: /trip-planner wraps the planner in
          // <PremiumGate requiredTier="insider">, so the click ended on a
          // paywall with no warning (WEB-QA-005 AC2).
          //
          // This states what is true TODAY and does not settle AC1. If the
          // owner picks the limited-free-itinerary funnel instead, this string
          // and its mobile twin below are the two places to change.
          sublabel="Itinerary planning, included with Insider"
          variant="primary"
          onClick={onAIPlanClick}
          className="min-h-[88px]"
        />
      </div>

      {/* Consolidated "right now" action row — every item is a real link */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 max-w-4xl mx-auto">
        <QuickAction
          icon={<SpriteIcon name="calendar" className="h-6 w-6" aria-hidden="true" />}
          label="Today"
          sublabel="Happening today"
          href="/events/today"
          variant="default"
        />
        <QuickAction
          icon={<Sun className="h-6 w-6" aria-hidden="true" />}
          label="This Weekend"
          sublabel="Fri–Sun events"
          href="/events/this-weekend"
          variant="default"
        />
        <QuickAction
          icon={<Navigation className="h-6 w-6" aria-hidden="true" />}
          label="Near Me"
          sublabel="Events nearby"
          href="/events/near-me"
          variant="default"
        />
        <QuickAction
          icon={<SpriteIcon name="clock" className="h-6 w-6" aria-hidden="true" />}
          label="Open Now"
          sublabel="Dining open now"
          href="/restaurants/open-now"
          variant="default"
        />
      </div>

      {/* Secondary CTA */}
      <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
        <Link to="/events">
          <Button
            size="lg"
            variant="outline"
            className="bg-white/10 hover:bg-white/20 text-white border-white/30 hover:border-white/40"
          >
            Browse All Events
          </Button>
        </Link>
      </div>
    </div>
  );
}

// Simplified mobile version
export function QuickActionsMobile({
  className,
  onAIPlanClick,
}: QuickActionsProps) {
  return (
    <div className={cn("w-full space-y-3", className)}>
      {/* AI Plan My Night — primary, routes to the working /trip-planner */}
      <Button
        size="lg"
        onClick={onAIPlanClick}
        className="h-16 w-full bg-[#FFC107] bg-gradient-to-r from-[#FFD700] to-[#FFA500] hover:from-[#FFA500] hover:to-[#FFD700] text-[#2D1B69] font-bold shadow-lg gap-2"
        aria-label="AI Plan My Night - itinerary planning, included with Insider"
      >
        <SpriteIcon name="sparkles" className="h-5 w-5" aria-hidden="true" />
        <span className="text-sm">AI Plan My Night</span>
        {/* The requirement rides on the button itself here: the mobile layout
            has no sublabel slot, and sending someone to a paywall from an
            unqualified gold CTA is the gap WEB-QA-005 AC2 names. */}
        <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full bg-[#2D1B69]/15 px-2 py-0.5">
          Insider
        </span>
      </Button>

      {/* Consolidated "right now" row */}
      <div className="grid grid-cols-2 gap-2">
        <Link to="/events/today">
          <Button size="sm" variant="ghost" className="h-16 w-full flex-col gap-1 text-white hover:bg-white/10" aria-label="View today's events">
            <SpriteIcon name="calendar" className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs">Today</span>
          </Button>
        </Link>
        <Link to="/events/this-weekend">
          <Button size="sm" variant="ghost" className="h-16 w-full flex-col gap-1 text-white hover:bg-white/10" aria-label="View weekend events">
            <Sun className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs">This Weekend</span>
          </Button>
        </Link>
        <Link to="/events/near-me">
          <Button size="sm" variant="ghost" className="h-16 w-full flex-col gap-1 text-white hover:bg-white/10" aria-label="Find events near me">
            <Navigation className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs">Near Me</span>
          </Button>
        </Link>
        <Link to="/restaurants/open-now">
          <Button size="sm" variant="ghost" className="h-16 w-full flex-col gap-1 text-white hover:bg-white/10" aria-label="Restaurants open now">
            <SpriteIcon name="clock" className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs">Open Now</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}

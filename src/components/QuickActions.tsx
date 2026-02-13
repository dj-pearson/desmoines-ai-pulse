import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Calendar,
  Utensils,
  Sparkles,
  Sun,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

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
    primary:
      "bg-gradient-to-r from-[#FFD700] to-[#FFA500] hover:from-[#FFA500] hover:to-[#FFD700] text-[#2D1B69] border-0 shadow-lg hover:shadow-xl",
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

      {/* Quick Action Grid - Focused on 4 key actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 max-w-4xl mx-auto">
        {/* AI Plan My Night - Featured */}
        <QuickAction
          icon={<Sparkles className="h-6 w-6" aria-hidden="true" />}
          label="AI Plan My Night"
          sublabel="Let AI decide"
          variant="primary"
          onClick={onAIPlanClick}
        />

        {/* Events Today */}
        <QuickAction
          icon={<Calendar className="h-6 w-6" aria-hidden="true" />}
          label="Events Today"
          sublabel="Happening now"
          href="/events/today"
          variant="default"
        />

        {/* This Weekend */}
        <QuickAction
          icon={<Sun className="h-6 w-6" aria-hidden="true" />}
          label="This Weekend"
          sublabel="Fri-Sun events"
          href="/events/this-weekend"
          variant="default"
        />

        {/* Restaurants */}
        <QuickAction
          icon={<Utensils className="h-6 w-6" aria-hidden="true" />}
          label="Restaurants"
          sublabel="Dining & drinks"
          href="/restaurants"
          variant="default"
        />
      </div>

      {/* Secondary CTA */}
      <div className="text-center mt-6">
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
      {/* Primary Actions - Large buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          size="lg"
          onClick={onAIPlanClick}
          className="h-20 bg-gradient-to-r from-[#FFD700] to-[#FFA500] hover:from-[#FFA500] hover:to-[#FFD700] text-[#2D1B69] font-bold shadow-lg"
          aria-label="AI Plan My Night - Let AI decide your plans"
        >
          <div className="flex flex-col items-center gap-1">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
            <span className="text-sm">AI Plan My Night</span>
          </div>
        </Button>

        <Link to="/events/today">
          <Button
            size="lg"
            variant="outline"
            className="h-20 w-full bg-white/10 hover:bg-white/20 text-white border-white/30"
            aria-label="View today's events"
          >
            <div className="flex flex-col items-center gap-1">
              <Calendar className="h-5 w-5" aria-hidden="true" />
              <span className="text-sm">Events Today</span>
            </div>
          </Button>
        </Link>
      </div>

      {/* Secondary Actions - Compact */}
      <div className="grid grid-cols-2 gap-2">
        <Link to="/events/this-weekend">
          <Button
            size="sm"
            variant="ghost"
            className="h-16 w-full flex-col gap-1 text-white hover:bg-white/10"
            aria-label="View weekend events"
          >
            <Sun className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs">This Weekend</span>
          </Button>
        </Link>

        <Link to="/restaurants">
          <Button
            size="sm"
            variant="ghost"
            className="h-16 w-full flex-col gap-1 text-white hover:bg-white/10"
            aria-label="Browse restaurants"
          >
            <Utensils className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs">Restaurants</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}

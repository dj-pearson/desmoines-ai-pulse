import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Heart, Map as MapIcon, type LucideIcon } from "lucide-react";
import { PaywallModal } from "@/components/PaywallModal";
import { trackAdFillClick } from "@/lib/tracking";

type HousePlacement = 'top_banner' | 'featured_spot' | 'below_fold' | 'sidebar';

interface HouseAdProps {
  placement: HousePlacement;
  className?: string;
}

interface HouseMessage {
  icon: LucideIcon;
  headline: string;
  body: string;
  cta: string;
  /** Paywall context id — resolves tailored upgrade copy. */
  context: string;
}

/**
 * House-ad inventory: when no paid campaign or affiliate creative is available
 * for a slot, we sell our own subscription instead of rendering nothing. Three
 * rotating messages, each opening the contextual paywall at the matching seam.
 */
const HOUSE_MESSAGES: HouseMessage[] = [
  {
    icon: Sparkles,
    headline: "Browse ad-free",
    body: "Go Insider to remove ads and support local Des Moines coverage.",
    cta: "Go Insider",
    context: "ad_free",
  },
  {
    icon: Heart,
    headline: "Save everything you love",
    body: "Unlimited favorites, synced across all your devices.",
    cta: "Upgrade",
    context: "unlimited_favorites",
  },
  {
    icon: MapIcon,
    headline: "Plan the perfect day with AI",
    body: "Let the AI Trip Planner build your Des Moines itinerary in seconds.",
    cta: "Try Insider",
    context: "trip_planner",
  },
];

function getHouseSizeClasses(placement: HousePlacement): string {
  switch (placement) {
    case 'top_banner':
    case 'below_fold':
      return "h-20 md:h-28";
    case 'featured_spot':
      return "min-h-[220px] md:min-h-[250px]";
    case 'sidebar':
      return "w-[160px] min-h-[600px]";
    default:
      return "h-24 md:h-28";
  }
}

export function HouseAd({ placement, className = "" }: HouseAdProps) {
  const [open, setOpen] = useState(false);
  // Pick (rotate) a message once per mount so successive page loads vary copy
  // without flicker on re-render.
  const [message] = useState(
    () => HOUSE_MESSAGES[Math.floor(Math.random() * HOUSE_MESSAGES.length)]!,
  );
  const Icon = message.icon;

  const handleClick = () => {
    trackAdFillClick('house', placement, { context: message.context });
    setOpen(true);
  };

  return (
    <>
      <Card
        className={`${getHouseSizeClasses(placement)} overflow-hidden relative group bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-transparent ${className}`}
        role="complementary"
        aria-label="Sponsored — upgrade to Des Moines Insider"
      >
        {/* FTC-compliant Ad label */}
        <div className="absolute top-1.5 left-1.5 z-20">
          <span className="text-[10px] font-medium bg-black/60 text-white/90 px-1.5 py-0.5 rounded tracking-wide uppercase">
            Ad
          </span>
        </div>

        <button
          type="button"
          onClick={handleClick}
          className="w-full h-full flex items-center justify-between gap-3 p-3 md:p-4 text-left cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden sm:flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-500">
              <Icon className="h-5 w-5 text-white" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3
                className={`font-semibold text-foreground line-clamp-1 ${placement === 'featured_spot' ? 'text-base md:text-lg' : 'text-sm md:text-base'}`}
              >
                {message.headline}
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground line-clamp-2">
                {message.body}
              </p>
            </div>
          </div>

          <Button
            size="sm"
            asChild
            className="flex-shrink-0 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md text-xs md:text-sm h-8 md:h-9 px-2.5 md:px-3"
          >
            <span>{message.cta}</span>
          </Button>
        </button>
      </Card>

      <PaywallModal open={open} onOpenChange={setOpen} context={message.context} />
    </>
  );
}

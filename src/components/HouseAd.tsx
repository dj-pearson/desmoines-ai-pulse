import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { UpgradeModal } from "@/components/UpgradeModal";
import { createViewabilityObserver } from "@/lib/tracking";
import { logAdImpression, logAdClick } from "@/lib/adAnalytics";

/**
 * House ad — fills an ad slot when no paid campaign or affiliate creative is
 * available, so a slot never renders empty (WEB-FEAT-004). Rotates 3 messages
 * and opens the contextual paywall (ad-free upsell) on click. Tracked under the
 * 'house' inventory class so fill rate is measurable.
 */
const HOUSE_MESSAGES = [
  {
    title: "Go ad-free with Insider",
    body: "Browse Des Moines without interruptions. Plus unlimited favorites & alerts.",
    cta: "See plans",
  },
  {
    title: "Unlock the AI Trip Planner",
    body: "Build the perfect Des Moines day in seconds with Insider.",
    cta: "Upgrade",
  },
  {
    title: "Never miss an event",
    body: "Saved searches & nightly alerts come with Insider.",
    cta: "Get Insider",
  },
] as const;

interface HouseAdProps {
  placement: "top_banner" | "featured_spot" | "below_fold" | "sidebar";
  className?: string;
}

export function HouseAd({ placement, className = "" }: HouseAdProps) {
  const [showUpgrade, setShowUpgrade] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Rotate per mount so repeated views cycle messaging.
  const message = useMemo(
    () => HOUSE_MESSAGES[Math.floor(Math.random() * HOUSE_MESSAGES.length)],
    []
  );

  useEffect(() => {
    if (!ref.current) return;
    const observer = createViewabilityObserver(ref.current, () => {
      logAdImpression("house", placement);
    });
    return () => observer.disconnect();
  }, [placement]);

  const sizeClasses =
    placement === "featured_spot"
      ? "min-h-[220px] md:min-h-[250px]"
      : placement === "sidebar"
      ? "w-[160px] min-h-[600px]"
      : "h-20 md:h-28";

  return (
    <>
      <Card
        ref={ref}
        role="complementary"
        aria-label="Des Moines Insider promotion"
        className={`${sizeClasses} overflow-hidden cursor-pointer relative group bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-transparent hover:shadow-lg transition-shadow ${className}`}
        onClick={() => {
          logAdClick("house", placement);
          setShowUpgrade(true);
        }}
      >
        <div className="absolute top-1.5 left-1.5 z-20">
          <span className="text-[10px] font-medium bg-black/50 text-white/90 px-1.5 py-0.5 rounded tracking-wide uppercase">
            Ad
          </span>
        </div>
        <div className="relative z-10 flex items-center justify-between w-full h-full p-3 md:p-4">
          <div className="flex-1 min-w-0 mr-3">
            <h3 className="font-semibold text-sm md:text-base line-clamp-1 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-amber-500 flex-shrink-0" />
              {message.title}
            </h3>
            <p className="text-xs md:text-sm text-muted-foreground line-clamp-2">
              {message.body}
            </p>
          </div>
          <Button
            size="sm"
            className="flex-shrink-0 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs md:text-sm h-8 md:h-9"
            aria-label={`${message.cta} — ${message.title}`}
          >
            {message.cta}
          </Button>
        </div>
      </Card>
      <UpgradeModal
        open={showUpgrade}
        onOpenChange={setShowUpgrade}
        feature="ad_free"
      />
    </>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UpgradeModal } from "@/components/UpgradeModal";
import { createViewabilityObserver } from "@/lib/tracking";
import { logAdImpression, logAdClick } from "@/lib/adAnalytics";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

/**
 * House ad - fills an ad slot when no paid campaign or affiliate creative is
 * available, so a slot never renders empty (WEB-FEAT-004). Rotates 3 messages
 * and opens the contextual paywall (ad-free upsell) on click. Tracked under the
 * 'house' inventory class so fill rate is measurable.
 *
 * The CTA button carries the click (not the Card), so the target is a real
 * focusable control of at least 44px rather than a div with an onClick.
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
  placement: "top_banner" | "featured_spot" | "below_fold";
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
      : "h-20 md:h-28";

  return (
    <>
      <Card
        ref={ref}
        role="complementary"
        aria-label="Des Moines Insider promotion"
        className={`${sizeClasses} overflow-hidden relative bg-muted/60 ${className}`}
      >
        <div className="absolute top-1.5 left-1.5 z-20">
          <span className="text-[10px] font-medium bg-black/50 text-white/90 px-1.5 py-0.5 rounded tracking-wide uppercase">
            Ad
          </span>
        </div>
        {/* Left padding clears the absolutely-positioned "Ad" badge, the same
            clearance AdBanner got for WEB-QA-006. */}
        <div className="relative z-10 flex items-center justify-between w-full h-full py-3 pr-3 pl-12 md:py-4 md:pr-4 md:pl-14">
          <div className="flex-1 min-w-0 mr-3">
            <h3 className="font-semibold text-sm md:text-base line-clamp-1 flex items-center gap-1.5">
              <SpriteIcon name="sparkles" className="h-4 w-4 text-amber-500 flex-shrink-0" />
              {message.title}
            </h3>
            <p className="text-xs md:text-sm text-muted-foreground line-clamp-2">
              {message.body}
            </p>
          </div>
          <Button
            type="button"
            className="flex-shrink-0 h-11 px-4 text-sm"
            aria-label={`${message.cta} - ${message.title}`}
            onClick={() => {
              logAdClick("house", placement);
              setShowUpgrade(true);
            }}
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

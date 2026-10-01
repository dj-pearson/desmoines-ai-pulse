import { Link } from "react-router-dom";

interface AffiliateDisclosureBannerProps {
  variant?: "inline" | "banner";
}

/**
 * The disclosure above hotel lists and pages (plan-stay-pass2 WP2 items 4-5).
 *
 * It was a bordered paragraph of three sentences, one of which ("This does
 * not influence our recommendations") sat over a Featured strip nobody
 * explained. On a 390px phone it pushed every hotel card below the fold. It is
 * one line now, and the link says what the reader actually wants to know:
 * how Featured is chosen. Each booking link still carries its own
 * AFFILIATE_DISCLOSURE next to it.
 */
export default function AffiliateDisclosureBanner({ variant = "banner" }: AffiliateDisclosureBannerProps) {
  if (variant === "inline") {
    return (
      <p className="text-xs text-muted-foreground">
        Some links on this page are affiliate links. We may earn a commission if you book through
        these links, at no extra cost to you.{" "}
        <Link to="/affiliate-disclosure" className="underline hover:text-foreground">
          Learn more
        </Link>
      </p>
    );
  }

  return (
    <p className="text-xs text-muted-foreground">
      Some booking links earn us a commission, at no cost to you.{" "}
      <Link
        to="/affiliate-disclosure#featured"
        className="inline-flex min-h-6 items-center underline underline-offset-2 hover:text-foreground"
      >
        How we choose Featured
      </Link>
    </p>
  );
}

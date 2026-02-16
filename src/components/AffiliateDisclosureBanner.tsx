import { Link } from "react-router-dom";
import { Info } from "lucide-react";

interface AffiliateDisclosureBannerProps {
  variant?: "inline" | "banner";
}

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
    <div className="bg-muted/50 border border-border rounded-lg px-4 py-3 flex items-start gap-3 text-sm">
      <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      <p className="text-muted-foreground">
        <strong className="text-foreground">Affiliate Disclosure:</strong>{" "}
        Some links on this page are affiliate links, meaning we may earn a commission
        if you make a booking at no additional cost to you. This does not influence
        our recommendations.{" "}
        <Link to="/affiliate-disclosure" className="text-primary hover:underline">
          Learn more
        </Link>
      </p>
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import {
  useBusinessClaim,
  useClaimListing,
  type ListingType,
} from "@/hooks/useBusinessClaim";
import { toast } from "sonner";
import { BadgeCheck, Building2, Clock } from "lucide-react";

interface ClaimListingCtaProps {
  listingType: ListingType;
  listingId: string;
  listingName: string;
}

/**
 * "Own this business?" (WEB-ADS-009 AC3/AC4).
 *
 * Four states, and the one that matters is PENDING. Verification is an email
 * domain match against the listing's own website, so a gmail address - which is
 * most small businesses - lands in the admin queue. Telling that owner their
 * claim is "verified" would be the same class of claim as the approval email
 * that said an event was live when nothing published it.
 *
 * Signed-out visitors see the CTA and are sent to /auth. Hiding it would mean
 * the one person most likely to click it never learns the feature exists.
 */
export function ClaimListingCta({ listingType, listingId, listingName }: ClaimListingCtaProps) {
  const { isAuthenticated } = useAuth();
  const { data: claim } = useBusinessClaim(listingType, listingId);
  const claimListing = useClaimListing();
  const [busy, setBusy] = useState(false);

  if (claim?.status === "verified") {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <BadgeCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          <p className="text-sm">
            You manage this listing. Edits to your description, website, phone and photo go live
            without review.
          </p>
          {/* AC4's second half: the listing is already chosen. */}
          <Button size="sm" variant="outline" asChild>
            <Link to={`/advertise?listing_type=${listingType}&listing_id=${listingId}`}>
              Promote this listing
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (claim?.status === "pending") {
    return (
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="flex items-center gap-3 py-4">
          <Clock className="h-5 w-5 text-amber-600" aria-hidden="true" />
          <p className="text-sm">
            Your claim on {listingName} is with our team. We could not match your email to the
            website on this listing, so a person is checking it.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-3">
          <Building2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm">
            <span className="font-medium">Own this business?</span> Claim {listingName} to keep its
            details right.
          </p>
        </div>
        {isAuthenticated ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const status = await claimListing.mutateAsync({ listingType, listingId });
                toast.success(
                  status === "verified"
                    ? "Verified from your email domain. You manage this listing now."
                    : "Claim submitted. We will check it and get back to you.",
                );
              } catch (err) {
                // The function refuses an already-claimed listing by name, and
                // that message is the useful one to show.
                toast.error(err instanceof Error ? err.message : "That did not work.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Claim this listing
          </Button>
        ) : (
          <Button size="sm" variant="outline" asChild>
            <Link to="/auth">Sign in to claim</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

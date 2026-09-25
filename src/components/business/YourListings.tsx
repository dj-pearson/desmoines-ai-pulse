import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { ClaimedListingEditForm } from "@/components/business/ClaimedListingEditForm";
import {
  useListingSearch,
  useMyBusinessClaims,
  type MyBusinessClaim,
} from "@/hooks/useMyBusinessClaims";
import { useDebounce } from "@/hooks/useDebounce";
import { BUSINESS_CONTACT_EMAIL, BUSINESS_CONTACT_HREF } from "@/lib/businessCopy";

const TYPE_LABEL: Record<MyBusinessClaim["listing_type"], string> = {
  restaurant: "Restaurant",
  attraction: "Attraction",
  venue: "Venue",
};

function claimStatusText(claim: MyBusinessClaim, name: string): string {
  if (claim.status === "verified") {
    return claim.method === "admin" ? "Verified by our team" : "Verified from your email domain";
  }
  if (claim.status === "pending") {
    // ClaimListingCta's wording, so the listing page and the hub agree.
    return `Your claim on ${name} is with our team. We could not match your email to the website on this listing, so a person is checking it.`;
  }
  return "This claim wasn't approved.";
}

function ClaimRow({ claim }: { claim: MyBusinessClaim }) {
  const [editing, setEditing] = useState(false);
  const name = claim.listing?.name ?? "A listing we can't load right now";
  const verified = claim.status === "verified";
  const editId = useId();

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="text-base font-semibold">
            {claim.listing?.href ? (
              <Link to={claim.listing.href} className="underline-offset-4 hover:underline">
                {name}
              </Link>
            ) : (
              name
            )}
          </h3>
          <p className="text-sm text-muted-foreground">
            {TYPE_LABEL[claim.listing_type]}
            <span aria-hidden="true"> - </span>
            <span className={verified ? "font-medium text-foreground" : undefined}>
              {claimStatusText(claim, name)}
            </span>
          </p>
          {claim.status === "rejected" && (
            <p className="text-sm text-muted-foreground">
              If you think that's wrong, email{" "}
              <a href={BUSINESS_CONTACT_HREF} className="font-medium text-primary underline-offset-4 hover:underline">
                {BUSINESS_CONTACT_EMAIL}
              </a>
              .
            </p>
          )}
        </div>

        {verified && (
          <div className="flex flex-wrap gap-2">
            {claim.listing && (
              <Button
                variant="outline"
                className="min-h-11"
                aria-expanded={editing}
                aria-controls={editId}
                onClick={() => setEditing((v) => !v)}
              >
                {editing ? "Close editor" : "Edit details"}
              </Button>
            )}
            <Button asChild className="min-h-11">
              <Link
                to={`/advertise?listingType=${claim.listing_type}&listingId=${encodeURIComponent(claim.listing_id)}`}
              >
                Promote this listing
              </Link>
            </Button>
          </div>
        )}
      </div>

      {verified && editing && claim.listing && (
        <div id={editId} className="mt-4 max-w-2xl">
          <ClaimedListingEditForm
            listingType={claim.listing_type}
            listingId={claim.listing_id}
            listingName={name}
            initialValues={claim.listing.values}
          />
        </div>
      )}
    </li>
  );
}

function ListingSearch() {
  const [term, setTerm] = useState("");
  const debounced = useDebounce(term, 300);
  const search = useListingSearch(debounced);
  const inputId = useId();
  const resultsId = useId();
  const active = debounced.trim().length >= 2;

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>Find your restaurant or attraction</Label>
      <Input
        id={inputId}
        type="search"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Business name"
        className="min-h-11 max-w-md"
        aria-describedby={resultsId}
        autoComplete="off"
      />
      <div id={resultsId} aria-live="polite" className="text-sm">
        {active && search.isLoading && <p className="text-muted-foreground">Searching...</p>}
        {active && search.isError && (
          <p className="text-destructive">Search isn't working right now. Try again in a moment.</p>
        )}
        {active && search.data && search.data.length === 0 && (
          <p className="text-muted-foreground">
            Nothing by that name yet. Email{" "}
            <a href={BUSINESS_CONTACT_HREF} className="font-medium text-primary underline-offset-4 hover:underline">
              {BUSINESS_CONTACT_EMAIL}
            </a>{" "}
            and we'll add it.
          </p>
        )}
        {active && search.data && search.data.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {search.data.map((result) => (
              <li key={`${result.type}:${result.id}`}>
                <Link
                  to={result.href}
                  className="flex min-h-11 items-center justify-between gap-3 px-3 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="font-medium">{result.name}</span>
                  <span className="text-muted-foreground">{TYPE_LABEL[result.type]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Open your listing and press "Claim this listing". If your email matches the listing's website, it's
        verified straight away; otherwise a person checks it.
      </p>
    </div>
  );
}

/**
 * Your listings: the claims you hold, their status, editing for verified ones
 * and a way to find a listing to claim (business plan WP3 item 3).
 */
export function YourListings() {
  const claims = useMyBusinessClaims();

  return (
    <section aria-labelledby="your-listings-heading" className="space-y-4">
      <div>
        <h2 id="your-listings-heading" className="text-xl font-semibold">
          Your listings
        </h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Claim your restaurant or attraction to fix its description, website, phone, photo and menu link yourself.
        </p>
      </div>

      {claims.isLoading ? (
        <div className="space-y-3" role="status" aria-label="Loading your listings">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : claims.isError ? (
        <ErrorState
          compact
          error={claims.error}
          title="Your listings didn't load"
          description="This is on our side. Try again in a moment."
          onRetry={() => claims.refetch()}
        />
      ) : claims.data && claims.data.length > 0 ? (
        <ul className="divide-y">
          {claims.data.map((claim) => (
            <ClaimRow key={claim.id} claim={claim} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">You haven't claimed a listing yet.</p>
      )}

      <ListingSearch />
    </section>
  );
}

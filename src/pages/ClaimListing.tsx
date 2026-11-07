import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import SEOHead from "@/components/SEOHead";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { ClaimListingCta } from "@/components/business/ClaimListingCta";
import { supabase } from "@/integrations/supabase/client";
import { isRpcMissing } from "@/hooks/useMyBusinessClaims";
import { getCanonicalUrl } from "@/lib/brandConfig";
import {
  claimPagePath,
  isClaimableType,
  isListingId,
  listingPath,
  parseClaimTeaser,
  teaserHeadline,
  type ClaimableType,
  type ClaimTeaser,
} from "@/lib/claimOutreach";

/** What an owner gets for claiming. Each item is something /business does today. */
const BENEFITS = [
  {
    title: "Fix your details",
    body: "Hours, phone, website and description, changed from your own account instead of an email to us.",
  },
  {
    title: "See who's looking",
    body: "Page views, contact clicks and shares for the last 7, 30 or 90 days, and how you compare with similar places nearby.",
  },
  {
    title: "Promote when you want to",
    body: "Put the listing in front of more people with a paid placement. Claiming is free, and nothing is charged unless you start a campaign.",
  },
];

function useClaimTeaser(type: ClaimableType | null, id: string | null) {
  return useQuery({
    queryKey: ["listing-claim-teaser", type, id],
    enabled: !!type && !!id,
    queryFn: async (): Promise<ClaimTeaser | null | "unavailable"> => {
      const { data, error } = await supabase.rpc("get_listing_claim_teaser", {
        p_listing_type: type!,
        p_listing_id: id!,
      });
      if (error) {
        if (isRpcMissing(error)) return "unavailable";
        throw error;
      }
      return parseClaimTeaser(data);
    },
  });
}

/**
 * /business/claim/:type/:id (growth roadmap #2): the page an owner lands on
 * from an outreach email. It names the listing, quotes the one number the
 * server will give out about an unclaimed listing (30-day views, floored to
 * tens), lists what claiming gets them, and hands off to ClaimListingCta,
 * which already handles signed-out visitors, email-domain verification and the
 * pending state.
 *
 * noindex: it is a sales page for one business, and a search result for
 * "<restaurant> claim" helps nobody.
 */
export default function ClaimListing() {
  const params = useParams<{ type: string; id: string }>();
  const type = isClaimableType(params.type) ? params.type : null;
  const id = isListingId(params.id) ? params.id.toLowerCase() : null;
  const { data, isLoading, error, refetch } = useClaimTeaser(type, id);
  const path = type && id ? claimPagePath(type, id) : "/business";

  const head = (
    <SEOHead
      title={data && data !== "unavailable" ? `Claim ${data.name}` : "Claim your listing"}
      description="Claim your free Des Moines Insider listing to fix your details and see how many people view your page."
      canonicalUrl={getCanonicalUrl(path)}
      url={path}
      robots="noindex, follow"
    />
  );

  let body: JSX.Element;
  if (!type || !id) {
    body = <NotFoundBody />;
  } else if (isLoading) {
    body = (
      <div role="status" aria-label="Loading" className="space-y-3">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-5 w-1/2" />
      </div>
    );
  } else if (error) {
    body = (
      <ErrorState
        error={error}
        title="This page didn't load"
        description="This is on our side. Try again in a moment."
        onRetry={() => void refetch()}
      />
    );
  } else if (data === "unavailable") {
    body = (
      <p className="text-muted-foreground">
        Claim pages open soon. Until then, find your listing from the{" "}
        <Link to="/business" className="font-medium text-primary underline-offset-4 hover:underline">
          business workspace
        </Link>
        .
      </p>
    );
  } else if (!data || data.closed) {
    body = <NotFoundBody />;
  } else if (data.claimed) {
    body = (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">{data.name} is already managed</h1>
        <p className="max-w-prose text-muted-foreground">
          Someone from {data.name} has verified this listing. If that should be you, sign in to the business workspace
          with that account, or contact us and we'll sort it out.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="min-h-11">
            <Link to="/business">Business workspace</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link to={listingPath(type, id, data.name)}>View the listing</Link>
          </Button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="space-y-8">
        <div className="space-y-3">
          <h1 className="text-balance text-3xl font-bold tracking-tight md:text-4xl">{teaserHeadline(data)}</h1>
          <p className="max-w-prose text-lg text-muted-foreground">
            Claim the listing to keep it right and see those numbers every week. It's free.
          </p>
        </div>

        <ClaimListingCta listingType={type} listingId={id} listingName={data.name} />

        <ul className="grid gap-6 md:grid-cols-3">
          {BENEFITS.map((b) => (
            <li key={b.title}>
              <h2 className="text-base font-semibold">{b.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{b.body}</p>
            </li>
          ))}
        </ul>

        <p className="text-sm text-muted-foreground">
          <Link to={listingPath(type, id, data.name)} className="font-medium text-primary underline-offset-4 hover:underline">
            See {data.name}'s page
          </Link>
          {data.viewsFloor ? (
            <> - view counts include only visitors who allowed analytics cookies, so the real number is higher.</>
          ) : null}
        </p>
      </div>
    );
  }

  return (
    <BusinessLayout>
      {head}
      <div className="container mx-auto max-w-4xl px-4 py-8 md:py-12">
        <Breadcrumbs
          className="mb-6"
          items={[
            { label: "Home", href: "/" },
            { label: "For businesses", href: "/business" },
            { label: "Claim a listing" },
          ]}
        />
        {body}
      </div>
    </BusinessLayout>
  );
}

function NotFoundBody() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">We couldn't find that listing</h1>
      <p className="max-w-prose text-muted-foreground">
        The link may be out of date, or the place may have closed. You can search for your business from the
        workspace.
      </p>
      <Button asChild className="min-h-11">
        <Link to="/business">Find your listing</Link>
      </Button>
    </div>
  );
}

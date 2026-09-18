import { useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import NeighborhoodGuide from "@/components/NeighborhoodGuide";
import LocalSEO from "@/components/LocalSEO";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ArrowLeft } from "lucide-react";
import { findNeighborhood, NEIGHBORHOOD_MIN_ITEMS } from "@/lib/neighborhoods";
import { useNeighborhoodContent } from "@/hooks/useNeighborhoodContent";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";

/**
 * A neighborhood guide (WEB-SEO-036).
 *
 * WHAT THIS PAGE USED TO BE. A `// Mock data - replace with actual API calls`
 * comment, a `const events: EventItem[] = []` in component scope, a useEffect
 * that filtered that empty array and set restaurants and attractions to [] -
 * and, under it all, a LocalSEO block promising "the best events, restaurants,
 * and attractions in <name>". Four of these were prerendered and sitemapped.
 *
 * Two further faults worth naming because they are easy to reintroduce: the
 * `events` const was a NEW ARRAY ON EVERY RENDER and was listed in the
 * useEffect dependency array, so the effect re-ran forever; and a hand-rolled
 * fetch would have been invisible to PrerenderSignal, which publishes
 * "data settled" from useIsFetching - a count of TanStack queries only. Both
 * go away with useQuery.
 */
export default function NeighborhoodPage() {
  const { neighborhood: slug } = useParams<{ neighborhood: string }>();
  const neighborhood = findNeighborhood(slug);

  useDocumentTitle(neighborhood ? `${neighborhood.name} Guide` : "Neighborhoods");

  const { data, isLoading, error, refetch } = useNeighborhoodContent(neighborhood);

  // A slug that is not in the inventory. Answered rather than 404'd, because
  // these URLs were sitemapped for months and a crawler that still holds one
  // should get a page that sends it somewhere useful - noindex, follow, with
  // the hub one click away.
  if (!neighborhood) {
    return (
      <div className="min-h-screen bg-background">
        <Helmet>
          <title>Neighborhood Not Found | Des Moines</title>
          <meta name="robots" content="noindex, follow" />
          <meta name="googlebot" content="noindex, follow" />
        </Helmet>
        <Header />
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-semibold mb-3">We don't have a guide for that neighborhood</h1>
          <p className="text-muted-foreground mb-6">
            Eight Des Moines metro neighborhoods have guides. Pick one from the list.
          </p>
          <Link to="/neighborhoods">
            <Button>All neighborhoods</Button>
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const total = data?.total ?? 0;
  // Thin-content gate. Until the fetch settles, `total` is 0, so the page would
  // noindex itself mid-load and the prerenderer could capture that - hence the
  // `!isLoading`. It also stays indexable on a FAILED fetch: an outage is not
  // evidence that a page is thin, and WEB-SEO-040 records noindex-on-error as
  // its own defect.
  const isThin = !isLoading && !error && total < NEIGHBORHOOD_MIN_ITEMS;

  return (
    <div className="min-h-screen bg-background">
      <LocalSEO
        pageTitle={`${neighborhood.name} Events, Restaurants & Attractions`}
        pageDescription={neighborhood.description}
        neighborhood={neighborhood.name}
        canonicalPath={`/neighborhoods/${neighborhood.slug}`}
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Neighborhoods", url: "/neighborhoods" },
          { name: neighborhood.name, url: `/neighborhoods/${neighborhood.slug}` }
        ]}
      />
      {isThin && (
        <Helmet>
          <meta name="robots" content="noindex, follow" />
          <meta name="googlebot" content="noindex, follow" />
        </Helmet>
      )}

      <Header />

      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: "Neighborhoods", href: "/neighborhoods" },
            { label: neighborhood.name },
          ]}
        />

        <div className="mb-6">
          <Link to="/neighborhoods">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              All Neighborhoods
            </Button>
          </Link>
        </div>

        {error ? (
          <ErrorState
            error={error}
            title={`We couldn't load ${neighborhood.name} right now`}
            onRetry={() => void refetch()}
          />
        ) : isLoading ? (
          <SkeletonGroup
            label={`Loading ${neighborhood.name} events, restaurants and attractions...`}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-lg" />
            ))}
          </SkeletonGroup>
        ) : (
          <NeighborhoodGuide
            neighborhood={neighborhood}
            events={data?.events ?? []}
            restaurants={data?.restaurants ?? []}
            attractions={data?.attractions ?? []}
          />
        )}
      </div>

      <Footer />
    </div>
  );
}

import { useParams } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import NeighborhoodGuide from "@/components/NeighborhoodGuide";
import LocalSEO from "@/components/LocalSEO";
import NoIndexMeta from "@/components/schema/NoIndexMeta";
import { RouteCanonical } from "@/components/RouteCanonical";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import {
  useNeighborhoodContent,
  NEIGHBORHOOD_MIN_ITEMS,
} from "@/hooks/useNeighborhoodContent";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

export default function NeighborhoodPage() {
  const { neighborhood } = useParams<{ neighborhood: string }>();

  const neighborhoodName = neighborhood
    ? neighborhood.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
    : "Neighborhood";
  useDocumentTitle(neighborhoodName);

  const { data, isLoading } = useNeighborhoodContent(
    neighborhood ? neighborhoodName : undefined,
  );

  if (!neighborhood) {
    return <NotFoundNeighborhood />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        {/* The canonical cannot wait for the fetch. See RouteCanonical. */}
        <RouteCanonical path={`/neighborhoods/${neighborhood}`} />
        <Header />
        <div
          className="container mx-auto px-4 py-8 space-y-4"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <span className="sr-only">Loading {neighborhoodName}...</span>
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
        <Footer />
      </div>
    );
  }

  const content = data ?? { events: [], restaurants: [], attractions: [], total: 0 };

  /**
   * WEB-SEO-036 thin-content guard.
   *
   * This page used to promise "the best events, restaurants, and attractions"
   * over three empty arrays. Now it either has something to show or it says so
   * and takes itself out of the index - the same inventory gate the pSEO routes
   * use (WEB-SEO-013). Prerendering captures this branch too, so a neighborhood
   * with no rows ships as an honest noindex rather than as a 512-element shell
   * submitted in sitemap-static.xml.
   */
  if (content.total < NEIGHBORHOOD_MIN_ITEMS) {
    return (
      <div className="min-h-screen bg-background">
        <NoIndexMeta />
        <Header />
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold mb-2">
            Nothing listed in {neighborhoodName} yet
          </h1>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            We don&apos;t have enough events, restaurants or attractions tagged to
            this neighborhood to build a guide worth reading. Try the metro-wide
            listings instead.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/neighborhoods">
              <Button variant="outline">All neighborhoods</Button>
            </Link>
            <Link to="/events">
              <Button>Events across Des Moines</Button>
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <LocalSEO 
        pageTitle={`Events & Activities in ${neighborhoodName}`}
        /* WEB-SEO-036: the description names what this page actually holds. It
           used to promise "the best events, restaurants, and attractions" over
           three empty arrays - a claim the page could not keep, on four URLs
           that were prerendered and sitemapped. */
        pageDescription={describeNeighborhood(neighborhoodName, content)}
        neighborhood={neighborhoodName}
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Neighborhoods", url: "/neighborhoods" },
          { name: neighborhoodName, url: `/neighborhoods/${neighborhood}` }
        ]}
      />
      
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: "Neighborhoods", href: "/neighborhoods" },
            { label: neighborhoodName },
          ]}
        />

        {/* Back Navigation */}
        <div className="mb-6">
          <Link to="/neighborhoods">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              All Neighborhoods
            </Button>
          </Link>
        </div>

        {/* Neighborhood Guide Component */}
        <NeighborhoodGuide 
          neighborhood={neighborhoodName}
          events={content.events}
          restaurants={content.restaurants}
          attractions={content.attractions}
        />
      </div>

      <Footer />
    </div>
  );
}

/**
 * A description built from the rows on the page rather than from adjectives.
 * Reads "12 upcoming events, 8 restaurants and 3 attractions in Beaverdale,
 * Des Moines." and omits any surface that returned nothing.
 */
function describeNeighborhood(
  name: string,
  content: { events: unknown[]; restaurants: unknown[]; attractions: unknown[] },
): string {
  const parts: string[] = [];
  if (content.events.length) parts.push(`${content.events.length} upcoming events`);
  if (content.restaurants.length) parts.push(`${content.restaurants.length} restaurants`);
  if (content.attractions.length) parts.push(`${content.attractions.length} attractions`);
  const list =
    parts.length > 1
      ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
      : parts[0];
  return `${list} in ${name}, Des Moines - with dates, addresses and directions for each.`;
}

/** No :neighborhood param at all - the route should not have matched. */
function NotFoundNeighborhood() {
  return (
    <div className="min-h-screen bg-background">
      <NoIndexMeta />
      <Header />
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">Neighborhood not found</h1>
        <Link to="/neighborhoods" className="text-primary hover:underline">
          Browse all neighborhoods
        </Link>
      </div>
      <Footer />
    </div>
  );
}

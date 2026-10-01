import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { formatInTimeZone } from "date-fns-tz";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import RestaurantCard from "@/components/RestaurantCard";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { CardsGridSkeleton } from "@/components/ui/loading-skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { RelatedLinks } from "@/components/seo/InternalLinks";
import { supabase } from "@/integrations/supabase/client";
import { BRAND, getCanonicalUrl } from "@/lib/brandConfig";
import { RESTAURANT_LIST_COLUMNS } from "@/lib/listColumns";
import { STALE_TIME } from "@/lib/queryConfig";
import { toJsonLd } from "@/lib/jsonLd";
import { isPrerender } from "@/lib/isPrerender";
import { storage } from "@/lib/safeStorage";
import { addCentralDays, centralDateOf } from "@/lib/timezone";
import { groupOpenings, openingLabel, RECENT_WINDOW_DAYS, type OpeningRow } from "@/lib/restaurantOpenings";

type Row = OpeningRow & {
  slug?: string | null;
  source_url?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
};

/**
 * When this browser last opened /restaurants/new, as an ISO timestamp. A new
 * key (pass 2, WP2.8); nothing else reads it.
 */
const LAST_VISIT_KEY = "restaurantsNewLastVisit";

function parseInstant(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/**
 * "3 places added since your last visit on Sep 20." Counts rows on this page
 * whose created_at, the day the row joined our listings, is after the last
 * visit. That is what "added" means here, and it is the one place created_at
 * is read: it says nothing about when a restaurant opened.
 */
function SinceLastVisit({ rows }: { rows: readonly Row[] }) {
  const [lastVisit, setLastVisit] = useState<number | null>(null);

  // Read after mount, never in the prerender, so the static HTML carries no
  // per-visitor line.
  useEffect(() => {
    if (isPrerender()) return;
    setLastVisit(parseInstant(storage.getString(LAST_VISIT_KEY)));
  }, []);

  if (lastVisit === null) return null;
  const added = rows.filter((r) => {
    const t = parseInstant(r.created_at);
    return t !== null && t > lastVisit;
  }).length;
  const when = formatInTimeZone(new Date(lastVisit), "America/Chicago", "MMM d");
  return (
    <p className="mb-8 text-base font-medium text-foreground">
      {added === 0
        ? `Nothing added since your last visit on ${when}.`
        : `${added} ${added === 1 ? "place" : "places"} added since your last visit on ${when}.`}
    </p>
  );
}

interface OpeningGridProps {
  rows: readonly Row[];
  now: Date;
  priorityCount?: number;
}

/** Cards with their dated line and, when the row has one, a Source link. */
function OpeningGrid({ rows, now, priorityCount = 0 }: OpeningGridProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {rows.map((r, i) => (
        <RestaurantCard
          key={r.id}
          restaurant={r as never}
          priority={i < priorityCount}
          openingLabel={openingLabel(r, now) ?? undefined}
          sourceUrl={r.source_url}
        />
      ))}
    </div>
  );
}

/**
 * /restaurants/new (SEO-010, SEO-026).
 *
 * "new restaurants des moines 2026" converts at 7.63%, the best rate on the
 * site, and it was landing on a single restaurant's detail page. This is the
 * hub that query should reach: places the restaurants table marks as newly
 * opened or opening soon, each linking to its own page. The page writes
 * nothing about any restaurant; the cards carry what the rows carry.
 */
export default function NewRestaurants() {
  // A Central calendar day, not a UTC one: after 7 PM CDT the UTC date is
  // already tomorrow's.
  const since = addCentralDays(centralDateOf(), -RECENT_WINDOW_DAYS);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["restaurants", "openings-hub", since],
    staleTime: STALE_TIME.CONTENT_LIST,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("restaurants")
        .select(RESTAURANT_LIST_COLUMNS)
        .neq("is_merged", true)
        .or(`status.in.(newly_opened,opening_soon,announced),opening_date.gte.${since}`)
        // Without an order the 120-row cap cut an arbitrary slice. Newest date
        // first keeps the recent openings; undated rows go last.
        .order("opening_date", { ascending: false, nullsFirst: false })
        .limit(120);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const now = new Date();
  const { recent, upcoming, unconfirmed, undatedNew } = groupOpenings(data ?? [], now);
  const year = Number(centralDateOf(now).slice(0, 4));

  // Once the list has loaded, this visit becomes the next one's "last visit".
  // SinceLastVisit mounts in the same commit, and React runs a child's
  // effects before its parent's, so its read sees the previous value.
  useEffect(() => {
    if (!data || isPrerender()) return;
    storage.setString(LAST_VISIT_KEY, new Date().toISOString());
  }, [data]);
  const canonicalUrl = getCanonicalUrl("/restaurants/new");
  const pageTitle = `New Restaurants in Des Moines ${year}: Openings and Coming Soon`;
  const pageDescription =
    "Restaurants that opened in Des Moines and its suburbs in the past year, and the ones announced or opening soon, each with its own page.";

  const itemList = [...recent, ...upcoming].slice(0, 50).map((r, i) => ({
    "@type": "ListItem",
    position: i + 1,
    url: getCanonicalUrl(`/restaurants/${r.slug || r.id}`),
    name: r.name,
  }));

  return (
    <div className="min-h-screen bg-background">
      <EnhancedLocalSEO
        pageTitle={pageTitle}
        pageDescription={pageDescription}
        canonicalUrl={canonicalUrl}
        pageType="website"
        breadcrumbs={[
          { name: "Restaurants", url: "/restaurants" },
          { name: "New Restaurants", url: "/restaurants/new" },
        ]}
        keywords={["new restaurants des moines", `new restaurants des moines ${year}`, "des moines restaurant openings"]}
      />
      {/* Only once the list has landed, so the loading render cannot leave a
          second, empty ItemList behind in the prerender (WEB-SEO-008). */}
      {!isLoading && itemList.length > 0 && (
        <Helmet>
          <script type="application/ld+json">
            {toJsonLd({
              "@context": "https://schema.org",
              "@type": "ItemList",
              name: `New restaurants in ${BRAND.city}`,
              url: canonicalUrl,
              numberOfItems: itemList.length,
              itemListElement: itemList,
            })}
          </script>
        </Helmet>
      )}

      <Header />

      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: "Restaurants", href: "/restaurants" },
            { label: "New Restaurants" },
          ]}
        />
        <h1 className="text-3xl font-bold mb-3">New Restaurants in Des Moines</h1>
        <p className="text-lg text-muted-foreground max-w-prose mb-8">
          Places that opened across Des Moines and its suburbs in the past year, and the ones announced or opening soon.
          Each links to its own page with the address, hours and menu details we have.
        </p>

        {error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <CardsGridSkeleton count={6} variant="restaurant" label="Loading new restaurants..." />
        ) : (
          <>
            <SinceLastVisit rows={[...recent, ...upcoming, ...unconfirmed, ...undatedNew]} />

            <section aria-labelledby="recent-heading" className="mb-12">
              <h2 id="recent-heading" className="text-2xl font-bold mb-4">
                Recently opened ({recent.length})
              </h2>
              {recent.length > 0 ? (
                <OpeningGrid rows={recent} now={now} priorityCount={3} />
              ) : (
                <p className="text-muted-foreground">No openings recorded in the past year.</p>
              )}
            </section>

            <section aria-labelledby="upcoming-heading" className="mb-12">
              <h2 id="upcoming-heading" className="text-2xl font-bold mb-4">
                Opening soon ({upcoming.length})
              </h2>
              {upcoming.length > 0 ? (
                <OpeningGrid rows={upcoming} now={now} />
              ) : (
                <p className="text-muted-foreground">Nothing announced right now.</p>
              )}
            </section>

            {unconfirmed.length > 0 && (
              <section aria-labelledby="unconfirmed-heading" className="mb-12">
                <h2 id="unconfirmed-heading" className="text-2xl font-bold mb-2">
                  Announced, not confirmed ({unconfirmed.length})
                </h2>
                <p className="text-muted-foreground max-w-prose mb-4">
                  The announced date or season has passed and we have no record of an opening yet.
                </p>
                <OpeningGrid rows={unconfirmed} now={now} />
              </section>
            )}

            {undatedNew.length > 0 && (
              <section aria-labelledby="undated-heading" className="mb-12">
                <h2 id="undated-heading" className="text-2xl font-bold mb-2">
                  Marked new, opening date not recorded ({undatedNew.length})
                </h2>
                <p className="text-muted-foreground max-w-prose mb-4">
                  These were flagged as new openings without a date, so we can't say how recent they are.
                </p>
                <OpeningGrid rows={undatedNew} now={now} />
              </section>
            )}
          </>
        )}

        <RelatedLinks
          title="More restaurant guides"
          variant="inline"
          className="mb-8"
          links={[
            { title: "All restaurants", href: "/restaurants" },
            { title: "Open now", href: "/restaurants/open-now" },
            { title: "Dietary options", href: "/restaurants/dietary" },
            { title: "Breweries", href: "/breweries" },
            { title: "Best of Des Moines", href: "/best-of" },
          ]}
        />
      </div>

      <Footer />
    </div>
  );
}

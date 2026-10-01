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
import { NOT_CLOSED_RESTAURANT_FILTER } from "@/lib/restaurantHours";
import { STALE_TIME } from "@/lib/queryConfig";
import { toJsonLd } from "@/lib/jsonLd";
import { isPrerender } from "@/lib/isPrerender";
import { storage } from "@/lib/safeStorage";
import { addCentralDays, centralDateOf } from "@/lib/timezone";
import { openingLabel } from "@/lib/restaurantOpenings";
import {
  NEW_RESTAURANT_WINDOW_DAYS,
  newRestaurantsLead,
  selectNewRestaurants,
  type NewRestaurantRow,
} from "@/lib/newRestaurants";

type Row = NewRestaurantRow & {
  slug?: string | null;
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
 * /restaurants/new (SEO-010, SEO-026, SEO-039).
 *
 * "new restaurants des moines 2026" is our best generic query and it was
 * landing on a single restaurant's detail page. The list follows one stated
 * rule (src/lib/newRestaurants.ts): an opening_date in the last 12 months on a
 * row that is not closed, merged or still upcoming, newest first under month
 * headers. The page writes nothing about any restaurant; the first sentence is
 * computed from the rows, and the cards carry what the rows carry.
 */
export default function NewRestaurants() {
  // A Central calendar day, not a UTC one: after 7 PM CDT the UTC date is
  // already tomorrow's.
  const since = addCentralDays(centralDateOf(), -NEW_RESTAURANT_WINDOW_DAYS);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["restaurants", "openings-hub", since],
    staleTime: STALE_TIME.CONTENT_LIST,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("restaurants")
        .select(`${RESTAURANT_LIST_COLUMNS}, business_status`)
        .neq("is_merged", true)
        // Flagged rows come too, only so the page can say how many were set
        // aside; selectNewRestaurants decides what is listed.
        .or(`status.in.(newly_opened,opening_soon,announced),opening_date.gte.${since}`)
        // SEO-059: a recent opening date does not make a closed place new.
        .or(NOT_CLOSED_RESTAURANT_FILTER)
        .order("opening_date", { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const now = new Date();
  const selection = selectNewRestaurants(data ?? [], now);
  const { opened, months, openingSoon, setAside } = selection;
  const year = Number(centralDateOf(now).slice(0, 4));

  // Once the list has loaded, this visit becomes the next one's "last visit".
  // SinceLastVisit mounts in the same commit, and React runs a child's
  // effects before its parent's, so its read sees the previous value.
  useEffect(() => {
    if (!data || isPrerender()) return;
    storage.setString(LAST_VISIT_KEY, new Date().toISOString());
  }, [data]);
  const canonicalUrl = getCanonicalUrl("/restaurants/new");
  const pageTitle = `New Restaurants in Des Moines (${year})`;
  const pageDescription =
    "Restaurants that opened in Des Moines and its suburbs in the past 12 months, newest first by month, plus dated openings coming up. Each links to its own page.";

  const itemList = [...opened, ...openingSoon].slice(0, 50).map((r, i) => ({
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
              itemListOrder: "https://schema.org/ItemListOrderDescending",
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
        <h1 className="text-3xl font-bold mb-3">New Restaurants in Des Moines ({year})</h1>

        {error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <CardsGridSkeleton count={6} variant="restaurant" label="Loading new restaurants..." />
        ) : (
          <>
            <p className="text-lg text-foreground max-w-prose mb-3">{newRestaurantsLead(selection)}</p>
            <p className="text-muted-foreground max-w-prose mb-8">
              A restaurant is listed here when the opening date on its listing falls in the past 12 months and it
              is not closed or still marked as opening soon. The date we added a place to the site is not used,
              because most listings were added long after the place opened.
              {setAside > 0 &&
                ` ${setAside} more ${setAside === 1 ? "place is" : "places are"} marked new or announced without a confirmed, sourced date, so ${setAside === 1 ? "it is" : "they are"} left off until one is recorded.`}
            </p>

            <SinceLastVisit rows={[...opened, ...openingSoon]} />

            {months.length === 0 ? (
              <p className="mb-12 text-muted-foreground">No openings recorded in the past 12 months.</p>
            ) : (
              months.map((m, i) => (
                <section key={m.key} aria-labelledby={`opened-${m.key}`} className="mb-12">
                  <h2 id={`opened-${m.key}`} className="text-2xl font-bold mb-4">
                    Opened in {m.label} ({m.rows.length})
                  </h2>
                  <OpeningGrid rows={m.rows} now={now} priorityCount={i === 0 ? 3 : 0} />
                </section>
              ))
            )}

            <section aria-labelledby="upcoming-heading" className="mb-12">
              <h2 id="upcoming-heading" className="text-2xl font-bold mb-2">
                Opening soon ({openingSoon.length})
              </h2>
              {openingSoon.length > 0 ? (
                <OpeningGrid rows={openingSoon} now={now} />
              ) : (
                <p className="text-muted-foreground max-w-prose">
                  No upcoming opening has both a future date and a source on its listing right now.
                </p>
              )}
            </section>
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

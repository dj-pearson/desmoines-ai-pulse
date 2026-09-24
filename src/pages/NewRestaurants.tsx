import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
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
import { groupOpenings, openingLabel, RECENT_WINDOW_DAYS, type OpeningRow } from "@/lib/restaurantOpenings";

type Row = OpeningRow & { slug?: string | null; [key: string]: unknown };

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
  const since = new Date(Date.now() - RECENT_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
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
  const { recent, upcoming } = groupOpenings(data ?? [], now);
  const year = new Date().getFullYear();
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
            <section aria-labelledby="recent-heading" className="mb-12">
              <h2 id="recent-heading" className="text-2xl font-bold mb-4">
                Recently opened ({recent.length})
              </h2>
              {recent.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {recent.map((r, i) => (
                    <RestaurantCard
                      key={r.id}
                      restaurant={r as never}
                      priority={i < 3}
                      openingLabel={openingLabel(r, now) ?? undefined}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No openings recorded in the past year.</p>
              )}
            </section>

            <section aria-labelledby="upcoming-heading" className="mb-12">
              <h2 id="upcoming-heading" className="text-2xl font-bold mb-4">
                Opening soon ({upcoming.length})
              </h2>
              {upcoming.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {upcoming.map((r) => (
                    <RestaurantCard key={r.id} restaurant={r as never} openingLabel={openingLabel(r, now) ?? undefined} />
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">Nothing announced right now.</p>
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

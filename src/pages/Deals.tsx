import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Helmet } from 'react-helmet-async';
import { useEffect, useMemo, useState } from 'react';
import {
  useDeals,
  useClaimDeal,
  useDealVenueLinks,
  dealVenueKey,
  filterDealsByWhen,
  normalizeDealWhen,
  type Deal,
  type DealWhen,
} from '@/hooks/useDeals';
import { DealCard } from '@/components/DealCard';
import { CardsGridSkeleton } from '@/components/ui/loading-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Button } from '@/components/ui/button';
import { Tag } from 'lucide-react';
import { getCanonicalUrl } from '@/lib/brandConfig';
import { toJsonLd } from '@/lib/jsonLd';
import { useUrlFilters } from '@/hooks/useUrlFilters';

const CATEGORIES = [
  { value: 'all', label: 'All Deals' },
  { value: 'restaurant', label: 'Dining' },
  { value: 'attraction', label: 'Attractions' },
  { value: 'hotel', label: 'Hotels' },
  { value: 'event', label: 'Events' },
  { value: 'activity', label: 'Activities' },
];

const CATEGORY_VALUES = new Set(CATEGORIES.map((c) => c.value));

const WHEN_OPTIONS: Array<{ value: DealWhen; label: string }> = [
  { value: 'all', label: 'Any time' },
  { value: 'now', label: 'Live now' },
  { value: 'today', label: 'Today' },
];

/** Re-evaluated each minute so "Live now" turns on and off while the page is open. */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function venueHrefFor(deal: Deal, links: Record<string, string>): string | null {
  const key = dealVenueKey(deal);
  return key ? links[key] ?? null : null;
}

function buildOffersJsonLd(deals: Deal[], links: Record<string, string>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Des Moines deals and specials',
    itemListElement: deals.map((deal, i) => {
      const venuePath = venueHrefFor(deal, links);
      return {
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'Offer',
          name: deal.title,
          ...(deal.description ? { description: deal.description } : {}),
          validFrom: deal.start_date,
          ...(deal.end_date ? { validThrough: deal.end_date } : {}),
          offeredBy: {
            '@type': 'LocalBusiness',
            name: deal.business_name,
            ...(venuePath ? { url: getCanonicalUrl(venuePath) } : {}),
          },
        },
      };
    }),
  };
}

export default function Deals() {
  // URL-synced filter (WEB-UX-035). The canonical comment below already talks
  // about "any ?category= permutation", but the page never read or wrote that
  // param - the filter was local React state, so a filtered view could not be
  // shared and Back from a deal returned to the unfiltered list.
  const { getStr, setParam, setMany } = useUrlFilters();
  // An unknown ?category= (an old link, a typo) would query a type that has no
  // rows and show "No deals in this category"; treat it as all instead.
  const rawCategory = getStr('category', 'all');
  const category = CATEGORY_VALUES.has(rawCategory) ? rawCategory : 'all';
  const setCategory = (v: string) => setParam('category', v, { def: 'all' });
  const when = normalizeDealWhen(getStr('when', 'all'));
  const setWhen = (v: DealWhen) => setParam('when', v, { def: 'all' });
  const now = useMinuteClock();
  const { data: allDeals, isLoading, isError, error, refetch } = useDeals(category);
  const { data: venueLinks } = useDealVenueLinks(allDeals);
  const claimDeal = useClaimDeal();
  const deals = useMemo(
    () => (allDeals ? filterDealsByWhen(allDeals, when, now) : allDeals),
    [allDeals, when, now],
  );
  const links = venueLinks ?? {};
  const filtered = category !== 'all' || when !== 'all';

  return (
    <>
      <Helmet>
        <title>Deals & Coupons — Des Moines Discounts | Des Moines Insider</title>
        <meta name="description" content="Find the best deals, coupons, and special offers for Des Moines restaurants, attractions, hotels, and activities." />
        {/* WEB-SEO-002: this route is in the sitemap and prerendered but had no
            canonical of its own. Without one, any ?category= permutation
            declares itself a separate URL. */}
        <link rel="canonical" href={getCanonicalUrl('/deals')} />
        {/* WEB-SEO-002: these pages set only title/description, so index.html's
            static og: and twitter: tags were the only ones shipping — pinned to the
            homepage on every route. Emitting them here lets the static copies be
            marked data-rh and replaced rather than duplicated. */}
        <meta property="og:title" content="Deals & Coupons — Des Moines Discounts | Des Moines Insider" />
        <meta property="og:description" content="Find the best deals, coupons, and special offers for Des Moines restaurants, attractions, hotels, and activities." />
        <meta property="og:url" content={getCanonicalUrl('/deals')} />
        <meta name="twitter:title" content="Deals & Coupons — Des Moines Discounts | Des Moines Insider" />
        <meta name="twitter:description" content="Find the best deals, coupons, and special offers for Des Moines restaurants, attractions, hotels, and activities." />
        {allDeals && allDeals.length > 0 && (
          <script type="application/ld+json">{toJsonLd(buildOffersJsonLd(allDeals, links))}</script>
        )}
      </Helmet>
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          {/* Hero */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-4">
              <Tag className="h-5 w-5" />
              <span className="font-semibold">Save in Des Moines</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-3">
              Deals & Special Offers
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Exclusive discounts on restaurants, attractions, hotels, and more in Des Moines.
            </p>
          </div>

          {/* The cards carry no affiliate or booking links, so the old affiliate
              banner described something this page doesn't do. What it does
              do is sort promoted deals first; say so. */}
          <p className="max-w-2xl mx-auto mb-8 text-center text-sm text-muted-foreground">
            Deals marked Featured are picked by the Des Moines Insider team and listed first.
            The rest are sorted by end date, soonest first.
          </p>

          {/* Category filter */}
          <div
            role="group"
            aria-label="Deal category"
            className="flex items-center gap-2 flex-wrap justify-center mb-4"
          >
            {CATEGORIES.map((cat) => (
              <Button
                key={cat.value}
                variant={category === cat.value ? 'default' : 'outline'}
                size="sm"
                className="min-h-11"
                aria-pressed={category === cat.value}
                onClick={() => setCategory(cat.value)}
              >
                {cat.label}
              </Button>
            ))}
          </div>

          {/* Time-of-day filter, evaluated in Des Moines time */}
          <div
            role="group"
            aria-label="When the deal runs"
            className="flex items-center gap-2 flex-wrap justify-center mb-8"
          >
            {WHEN_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={when === opt.value ? 'secondary' : 'ghost'}
                size="sm"
                className="min-h-11"
                aria-pressed={when === opt.value}
                onClick={() => setWhen(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>

          {/* Deals grid */}
          {isLoading ? (
            <CardsGridSkeleton
              count={6}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
              label="Loading deals..."
            />
          ) : isError ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : deals && deals.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {deals.map((deal) => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  onClaim={(id) => claimDeal.mutate(id)}
                  venueHref={venueHrefFor(deal, links)}
                  now={now}
                />
              ))}
            </div>
          ) : filtered ? (
            <EmptyState
              icon={Tag}
              title={when === 'now' ? 'No deals running right now' : when === 'today' ? 'No deals running today' : 'No deals in this category'}
              description="There are no active deals matching this filter. Try browsing all deals."
              actions={[
                {
                  label: 'View all deals',
                  variant: 'outline',
                  // One navigation: two setParam calls would each start
                  // from the old URL and the second would undo the first.
                  onClick: () => setMany({ when: null, category: null }),
                },
              ]}
            />
          ) : (
            <EmptyState
              icon={Tag}
              title="No deals available"
              description="Check back soon for new deals and special offers."
            />
          )}
        </div>
        <Footer />
      </div>
    </>
  );
}

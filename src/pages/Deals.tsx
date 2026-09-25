import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Helmet } from 'react-helmet-async';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useDeals,
  useClaimDeal,
  useDealVenueLinks,
  dealVenueKey,
  filterDealsByWhen,
  hasDealSchedule,
  normalizeDealWhen,
  type Deal,
  type DealWhen,
} from '@/hooks/useDeals';
import { DealCard } from '@/components/DealCard';
import { CardsGridSkeleton } from '@/components/ui/loading-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Button } from '@/components/ui/button';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { ExploreSectionLinks } from '@/components/explore/ExploreSectionLinks';
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

/**
 * "Running now" first: it is the question the page answers that a coupon
 * list doesn't. The chip and the card badge use the same words and the same
 * clock (isDealLiveAt); deals with no day or time window are running
 * whenever they're in date, so under Running now and Today they are listed
 * apart as "Good any time" rather than mixed in with the happy hours.
 */
const WHEN_OPTIONS: Array<{ value: DealWhen; label: string }> = [
  { value: 'now', label: 'Running now' },
  { value: 'today', label: 'Today' },
  { value: 'all', label: 'Any time' },
];

const PAGE_TITLE = 'Des Moines Deals, Happy Hours & Coupons | Des Moines Insider';
const PAGE_DESCRIPTION =
  'Happy hours, specials and coupons at Des Moines businesses, with the days and times they run.';

const CHIP_CLASS = 'min-h-11 shrink-0 whitespace-nowrap';

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
  // Under a time filter, scheduled deals first and the always-on ones apart.
  const groups = useMemo(() => {
    if (!deals || when === 'all') return null;
    return {
      scheduled: deals.filter((d) => hasDealSchedule(d)),
      anyTime: deals.filter((d) => !hasDealSchedule(d)),
    };
  }, [deals, when]);

  const renderGrid = (list: Deal[]) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {list.map((deal) => (
        <DealCard
          key={deal.id}
          deal={deal}
          onClaim={(id) => claimDeal.mutate(id)}
          venueHref={venueHrefFor(deal, links)}
          now={now}
        />
      ))}
    </div>
  );

  // Somewhere to go from an empty list. Deals are added by the team (the
  // INSERT policy is admin-only, WEB-ADS-009), so a business asks through
  // the contact form rather than a self-serve form.
  const emptyLinks = (
    <ul className="flex flex-col items-center gap-1 text-sm sm:flex-row sm:gap-5">
      <li>
        <Link to="/restaurants/open-now" className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-primary">
          Restaurants open now
        </Link>
      </li>
      <li>
        <Link to="/events/today" className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-primary">
          Events today
        </Link>
      </li>
      <li>
        <Link to="/contact" className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-primary">
          Run a deal at your business? Tell us
        </Link>
      </li>
    </ul>
  );

  return (
    <>
      <Helmet>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={PAGE_DESCRIPTION} />
        {/* WEB-SEO-002: this route is in the sitemap and prerendered but had no
            canonical of its own. Without one, any ?category= permutation
            declares itself a separate URL. */}
        <link rel="canonical" href={getCanonicalUrl('/deals')} />
        {/* WEB-SEO-002: these pages set only title/description, so index.html's
            static og: and twitter: tags were the only ones shipping — pinned to the
            homepage on every route. Emitting them here lets the static copies be
            marked data-rh and replaced rather than duplicated. */}
        <meta property="og:title" content={PAGE_TITLE} />
        <meta property="og:description" content={PAGE_DESCRIPTION} />
        <meta property="og:url" content={getCanonicalUrl('/deals')} />
        <meta name="twitter:title" content={PAGE_TITLE} />
        <meta name="twitter:description" content={PAGE_DESCRIPTION} />
        {allDeals && allDeals.length > 0 && (
          <script type="application/ld+json">{toJsonLd(buildOffersJsonLd(allDeals, links))}</script>
        )}
      </Helmet>
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-6 sm:py-8">
          <Breadcrumbs
            className="mb-4"
            items={[
              { label: 'Home', href: '/' },
              { label: 'Things to do', href: '/things-to-do' },
              { label: 'Deals' },
            ]}
          />

          {/* Hero: one line on phones, so the chips and the first deals are
              above the fold. */}
          <div className="mb-4 sm:mb-8 sm:text-center">
            <div className="hidden sm:inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-4">
              <Tag className="h-5 w-5" aria-hidden="true" />
              <span className="font-semibold">Save in Des Moines</span>
            </div>
            <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold sm:mb-3">Deals & Special Offers</h1>
            <p className="hidden sm:block text-lg text-muted-foreground max-w-2xl mx-auto">
              {PAGE_DESCRIPTION}
            </p>
          </div>

          {/* Time and category as one row. On phones it scrolls sideways
              instead of wrapping into three lines of buttons. */}
          <div className="-mx-4 mb-6 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:mb-8 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0">
            {/* Evaluated in Des Moines time */}
            <div role="group" aria-label="When the deal runs" className="flex shrink-0 gap-2">
              {WHEN_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  variant={when === opt.value ? 'secondary' : 'ghost'}
                  size="sm"
                  className={CHIP_CLASS}
                  aria-pressed={when === opt.value}
                  onClick={() => setWhen(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
            <span aria-hidden="true" className="h-6 w-px shrink-0 bg-border" />
            <div role="group" aria-label="Deal category" className="flex shrink-0 gap-2 sm:shrink sm:flex-wrap">
              {CATEGORIES.map((cat) => (
                <Button
                  key={cat.value}
                  variant={category === cat.value ? 'default' : 'outline'}
                  size="sm"
                  className={CHIP_CLASS}
                  aria-pressed={category === cat.value}
                  onClick={() => setCategory(cat.value)}
                >
                  {cat.label}
                </Button>
              ))}
            </div>
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
            groups ? (
              <div className="space-y-10">
                {groups.scheduled.length > 0 && renderGrid(groups.scheduled)}
                {groups.anyTime.length > 0 && (
                  <section aria-labelledby="deals-any-time">
                    <h2 id="deals-any-time" className="text-xl font-semibold mb-1">
                      Good any time
                    </h2>
                    <p className="text-sm text-muted-foreground mb-4">
                      No set days or hours. These run until they end.
                    </p>
                    {renderGrid(groups.anyTime)}
                  </section>
                )}
              </div>
            ) : (
              renderGrid(deals)
            )
          ) : filtered ? (
            <EmptyState
              icon={Tag}
              title={when === 'now' ? 'No deals running right now' : when === 'today' ? 'No deals running today' : 'No deals in this category'}
              description="Nothing listed matches this filter."
              actions={[
                {
                  label: 'View all deals',
                  variant: 'outline',
                  // One navigation: two setParam calls would each start
                  // from the old URL and the second would undo the first.
                  onClick: () => setMany({ when: null, category: null }),
                },
              ]}
            >
              {emptyLinks}
            </EmptyState>
          ) : (
            <EmptyState icon={Tag} title="No deals listed right now">
              {emptyLinks}
            </EmptyState>
          )}

          {/* The cards carry no affiliate or booking links, so the old
              affiliate banner described something this page doesn't do.
              What it does do is sort promoted deals first; say so, under
              the list it describes. */}
          <p className="max-w-2xl mx-auto mt-8 text-center text-sm text-muted-foreground">
            Deals marked Featured are picked by the Des Moines Insider team and listed first.
            The rest are sorted by end date, soonest first.
          </p>

          <ExploreSectionLinks current="/deals" className="mt-8 border-t pt-6" />
        </div>
        <Footer />
      </div>
    </>
  );
}

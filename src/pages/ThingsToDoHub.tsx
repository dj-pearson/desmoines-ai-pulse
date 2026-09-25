/**
 * ThingsToDoHub - the /things-to-do Explore landing.
 *
 * Answers "what should I do today or this weekend" on the first phone screen,
 * links every Explore section, and does not change shape after load: every
 * card above "More guides" has a fixed destination, and the published-pSEO
 * query can only upgrade an href (see src/lib/hubLinks.ts).
 *
 * Explore pass 2 WP1: the weekend number is the /events/this-weekend number,
 * each intent has one URL, and the page shows places open right now.
 */

import { lazy, Suspense, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, Clock, Heart, Leaf, Snowflake, Sun, Flower2, FerrisWheel } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead from '@/components/SEOHead';
import { upcomingMonths } from '@/components/seo/MonthLinks';
import { ExploreSectionLinks } from '@/components/explore/ExploreSectionLinks';
import { OpenNowAttractions } from '@/components/explore/OpenNowAttractions';
import { useEventLanding, countFree, type LandingEvent } from '@/hooks/useEventLanding';
import { useSeasonalGuideSlugs } from '@/hooks/useSeasonalGuides';
import { useNow } from '@/hooks/useNow';
import { usePseoPageSlugs } from '@/pseo/hooks/usePseoPage';
import { getCanonicalUrl } from '@/lib/brandConfig';
import { handleError, ErrorSeverity } from '@/lib/errorHandler';
import { isPrerender } from '@/lib/isPrerender';
import { isEventOver } from '@/lib/eventTiming';
import { countEventsByArea, weekendAreaLabel } from '@/lib/areaCounts';
import { NEIGHBORHOODS } from '@/lib/neighborhoods';
import {
  HUB_ACTIVITIES,
  HUB_ALL_AREAS_HREF,
  HUB_AREAS,
  HUB_AUDIENCES,
  HUB_DATE_NIGHT,
  HUB_EXPLORE_LINKS,
  HUB_MORE_GUIDES,
  HUB_PLAYGROUND_MAP_HREF,
  HUB_WEEKEND_FREE_HREF,
  HUB_WEEKEND_LANDING,
  HUB_WHEN_FIXED,
  resolveFixedItem,
  type FixedHubItem,
} from '@/lib/hubLinks';
import { currentSeason, isInLeadWindow, nextSeason, seasonHref, SEASON_LABEL, type Season } from '@/lib/hubSeason';
import { getAnnualEvent } from '@/lib/annualEvents';
import { centralDateOf, centralWeekday } from '@/lib/timezone';
import type { LucideIcon } from 'lucide-react';

// TonightRail is the same fixed-height strip the homepage uses. Loaded lazily
// so the hub's own chunk stays a link directory. The fallback reserves the
// rail's full height since Home pass 2 added RailWeatherLine: py-6 (3rem) +
// 44px heading row (2.75rem) + the h-6 weather line (1.5rem) + its mb-3
// (0.75rem) + the 11.5rem strip = 19.5rem. Set here rather than exported from
// TonightRail, which is a Home-owned file.
const TonightRail = lazy(() => import('@/components/TonightRail').then((m) => ({ default: m.TonightRail })));

const SEASON_ICON: Record<Season, LucideIcon> = {
  spring: Flower2,
  summer: Sun,
  fall: Leaf,
  winter: Snowflake,
};

const SEASON_BLURB: Record<Season, string> = {
  spring: 'Patio openers and garden blooms',
  summer: 'Outdoor concerts, festivals and the pool',
  fall: 'Orchards, pumpkins and foliage',
  winter: 'Holiday lights and indoor picks',
};

interface ResolvedCard {
  key: string;
  name: string;
  href: string;
  description?: string;
}

function resolveAll(items: readonly FixedHubItem[], published: ReadonlySet<string>): ResolvedCard[] {
  return items.map((item) => {
    const link = resolveFixedItem(item, published);
    return { key: item.key, name: item.name, href: link.href, description: link.description };
  });
}

interface WhenCard extends ResolvedCard {
  icon: LucideIcon;
}

const chipClass =
  'inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-accent transition-colors';

// inline-flex min-h-11: the weekend line's links are 44px tap targets on phones.
const textLinkClass = 'inline-flex min-h-11 items-center font-medium underline underline-offset-4';

function SectionHeading({ id, title, sub }: { id: string; title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 id={id} className="text-2xl font-bold tracking-tight">{title}</h2>
      {sub && <p className="text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

interface HubWeekend {
  /** False under the prerender, while loading, and on error. */
  settled: boolean;
  /** The rows the line counts: all of the weekend, or on Sat/Sun what isn't over. */
  rows: readonly LandingEvent[];
  /** The request hit its row cap, so every count is a floor. */
  capped: boolean;
  /** Saturday or Sunday in Des Moines: the line counts what is still to come. */
  midWeekend: boolean;
  isLoading: boolean;
}

const EMPTY_ROWS: readonly LandingEvent[] = [];

/**
 * The weekend rows, from the query /events/this-weekend runs (same options,
 * same cache entry, see HUB_WEEKEND_LANDING). Not run at all under the
 * build-time prerender, whose frozen HTML would carry the build's count.
 */
function useHubWeekend(): HubWeekend {
  const prerender = isPrerender();
  const now = useNow(60_000);
  const { data, isLoading, isSuccess } = useEventLanding({ ...HUB_WEEKEND_LANDING, enabled: !prerender });
  const midWeekend = [0, 6].includes(centralWeekday(centralDateOf(now)));
  const raw = data ?? EMPTY_ROWS;
  const rows = useMemo(
    () => (midWeekend ? raw.filter((e) => !isEventOver(e, now)) : raw),
    [raw, midWeekend, now],
  );
  return {
    settled: !prerender && isSuccess,
    rows,
    capped: raw.length >= HUB_WEEKEND_LANDING.limit,
    midWeekend,
    isLoading: !prerender && isLoading,
  };
}

function WeekendLine({ weekend }: { weekend: HubWeekend }) {
  const { settled, rows, capped, midWeekend, isLoading } = weekend;
  const free = countFree(rows);
  const count = `${rows.length}${capped ? '+' : ''}`;

  // Fixed height, and no aria-live: the count arriving is not an announcement.
  return (
    <div className="container mx-auto px-4 pb-2">
      <p className="flex min-h-11 flex-wrap items-center gap-x-1 text-base text-foreground" data-hub-weekend-line="">
        {isLoading ? (
          <span className="h-4 w-56 rounded bg-muted animate-pulse motion-reduce:animate-none" aria-hidden="true" />
        ) : !settled || rows.length === 0 ? (
          <Link to="/events/this-weekend" className={textLinkClass}>
            See what's on this weekend
          </Link>
        ) : (
          <>
            <Link to="/events/this-weekend" className={textLinkClass} data-hub-weekend-count={rows.length}>
              {midWeekend ? `${count} still to come this weekend` : `${count} events this weekend`}
            </Link>
            {free > 0 && (
              <>
                <span aria-hidden="true">,</span>
                <Link to={HUB_WEEKEND_FREE_HREF} className={textLinkClass}>
                  {free} free
                </Link>
              </>
            )}
          </>
        )}
      </p>
    </div>
  );
}

export default function ThingsToDoHub() {
  const canonicalUrl = getCanonicalUrl('/things-to-do');

  // SEO-012: a pSEO page is linked only when it is published. The query can
  // upgrade an href; it cannot add or remove a card above "More guides".
  const { data: pseoSlugs, isSuccess, isError, error } = usePseoPageSlugs();
  useEffect(() => {
    // WARNING severity: reported, no toast. The page is whole without it.
    if (isError) handleError(error, { component: 'ThingsToDoHub', action: 'pseo-slugs' }, ErrorSeverity.WARNING);
  }, [isError, error]);
  const published = new Set((pseoSlugs ?? []).map((r) => r.slug));

  const { data: seasonalGuides } = useSeasonalGuideSlugs();
  const weekend = useHubWeekend();

  const today = centralDateOf();
  const season = currentSeason(today);
  const upcoming = nextSeason(season);
  const fair = getAnnualEvent('iowa-state-fair');
  const showFair = fair ? isInLeadWindow(fair, today) : false;
  const [thisMonth] = upcomingMonths(new Date(), 1);

  // A season links its seasonal guide, or the static fallback. Never the
  // /things-to-do/<season> pSEO page: one URL per intent (WP1 item 3).
  const seasonCard = (s: Season): WhenCard => ({
    key: s,
    name: SEASON_LABEL[s],
    href: seasonHref(s, seasonalGuides, today),
    description: SEASON_BLURB[s],
    icon: SEASON_ICON[s],
  });

  // Hero chips: Today, Tonight, This Weekend, this season.
  const [todayChip, weekendChip] = resolveAll(HUB_WHEN_FIXED, published);
  const SeasonIcon = SEASON_ICON[season];
  const seasonChip = seasonCard(season);

  // The When row adds to the chips instead of repeating them (WP1 item 8).
  const [dateNight] = resolveAll([HUB_DATE_NIGHT], published);
  const whenCards: WhenCard[] = [
    ...(showFair && fair
      ? [{ key: fair.id, name: fair.name, href: fair.route, description: fair.rangeLabel, icon: FerrisWheel }]
      : []),
    ...(thisMonth
      ? [{ key: 'this-month', name: thisMonth.label, href: thisMonth.href, description: 'The whole month, day by day', icon: CalendarDays }]
      : []),
    seasonCard(upcoming),
    { ...dateNight, icon: Heart },
  ];

  const areaLinks = resolveAll(HUB_AREAS, published);
  const audienceLinks = resolveAll(HUB_AUDIENCES, published);
  const activityLinks = resolveAll(HUB_ACTIVITIES, published);

  // Per-area weekend counts from the rows the weekend line already holds, with
  // the neighborhood pages' own match rule. Shown only once the line settled.
  const areaCounts = useMemo(
    () => (weekend.settled ? countEventsByArea(weekend.rows, NEIGHBORHOODS) : null),
    [weekend.settled, weekend.rows],
  );

  const topHrefs = new Set(
    [todayChip, weekendChip, seasonChip, ...whenCards, ...areaLinks, ...audienceLinks, ...activityLinks].map(
      (l) => l.href,
    ),
  );
  const moreGuides = HUB_MORE_GUIDES.filter((l) => published.has(l.href) && !topHrefs.has(l.href));

  // mainEntity: an ItemList naming each linked page (SEO-012 AC4: only pages
  // that exist, which every href above does). The hub itself is left out.
  const partLinks = [
    ...HUB_EXPLORE_LINKS.map((l) => ({ name: l.label, href: l.href })),
    ...[todayChip, weekendChip, ...whenCards, ...audienceLinks, ...areaLinks, ...activityLinks].map((l) => ({
      name: l.name,
      href: l.href,
    })),
  ];
  const seenParts = new Set<string>(['/things-to-do']);
  const uniqueParts = partLinks.filter((l) => (seenParts.has(l.href) ? false : (seenParts.add(l.href), true)));
  const collection = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': canonicalUrl,
    name: 'Things to Do in Des Moines',
    url: canonicalUrl,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: uniqueParts.map((l, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: l.name,
        url: getCanonicalUrl(l.href),
      })),
    },
  };

  return (
    <>
      <SEOHead
        title="Things to Do in Des Moines, Iowa | Des Moines Insider"
        description="The best things to do in Des Moines and around it, by neighborhood, activity or occasion: family-friendly, date nights and free events."
        url={canonicalUrl}
        canonicalUrl={canonicalUrl}
        keywords={['things to do des moines', 'des moines activities', 'des moines attractions', 'what to do in des moines']}
        structuredData={collection}
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'Things to Do', url: '/things-to-do' },
        ]}
      />

      <Header />

      {/* Plain <div>, not <main>: App.tsx already provides the single
          top-level <main id="main-content"> landmark (WCAG 1.3.1). */}
      <div className="min-h-screen bg-background" data-hub-body="">
        {/* Hero: one line of copy, then the actions people come here for. */}
        <section className="border-b border-border bg-muted/40" aria-labelledby="hub-heading">
          <div className="container mx-auto px-4 py-6 md:py-12">
            <h1 id="hub-heading" className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
              Things to Do in Des Moines
            </h1>
            <p className="mt-2 text-base text-muted-foreground max-w-prose">
              What's on across the metro, by day, neighborhood and who you're with.
            </p>
            <nav aria-label="When" className="mt-4 flex flex-wrap gap-2">
              <Link to={todayChip.href} className={chipClass}>
                <Clock className="h-4 w-4" aria-hidden="true" />
                {todayChip.name}
              </Link>
              <a href="#tonight-rail-heading" className={chipClass}>
                Tonight
              </a>
              <Link to={weekendChip.href} className={chipClass}>
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                {weekendChip.name}
              </Link>
              <Link to={seasonChip.href} className={chipClass}>
                <SeasonIcon className="h-4 w-4" aria-hidden="true" />
                {seasonChip.name}
              </Link>
            </nav>
          </div>
        </section>

        {/* Right now */}
        <Suspense fallback={<div className="h-[19.5rem]" aria-hidden="true" />}>
          <TonightRail />
        </Suspense>
        <WeekendLine weekend={weekend} />
        <OpenNowAttractions />

        <div className="container mx-auto px-4 py-10 space-y-12">
          {/* Explore Des Moines: every Explore section, as plain links. */}
          <section aria-labelledby="explore-heading">
            <SectionHeading id="explore-heading" title="Explore Des Moines" />
            <ExploreSectionLinks current="/things-to-do" />
            <p className="mt-2 text-sm text-muted-foreground">
              <Link
                to={HUB_PLAYGROUND_MAP_HREF}
                className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4"
              >
                Playgrounds on the map
              </Link>
            </p>
          </section>

          {/* When */}
          <section aria-labelledby="by-time-heading">
            <SectionHeading id="by-time-heading" title="When are you going?" />
            <ul className="grid grid-cols-2 md:grid-cols-4 gap-3" data-hub-section="when">
              {whenCards.map((card) => {
                const Icon = card.icon;
                return (
                  <li key={card.key}>
                    <Link
                      to={card.href}
                      className="group flex h-full flex-col gap-1.5 rounded-xl border border-border bg-card p-4 hover:bg-accent transition-colors"
                    >
                      <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                      <span className="font-semibold text-sm text-foreground">{card.name}</span>
                      {card.description && (
                        <span className="text-xs text-muted-foreground leading-snug">{card.description}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Who's going. gap-px over a border-colored grid draws the row
              dividers at every width, one column or two. */}
          <section aria-labelledby="by-audience-heading">
            <SectionHeading id="by-audience-heading" title="Who's going?" />
            <ul
              className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2"
              data-hub-section="audiences"
            >
              {audienceLinks.map((a) => (
                <li key={a.key} className="bg-card">
                  <Link to={a.href} className="group flex min-h-11 items-center justify-between gap-3 px-4 py-3 hover:bg-accent">
                    <span>
                      <span className="block font-semibold text-foreground">{a.name}</span>
                      {a.description && <span className="block text-sm text-muted-foreground">{a.description}</span>}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {/* Areas: a scrolling row on phones, a grid from sm up. Each count
              line has a fixed height, so a number arriving moves nothing. */}
          <section aria-labelledby="by-area-heading">
            <SectionHeading id="by-area-heading" title="By area" />
            <ul
              className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 lg:grid-cols-4"
              data-hub-section="areas"
            >
              {areaLinks.map((area) => {
                const count = areaCounts ? weekendAreaLabel(areaCounts[area.key], weekend.capped) : null;
                return (
                  <li key={area.key} className="shrink-0">
                    <Link
                      to={area.href}
                      className="flex min-h-11 h-full flex-col justify-center rounded-xl border border-border bg-card px-4 py-2 hover:bg-accent sm:p-4"
                    >
                      <span className="font-semibold text-sm text-foreground whitespace-nowrap">{area.name}</span>
                      {area.description && (
                        <span className="hidden sm:block text-xs text-muted-foreground leading-snug">{area.description}</span>
                      )}
                      <span className="block h-4 text-xs font-medium text-foreground sm:mt-1" data-hub-area-count="">
                        {count}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-sm">
              <Link
                to={HUB_ALL_AREAS_HREF}
                className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4"
              >
                All neighborhoods
              </Link>
            </p>
          </section>

          {/* Activities: only destinations the Explore row doesn't already link. */}
          <section aria-labelledby="by-category-heading">
            <SectionHeading id="by-category-heading" title="By activity" />
            <ul className="flex flex-wrap gap-2" data-hub-section="activities">
              {activityLinks.map((cat) => (
                <li key={cat.key}>
                  <Link to={cat.href} className={chipClass}>
                    {cat.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {/* More guides: pSEO pages with no other destination. Rendered only
              after the slug query succeeds, at the bottom, so its arrival moves
              nothing above it. */}
          {isSuccess && moreGuides.length > 0 && (
            <section aria-labelledby="more-guides-heading" className="pb-4">
              <SectionHeading
                id="more-guides-heading"
                title="More guides"
                sub="More neighborhood and occasion pages"
              />
              <ul className="flex flex-wrap gap-x-6 gap-y-1" data-hub-section="more-guides">
                {moreGuides.map(({ href, label }) => (
                  <li key={href}>
                    <Link
                      to={href}
                      className="inline-flex min-h-11 items-center text-sm font-medium text-foreground underline underline-offset-4 hover:text-primary"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <Footer />
    </>
  );
}

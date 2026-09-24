/**
 * ThingsToDoHub - the /things-to-do Explore landing.
 *
 * Answers "what should I do today or this weekend" on the first phone screen,
 * links every Explore section, and does not change shape after load: every
 * card above "More guides" has a fixed destination, and the published-pSEO
 * query can only upgrade an href (see src/lib/hubLinks.ts).
 */

import { lazy, Suspense, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, Clock, Leaf, Snowflake, Sun, Flower2, FerrisWheel } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead from '@/components/SEOHead';
import { useEventLanding, countFree, countLabel } from '@/hooks/useEventLanding';
import { useSeasonalGuides } from '@/hooks/useSeasonalGuides';
import { useWeather } from '@/hooks/useWeather';
import { usePseoPageSlugs } from '@/pseo/hooks/usePseoPage';
import { getCanonicalUrl } from '@/lib/brandConfig';
import { handleError, ErrorSeverity } from '@/lib/errorHandler';
import {
  HUB_ACTIVITIES,
  HUB_AREAS,
  HUB_AUDIENCES,
  HUB_EXPLORE_LINKS,
  HUB_MORE_GUIDES,
  HUB_PLAYGROUND_MAP_HREF,
  HUB_WHEN_FIXED,
  resolveFixedItem,
  type FixedHubItem,
} from '@/lib/hubLinks';
import { currentSeason, isInLeadWindow, nextSeason, seasonHref, SEASON_LABEL, type Season } from '@/lib/hubSeason';
import { getAnnualEvent } from '@/lib/annualEvents';
import { centralDateOf } from '@/lib/timezone';
import type { LucideIcon } from 'lucide-react';

// TonightRail is the same fixed-height strip the homepage uses. Loaded lazily
// so the hub's own chunk stays a link directory; the fallback reserves the
// rail's full height (py-6 + 44px heading row + mb-3 + 11.5rem strip = 18rem).
const TonightRail = lazy(() => import('@/components/TonightRail').then((m) => ({ default: m.TonightRail })));

/** Same key and cap as /events/this-weekend, so the two share one cache entry. */
const WEEKEND_LIMIT = 500;

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

function SectionHeading({ id, title, sub }: { id: string; title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 id={id} className="text-2xl font-bold tracking-tight">{title}</h2>
      {sub && <p className="text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function WeekendLine() {
  const { data, isLoading, isError } = useEventLanding({
    key: { landing: 'this-weekend' },
    window: 'this-weekend',
    limit: WEEKEND_LIMIT,
  });
  const { weather, hasVerdict } = useWeather();

  const events = data ?? [];
  const free = countFree(events);

  // Both lines have a fixed height so the counts arriving shift nothing.
  return (
    <div className="container mx-auto px-4 pb-2">
      <p className="flex min-h-11 flex-wrap items-center gap-x-1 text-base text-foreground" aria-live="polite">
        {isLoading ? (
          <span className="h-4 w-56 rounded bg-muted animate-pulse motion-reduce:animate-none" aria-hidden="true" />
        ) : isError || events.length === 0 ? (
          <Link to="/events/this-weekend" className="font-medium underline underline-offset-4">
            See what's on this weekend
          </Link>
        ) : (
          <>
            <Link to="/events/this-weekend" className="font-medium underline underline-offset-4">
              {countLabel(events.length, WEEKEND_LIMIT)} events this weekend
            </Link>
            {free > 0 && (
              <>
                <span aria-hidden="true">,</span>
                <Link to="/events/free" className="font-medium underline underline-offset-4">
                  {free} free
                </Link>
              </>
            )}
          </>
        )}
      </p>
      <p className="h-6 truncate text-sm text-muted-foreground">{hasVerdict ? weather.conditions : ''}</p>
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

  const { data: seasonalGuides } = useSeasonalGuides();

  const today = centralDateOf();
  const season = currentSeason(today);
  const upcoming = nextSeason(season);
  const fair = getAnnualEvent('iowa-state-fair');
  const showFair = fair ? isInLeadWindow(fair, today) : false;

  const [todayCard, weekendCard] = resolveAll(HUB_WHEN_FIXED, published);
  const seasonCard = (s: Season): WhenCard => {
    const pseoPath = `/things-to-do/${s}`;
    return {
      key: s,
      name: SEASON_LABEL[s],
      href: published.has(pseoPath) ? pseoPath : seasonHref(s, seasonalGuides),
      description: SEASON_BLURB[s],
      icon: SEASON_ICON[s],
    };
  };
  const whenCards: WhenCard[] = [
    ...(showFair && fair
      ? [{ key: fair.id, name: fair.name, href: fair.route, description: fair.rangeLabel, icon: FerrisWheel }]
      : []),
    { ...todayCard, icon: Clock },
    { ...weekendCard, icon: CalendarDays },
    seasonCard(season),
    seasonCard(upcoming),
  ];

  const areaLinks = resolveAll(HUB_AREAS, published);
  const audienceLinks = resolveAll(HUB_AUDIENCES, published);
  const activityLinks = resolveAll(HUB_ACTIVITIES, published);

  const topHrefs = new Set(
    [...whenCards, ...areaLinks, ...audienceLinks, ...activityLinks].map((l) => l.href),
  );
  const moreGuides = HUB_MORE_GUIDES.filter((l) => published.has(l.href) && !topHrefs.has(l.href));

  // hasPart as an ItemList naming each linked page (SEO-012 AC4: only pages
  // that exist, which every href above now does).
  const partLinks = [
    ...HUB_EXPLORE_LINKS.map((l) => ({ name: l.label, href: l.href })),
    ...[...whenCards, ...audienceLinks, ...areaLinks, ...activityLinks].map((l) => ({ name: l.name, href: l.href })),
  ];
  const seenParts = new Set<string>();
  const uniqueParts = partLinks.filter((l) => (seenParts.has(l.href) ? false : (seenParts.add(l.href), true)));
  const collection = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': canonicalUrl,
    name: 'Things to Do in Des Moines',
    url: canonicalUrl,
    hasPart: {
      '@type': 'ItemList',
      itemListElement: uniqueParts.map((l, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: l.name,
        url: getCanonicalUrl(l.href),
      })),
    },
  };

  const SeasonIcon = SEASON_ICON[season];
  const seasonChip = seasonCard(season);

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
      <div className="min-h-screen bg-background">
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
              <Link to="/events/today" className={chipClass}>
                <Clock className="h-4 w-4" aria-hidden="true" />
                Today
              </Link>
              <a href="#tonight-rail-heading" className={chipClass}>
                Tonight
              </a>
              <Link to="/events/this-weekend" className={chipClass}>
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                This Weekend
              </Link>
              <Link to={seasonChip.href} className={chipClass}>
                <SeasonIcon className="h-4 w-4" aria-hidden="true" />
                {seasonChip.name}
              </Link>
            </nav>
          </div>
        </section>

        {/* Right now */}
        <Suspense fallback={<div className="h-[18rem]" aria-hidden="true" />}>
          <TonightRail />
        </Suspense>
        <WeekendLine />

        <div className="container mx-auto px-4 py-10 space-y-12">
          {/* Explore Des Moines: every Explore section, as plain links. */}
          <section aria-labelledby="explore-heading">
            <SectionHeading id="explore-heading" title="Explore Des Moines" />
            <ul className="flex flex-wrap gap-x-6 gap-y-1">
              {HUB_EXPLORE_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    to={l.href}
                    className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4 hover:text-primary"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-muted-foreground">
              <Link
                to={HUB_PLAYGROUND_MAP_HREF}
                className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4"
              >
                Playgrounds near you on the map
              </Link>
            </p>
          </section>

          {/* When */}
          <section aria-labelledby="by-time-heading">
            <SectionHeading id="by-time-heading" title="When are you going?" />
            <ul className="grid grid-cols-2 md:grid-cols-5 gap-3" data-hub-section="when">
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

          {/* Who's going */}
          <section aria-labelledby="by-audience-heading">
            <SectionHeading id="by-audience-heading" title="Who's going?" />
            <ul
              className="grid grid-cols-1 sm:grid-cols-2 rounded-xl border border-border bg-card divide-y divide-border sm:divide-y-0"
              data-hub-section="audiences"
            >
              {audienceLinks.map((a) => (
                <li key={a.key}>
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

          {/* Areas: a chip row on phones, a grid from sm up. */}
          <section aria-labelledby="by-area-heading">
            <SectionHeading id="by-area-heading" title="By area" />
            <ul
              className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible sm:px-0 lg:grid-cols-6"
              data-hub-section="areas"
            >
              {areaLinks.map((area) => (
                <li key={area.key} className="shrink-0">
                  <Link
                    to={area.href}
                    className="flex min-h-11 flex-col justify-center rounded-full border border-border bg-card px-4 hover:bg-accent sm:h-full sm:rounded-xl sm:p-4"
                  >
                    <span className="font-semibold text-sm text-foreground whitespace-nowrap">{area.name}</span>
                    {area.description && (
                      <span className="hidden sm:block text-xs text-muted-foreground leading-snug">{area.description}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {/* Activities */}
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
                sub="Neighborhood and occasion guides from our editors."
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

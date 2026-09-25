import { useEffect, useRef, useState, type ComponentType, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { Calendar, ExternalLink, Hotel, Palette, TreePine, Utensils } from "lucide-react";
import { FavoriteButton } from "@/components/FavoriteButton";
import OptimizedImage from "@/components/OptimizedImage";
import { SponsoredBadge } from "@/components/SponsoredBadge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { DashboardGroupSkeleton } from "@/components/ui/loading-skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useAttractions } from "@/hooks/useAttractions";
import { useHomeShownIds } from "@/hooks/useHomeShownIds";
import { useHomeWeekEvents } from "@/hooks/useHomeWeekEvents";
import { useHotels } from "@/hooks/useHotels";
import { usePlaygrounds } from "@/hooks/usePlaygrounds";
import { useRestaurantOpenings } from "@/hooks/useSupabase";
import { useSponsoredImpression } from "@/hooks/useSponsoredImpression";
import { openExternalUrl } from "@/lib/capacitorUtils";
import {
  attractionHref,
  eventHref,
  homeOpenings,
  hotelHref,
  isHttpUrl,
  playgroundHref,
  restaurantHref,
} from "@/lib/dashboardItems";
import { isSponsoredActive, logSponsoredClick } from "@/lib/sponsored";
import { formatEventDateShort } from "@/lib/timezone";
import type { Event } from "@/lib/types";

/**
 * "Explore Des Moines" (docs/page-plans/home.md WP3, home-pass2.md WP3).
 *
 * This was a 100-event client-side catch-all with its own search and filters,
 * paginated with javascript:void(0) links, that built restaurant slugs in the
 * browser (and got them wrong), read opening fields the transform had renamed,
 * and labelled tabs with the query limit as if it were a count. It is now a
 * small mixed block: a few of each type, each group linking to its hub, and a
 * per-tab "Show more" that fetches further only for the tab being read.
 * Search lives in the hero and routes to /search.
 *
 * Pass 2:
 *   - the events group starts tomorrow, weekend first (useHomeWeekEvents), and
 *     leaves out anything the Tonight or For You rails above already show;
 *   - openings include places that just opened ("Opened <date>") and drop
 *     upcoming ones whose date has passed;
 *   - every active sponsored row says "Sponsored" and is logged;
 *   - each group holds a three-card slot while its own query loads, and a
 *     failed group says so inside its slot.
 */

type Kind = "event" | "restaurant" | "attraction" | "playground" | "hotel";

const KINDS: readonly Kind[] = ["event", "restaurant", "attraction", "playground", "hotel"];

interface KindConfig {
  label: string;
  badge: string;
  hub: string;
  seeAll: string;
  icon: ComponentType<{ className?: string }>;
  /** Solid -700 shades so white badge text clears 4.5:1 (orange-500 and
   *  green-500 were about 2.8:1 and 2.3:1). */
  badgeClass: string;
  analyticsType: "event" | "restaurant" | "attraction" | "playground" | "page";
}

const KIND_CONFIG: Record<Kind, KindConfig> = {
  event: {
    label: "Events",
    badge: "Event",
    hub: "/events",
    seeAll: "See all events",
    icon: Calendar,
    badgeClass: "bg-[#DC143C] text-white",
    analyticsType: "event",
  },
  restaurant: {
    label: "New openings",
    badge: "Opening",
    hub: "/restaurants/new",
    seeAll: "See all new restaurants",
    icon: Utensils,
    badgeClass: "bg-orange-700 text-white",
    analyticsType: "restaurant",
  },
  attraction: {
    label: "Attractions",
    badge: "Attraction",
    hub: "/attractions",
    seeAll: "See all attractions",
    icon: Palette,
    badgeClass: "bg-purple-700 text-white",
    analyticsType: "attraction",
  },
  playground: {
    label: "Playgrounds",
    badge: "Playground",
    hub: "/playgrounds",
    seeAll: "See all playgrounds",
    icon: TreePine,
    badgeClass: "bg-green-700 text-white",
    analyticsType: "playground",
  },
  hotel: {
    label: "Stay",
    badge: "Hotel",
    hub: "/stay",
    seeAll: "See all places to stay",
    icon: Hotel,
    badgeClass: "bg-sky-700 text-white",
    analyticsType: "page",
  },
};

/**
 * First-paint row budget: 18 + 6 + 6 + 6 + 3 = 39. Events get the most
 * because the rows the Tonight and For You rails already show (up to a dozen)
 * are dropped in the browser, and the group still needs three after that.
 */
const BASE_LIMITS: Record<Kind, number> = {
  event: 18,
  restaurant: 6,
  attraction: 6,
  playground: 6,
  hotel: 3,
};
/** How many more rows one "Show more" asks the server for, when it has to. */
const FETCH_STEP = 12;
/** Hard ceiling per tab; past this the "See all" link to the hub takes over. */
const MAX_LIMIT = 45;
/** Cards per group in the mixed view, and per "Show more" step in a tab. */
const MIX_COUNT = 3;
const PAGE_STEP = 6;

interface CardModel {
  kind: Kind;
  id: string;
  title: string;
  href: string;
  when?: string;
  where?: string;
  description?: string;
  imageUrl?: string;
  externalUrl?: string;
  /** Set for events so the title can open the quick view. */
  event?: Event;
  /** An active sponsorship (isSponsoredActive): labelled and logged. */
  sponsored: boolean;
}

/** Which sponsored-listing content type a card logs under, if it can be sponsored. */
const SPONSORED_TYPE: Partial<Record<Kind, "event" | "restaurant" | "attraction">> = {
  event: "event",
  restaurant: "restaurant",
  attraction: "attraction",
};

/** FavoriteButton's content type for each kind. */
const FAVORITE_TYPE: Record<Kind, "event" | "restaurant" | "attraction" | "playground" | "hotel"> = {
  event: "event",
  restaurant: "restaurant",
  attraction: "attraction",
  playground: "playground",
  hotel: "hotel",
};

const SEP = " \u00b7 ";
const joinParts = (...parts: Array<string | null | undefined>) =>
  parts.filter((p): p is string => Boolean(p && p.trim())).join(SEP) || undefined;
const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

/**
 * Keep the last rows a query returned while its next page loads. The list
 * hooks answer [] while a new key is in flight, and without this a "Show more"
 * that has to fetch would blank the tab before refilling it.
 */
function useStickyRows<T>(rows: T[], isLoading: boolean): T[] {
  const last = useRef<T[]>(rows);
  if (!isLoading || rows.length > 0) last.current = rows;
  return isLoading && rows.length === 0 ? last.current : rows;
}

interface AllInclusiveDashboardProps {
  /** Opens the event quick view. Without it, event titles navigate. */
  onViewEventDetails?: (event: Event) => void;
}

export default function AllInclusiveDashboard({ onViewEventDetails }: AllInclusiveDashboardProps) {
  const [activeTab, setActiveTab] = useState<"all" | Kind>("all");
  const [limits, setLimits] = useState<Record<Kind, number>>(BASE_LIMITS);
  const [visible, setVisible] = useState<Record<Kind, number>>({
    event: PAGE_STEP,
    restaurant: PAGE_STEP,
    attraction: PAGE_STEP,
    playground: PAGE_STEP,
    hotel: PAGE_STEP,
  });
  const pendingFocus = useRef<{ kind: Kind; index: number } | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const { trackEvent } = useAnalytics();

  // countMode "none" everywhere: this block renders no totals, and a tab that
  // said "Events (100)" was printing the limit (plan WP3 item 4/5).
  const eventsQuery = useHomeWeekEvents(limits.event);
  const openingsQuery = useRestaurantOpenings({
    limit: limits.restaurant,
    includeRecentlyOpened: true,
  });
  const attractionsQuery = useAttractions({ limit: limits.attraction, countMode: "none" });
  const playgroundsQuery = usePlaygrounds({
    limit: limits.playground,
    countMode: "none",
    projection: "list",
  });
  const hotelsQuery = useHotels({ limit: limits.hotel, countMode: "none" });

  // Each event once on the page (pass-2 WP3 item 6): drop what the Tonight
  // and For You rails above already show.
  const shownIds = useHomeShownIds();
  const eventRows = useStickyRows(eventsQuery.events, eventsQuery.isLoading).filter(
    (row) => !shownIds.tonight.has(row.id) && !shownIds.forYou.has(row.id),
  );
  const openingRows = useStickyRows(openingsQuery.data ?? [], openingsQuery.isLoading);
  const attractionRows = useStickyRows(attractionsQuery.attractions, attractionsQuery.isLoading);
  const playgroundRows = useStickyRows(playgroundsQuery.playgrounds, playgroundsQuery.isLoading);
  const hotelRows = useStickyRows(hotelsQuery.hotels, hotelsQuery.isLoading);

  // Rows the server returned, before the browser dropped any. "Show more" asks
  // for another page only when the last one came back full.
  const fetchedCount: Record<Kind, number> = {
    event: eventsQuery.events.length,
    restaurant: openingRows.length,
    attraction: attractionRows.length,
    playground: playgroundRows.length,
    hotel: hotelRows.length,
  };

  const cards: Record<Kind, CardModel[]> = {
    event: eventRows.map((row) => ({
      kind: "event",
      id: row.id,
      title: row.title,
      href: eventHref(row),
      when: formatEventDateShort(row),
      where: joinParts(row.venue, row.venue ? undefined : row.location),
      description: str(row.enhanced_description) ?? str(row.original_description),
      imageUrl: str(row.image_url),
      externalUrl: isHttpUrl(row.source_url) ? row.source_url : undefined,
      // The DB row is a superset of the lib Event shape the quick view reads.
      event: row as unknown as Event,
      sponsored: isSponsoredActive(row),
    })),
    restaurant: homeOpenings(openingRows).map(({ row, label }) => ({
      kind: "restaurant",
      id: row.id,
      title: row.name,
      href: restaurantHref(row),
      when: label,
      where: joinParts(row.cuisine, row.location),
      description: str(row.description),
      imageUrl: str(row.image_url),
      externalUrl: isHttpUrl(row.sourceUrl) ? row.sourceUrl : undefined,
      sponsored: isSponsoredActive({ is_sponsored: row.isSponsored, sponsored_until: row.sponsoredUntil }),
    })),
    attraction: attractionRows.map((row) => ({
      kind: "attraction",
      id: row.id,
      title: row.name,
      href: attractionHref(row),
      where: joinParts(row.type, row.location),
      description: str(row.description),
      imageUrl: str(row.image_url),
      externalUrl: isHttpUrl(row.website) ? row.website : undefined,
      sponsored: isSponsoredActive(row),
    })),
    playground: playgroundRows.map((row) => ({
      kind: "playground",
      id: row.id,
      title: row.name,
      href: playgroundHref(row),
      where: joinParts(row.age_range ? `Ages ${row.age_range}` : undefined, row.location),
      description: str(row.description),
      imageUrl: str(row.image_url),
      // No sponsorship columns on playgrounds.
      sponsored: false,
    })),
    hotel: hotelRows.map((row) => ({
      kind: "hotel",
      id: row.id,
      title: row.name,
      href: hotelHref(row),
      where: joinParts(row.area ?? row.city, row.price_range),
      description: str(row.short_description) ?? str(row.description),
      imageUrl: str(row.image_url),
      // HOTEL_LIST_COLUMNS carries no sponsorship columns.
      sponsored: false,
    })),
  };

  const loading: Record<Kind, boolean> = {
    event: eventsQuery.isLoading,
    restaurant: openingsQuery.isLoading,
    attraction: attractionsQuery.isLoading,
    playground: playgroundsQuery.isLoading,
    hotel: hotelsQuery.isLoading,
  };

  /**
   * WEB-QA-032: every source's error is read, including the openings query
   * whose error used to be discarded. A failed load is never shown as an
   * empty category.
   */
  const errors: Record<Kind, unknown> = {
    event: eventsQuery.error,
    restaurant: openingsQuery.error,
    attraction: attractionsQuery.error,
    playground: playgroundsQuery.error,
    hotel: hotelsQuery.error,
  };
  const loadError = KINDS.map((k) => errors[k]).find(Boolean) ?? null;
  const retry: Record<Kind, () => void> = {
    event: () => eventsQuery.refetch(),
    restaurant: () => void openingsQuery.refetch(),
    attraction: () => void attractionsQuery.refetch(),
    playground: () => void playgroundsQuery.refetch(),
    hotel: () => void hotelsQuery.refetch(),
  };
  const retryFailed = () => KINDS.forEach((k) => errors[k] && retry[k]());

  // Move focus to the first card a "Show more" revealed, once it exists.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target || !sectionRef.current) return;
    const link = sectionRef.current.querySelector<HTMLElement>(
      `[data-card-kind="${target.kind}"][data-card-index="${target.index}"] [data-card-link]`,
    );
    if (link) {
      link.focus();
      pendingFocus.current = null;
    }
  });

  const showMore = (kind: Kind) => {
    const shown = Math.min(visible[kind], cards[kind].length);
    pendingFocus.current = { kind, index: shown };
    setVisible((v) => ({ ...v, [kind]: v[kind] + PAGE_STEP }));
    // Only ask the server for more when the next step runs past what is
    // already loaded, and only for this tab.
    const serverMayHaveMore = fetchedCount[kind] >= limits[kind];
    if (shown + PAGE_STEP > cards[kind].length && serverMayHaveMore && limits[kind] < MAX_LIMIT) {
      setLimits((l) => ({ ...l, [kind]: Math.min(MAX_LIMIT, l[kind] + FETCH_STEP) }));
    }
  };

  const trackClick = (card: CardModel) =>
    trackEvent({
      eventType: "click",
      contentType: KIND_CONFIG[card.kind].analyticsType,
      contentId: card.id,
    });

  const anyRows = KINDS.some((k) => cards[k].length > 0);
  const anyLoading = KINDS.some((k) => loading[k]);

  /**
   * A group keeps its slot while its query loads and while it has failed, and
   * gives it up only when the query answered with nothing to show. So a slow
   * table fills its own three-card slot instead of pushing the groups below
   * it down (pass-2 WP3 item 9).
   */
  const groupState = (kind: Kind): "cards" | "loading" | "error" | "empty" => {
    if (cards[kind].length > 0) return "cards";
    if (loading[kind]) return "loading";
    if (errors[kind]) return "error";
    return "empty";
  };

  // The events group is headed by its window ("This weekend" or "Later this
  // week"), so the heading matches the rows under it.
  const groupLabel = (kind: Kind) => (kind === "event" ? eventsQuery.label : KIND_CONFIG[kind].label);

  // Card titles sit under a group h3 in the mixed view and directly under the
  // section h2 in a tab, so their level follows (page-headings spec).
  const renderGrid = (list: CardModel[], titleLevel: "h3" | "h4") => (
    <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3" role="list">
      {list.map((card, i) => (
        <li key={`${card.kind}-${card.id}`} data-card-kind={card.kind} data-card-index={i}>
          <DashboardCard
            card={card}
            titleLevel={titleLevel}
            onOpenEvent={onViewEventDetails}
            onTrack={trackClick}
          />
        </li>
      ))}
    </ul>
  );

  const renderAll = () => {
    if (!anyRows && !anyLoading) {
      if (loadError) return <ErrorState error={loadError} onRetry={retryFailed} />;
      return (
        <p className="py-12 text-center text-muted-foreground">
          Nothing is listed for this week yet. Check back soon.
        </p>
      );
    }
    return (
      <div className="space-y-10 md:space-y-12">
        {KINDS.map((kind) => {
          const state = groupState(kind);
          if (state === "empty") return null;
          const config = KIND_CONFIG[kind];
          const headingId = `dashboard-group-${kind}`;
          return (
            <section key={kind} aria-labelledby={headingId} aria-busy={state === "loading"}>
              <div className="mb-4 flex items-baseline justify-between gap-4">
                <h3 id={headingId} className="text-lg font-semibold text-foreground md:text-xl">
                  {groupLabel(kind)}
                </h3>
                <Link
                  to={config.hub}
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  {config.seeAll}
                </Link>
              </div>
              {state === "cards" && renderGrid(cards[kind].slice(0, MIX_COUNT), "h4")}
              {state === "loading" && <DashboardGroupSkeleton />}
              {state === "error" && (
                <div
                  role="alert"
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm"
                >
                  <span className="text-foreground">
                    {config.label} could not load.
                  </span>
                  <Button variant="outline" size="sm" className="min-h-11" onClick={retry[kind]}>
                    Try again
                  </Button>
                </div>
              )}
            </section>
          );
        })}
      </div>
    );
  };

  const renderTab = (kind: Kind) => {
    const config = KIND_CONFIG[kind];
    const list = cards[kind];
    if (list.length === 0) {
      if (errors[kind]) return <ErrorState error={errors[kind]} onRetry={retry[kind]} />;
      if (loading[kind]) {
        return <p className="py-12 text-center text-muted-foreground">Loading {config.label.toLowerCase()}...</p>;
      }
      return (
        <div className="py-12 text-center">
          <p className="mb-4 text-muted-foreground">Nothing to show here right now.</p>
          <Link to={config.hub} className="font-medium text-primary underline-offset-4 hover:underline">
            {config.seeAll}
          </Link>
        </div>
      );
    }
    const shown = list.slice(0, visible[kind]);
    const hasMoreLoaded = list.length > shown.length;
    const serverMayHaveMore = fetchedCount[kind] >= limits[kind] && limits[kind] < MAX_LIMIT;
    return (
      <>
        {renderGrid(shown, "h3")}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          {(hasMoreLoaded || serverMayHaveMore) && (
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => showMore(kind)}
              disabled={loading[kind]}
            >
              {loading[kind] ? "Loading..." : "Show more"}
            </Button>
          )}
          <Link to={config.hub} className="font-medium text-primary underline-offset-4 hover:underline">
            {config.seeAll}
          </Link>
        </div>
      </>
    );
  };

  const tabClass =
    "min-h-11 whitespace-nowrap flex-shrink-0 rounded-md px-3 py-2.5 text-xs md:text-sm";

  return (
    <section ref={sectionRef} className="py-8 md:py-16 bg-muted/30" aria-labelledby="dashboard-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6 md:mb-8">
          <h2
            id="dashboard-heading"
            className="text-mobile-title md:text-3xl font-bold text-foreground mb-2 mobile-safe-text"
          >
            Explore Des Moines
          </h2>
          <p className="max-w-prose text-mobile-body md:text-lg text-muted-foreground mobile-safe-text">
            Events, new restaurant openings, attractions, playgrounds and places to stay.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "all" | Kind)} className="w-full">
          <div className="w-full overflow-x-auto mb-6 md:mb-8 -mx-4 px-4 md:mx-0 md:px-0">
            <TabsList className="inline-flex h-auto w-max min-w-full justify-start gap-1 p-1 md:w-auto md:min-w-0">
              <TabsTrigger value="all" className={tabClass}>
                All
              </TabsTrigger>
              {KINDS.map((kind) => (
                <TabsTrigger key={kind} value={kind} className={tabClass}>
                  {KIND_CONFIG[kind].label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="all">{activeTab === "all" && renderAll()}</TabsContent>
          {KINDS.map((kind) => (
            <TabsContent key={kind} value={kind}>
              {activeTab === kind && renderTab(kind)}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}

interface DashboardCardProps {
  card: CardModel;
  titleLevel: "h3" | "h4";
  onOpenEvent?: (event: Event) => void;
  onTrack: (card: CardModel) => void;
}

/**
 * One card. The title is the card's only real link (stretched over the card
 * with a pseudo-element), so the whole surface is clickable, middle-click and
 * "open in new tab" work, and a screen reader hears one link per card. The
 * favourite and external-source controls sit above the stretched link.
 */
function DashboardCard({ card, titleLevel, onOpenEvent, onTrack }: DashboardCardProps) {
  const Title = titleLevel;
  const [imageFailed, setImageFailed] = useState(false);
  const config = KIND_CONFIG[card.kind];
  const Icon = config.icon;
  const showImage = Boolean(card.imageUrl) && !imageFailed;
  const sponsoredType = SPONSORED_TYPE[card.kind];
  const articleRef = useRef<HTMLElement>(null);
  // Same viewability contract and per-session dedupe as EventCard (WEB-FEAT-005).
  useSponsoredImpression(articleRef, sponsoredType ?? "event", card.id, card.sponsored && Boolean(sponsoredType));

  const logSponsored = () => {
    if (card.sponsored && sponsoredType) logSponsoredClick(sponsoredType, card.id);
  };

  const handleTitleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onTrack(card);
    logSponsored();
    // Plain left click on an event opens the quick view; any modified click
    // keeps the browser's own behaviour on the real href.
    if (
      card.event &&
      onOpenEvent &&
      e.button === 0 &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.shiftKey &&
      !e.altKey
    ) {
      e.preventDefault();
      onOpenEvent(card.event);
    }
  };

  const handleExternalClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!card.externalUrl) return;
    e.preventDefault();
    onTrack(card);
    logSponsored();
    openExternalUrl(card.externalUrl);
  };

  return (
    <article
      ref={articleRef}
      className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground/30 focus-within:border-foreground/30">
      {showImage ? (
        <OptimizedImage
          src={card.imageUrl}
          alt=""
          width={640}
          height={360}
          aspectRatio="16/9"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          containerClassName="w-full bg-muted"
          className="object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center bg-muted" aria-hidden="true">
          <Icon className="h-10 w-10 text-muted-foreground/60" />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.badgeClass}`}
            >
              <Icon className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
              {config.badge}
            </span>
            {card.sponsored && <SponsoredBadge />}
          </span>
          <div className="relative z-10">
            {card.kind === "event" ? (
              <FavoriteButton eventId={card.id} size="icon" variant="ghost" itemName={card.title} />
            ) : (
              <FavoriteButton
                contentType={FAVORITE_TYPE[card.kind]}
                contentId={card.id}
                size="icon"
                variant="ghost"
                itemName={card.title}
              />
            )}
          </div>
        </div>
        {(card.when || card.where) && (
          <p className="text-sm font-medium text-muted-foreground mobile-safe-text">
            {joinParts(card.when, card.where)}
          </p>
        )}
        <Title className="text-base font-semibold leading-snug text-foreground md:text-lg">
          <Link
            to={card.href}
            data-card-link
            onClick={handleTitleClick}
            className="line-clamp-2 outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-offset-2"
          >
            {card.title}
          </Link>
        </Title>
        {card.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{card.description}</p>
        )}
        {card.externalUrl && (
          <div className="mt-auto flex justify-end pt-1">
            <a
              href={card.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleExternalClick}
              aria-label={`${card.title} on the source site (opens in a new tab)`}
              className="relative z-10 inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        )}
      </div>
    </article>
  );
}

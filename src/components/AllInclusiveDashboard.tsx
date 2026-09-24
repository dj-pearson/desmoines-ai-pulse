import { useEffect, useRef, useState, type ComponentType, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { format, isValid, parseISO } from "date-fns";
import { Calendar, ExternalLink, Hotel, Palette, TreePine, Utensils } from "lucide-react";
import { FavoriteButton } from "@/components/FavoriteButton";
import OptimizedImage from "@/components/OptimizedImage";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { DashboardGridSkeleton } from "@/components/ui/loading-skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useAttractions } from "@/hooks/useAttractions";
import { useEvents } from "@/hooks/useEvents";
import { useHotels } from "@/hooks/useHotels";
import { usePlaygrounds } from "@/hooks/usePlaygrounds";
import { useRestaurantOpenings, type RestaurantWithSlug } from "@/hooks/useSupabase";
import { openExternalUrl } from "@/lib/capacitorUtils";
import {
  attractionHref,
  eventHref,
  hotelHref,
  isHttpUrl,
  orderHomeEvents,
  playgroundHref,
  restaurantHref,
} from "@/lib/dashboardItems";
import { formatEventDateShort } from "@/lib/timezone";
import type { Event } from "@/lib/types";

/**
 * "This week in Des Moines" (docs/page-plans/home.md, WP3).
 *
 * This was a 100-event client-side catch-all with its own search and filters,
 * paginated with javascript:void(0) links, that built restaurant slugs in the
 * browser (and got them wrong), read opening fields the transform had renamed,
 * and labelled tabs with the query limit as if it were a count. It is now a
 * small mixed block: a few of each type, each group linking to its hub, and a
 * per-tab "Show more" that fetches further only for the tab being read.
 * Search lives in the hero and routes to /search.
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
 * First-paint row budget: 9 + 6 + 6 + 6 + 3 = 30 (plan: 30 or fewer). Events
 * get the most because they are reordered tonight-then-weekend before the
 * first three are shown.
 */
const BASE_LIMITS: Record<Kind, number> = {
  event: 9,
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
}

const SEP = " \u00b7 ";
const joinParts = (...parts: Array<string | null | undefined>) =>
  parts.filter((p): p is string => Boolean(p && p.trim())).join(SEP) || undefined;
const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

function openingWhen(row: RestaurantWithSlug): string {
  if (row.openingDate) {
    const d = parseISO(row.openingDate);
    if (isValid(d)) return `Opens ${format(d, "MMM d, yyyy")}`;
  }
  if (row.openingTimeframe) return `Opens ${row.openingTimeframe}`;
  return row.status === "announced" ? "Announced" : "Opening soon";
}

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
  const eventsQuery = useEvents({ limit: limits.event, countMode: "none" });
  const openingsQuery = useRestaurantOpenings({ limit: limits.restaurant });
  const attractionsQuery = useAttractions({ limit: limits.attraction, countMode: "none" });
  const playgroundsQuery = usePlaygrounds({
    limit: limits.playground,
    countMode: "none",
    projection: "list",
  });
  const hotelsQuery = useHotels({ limit: limits.hotel, countMode: "none" });

  const eventRows = useStickyRows(eventsQuery.events, eventsQuery.isLoading);
  const openingRows = useStickyRows(openingsQuery.data ?? [], openingsQuery.isLoading);
  const attractionRows = useStickyRows(attractionsQuery.attractions, attractionsQuery.isLoading);
  const playgroundRows = useStickyRows(playgroundsQuery.playgrounds, playgroundsQuery.isLoading);
  const hotelRows = useStickyRows(hotelsQuery.hotels, hotelsQuery.isLoading);

  const cards: Record<Kind, CardModel[]> = {
    event: orderHomeEvents(eventRows).map((row) => ({
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
    })),
    restaurant: openingRows.map((row) => ({
      kind: "restaurant",
      id: row.id,
      title: row.name,
      href: restaurantHref(row),
      when: openingWhen(row),
      where: joinParts(row.cuisine, row.location),
      description: str(row.description),
      imageUrl: str(row.image_url),
      externalUrl: isHttpUrl(row.sourceUrl) ? row.sourceUrl : undefined,
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
    })),
    playground: playgroundRows.map((row) => ({
      kind: "playground",
      id: row.id,
      title: row.name,
      href: playgroundHref(row),
      where: joinParts(row.age_range ? `Ages ${row.age_range}` : undefined, row.location),
      description: str(row.description),
      imageUrl: str(row.image_url),
    })),
    hotel: hotelRows.map((row) => ({
      kind: "hotel",
      id: row.id,
      title: row.name,
      href: hotelHref(row),
      where: joinParts(row.area ?? row.city, row.price_range),
      description: str(row.short_description) ?? str(row.description),
      imageUrl: str(row.image_url),
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
    event: () => void eventsQuery.refetch(),
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
    const serverMayHaveMore = cards[kind].length >= limits[kind];
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

  // Gate on the primary events query only; the other groups fill in as their
  // queries finish (WEB-UX-015).
  if (eventsQuery.isLoading && eventRows.length === 0) {
    return <DashboardGridSkeleton />;
  }

  const anyRows = KINDS.some((k) => cards[k].length > 0);

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
    if (!anyRows) {
      if (loadError) return <ErrorState error={loadError} onRetry={retryFailed} />;
      return (
        <p className="py-12 text-center text-muted-foreground">
          Nothing is listed for this week yet. Check back soon.
        </p>
      );
    }
    return (
      <div className="space-y-10 md:space-y-12">
        {loadError && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
            <span className="text-foreground">Some sections could not load.</span>
            <Button variant="outline" size="sm" onClick={retryFailed}>
              Try again
            </Button>
          </div>
        )}
        {KINDS.filter((k) => cards[k].length > 0).map((kind) => {
          const config = KIND_CONFIG[kind];
          const headingId = `dashboard-group-${kind}`;
          return (
            <section key={kind} aria-labelledby={headingId}>
              <div className="mb-4 flex items-baseline justify-between gap-4">
                <h3 id={headingId} className="text-lg font-semibold text-foreground md:text-xl">
                  {config.label}
                </h3>
                <Link
                  to={config.hub}
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  {config.seeAll}
                </Link>
              </div>
              {renderGrid(cards[kind].slice(0, MIX_COUNT), "h4")}
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
    const serverMayHaveMore = list.length >= limits[kind] && limits[kind] < MAX_LIMIT;
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
            This week in Des Moines
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

  const handleTitleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onTrack(card);
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
    openExternalUrl(card.externalUrl);
  };

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-foreground/30 focus-within:border-foreground/30">
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
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.badgeClass}`}
          >
            <Icon className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            {config.badge}
          </span>
          {card.kind === "event" && (
            <div className="relative z-10">
              <FavoriteButton eventId={card.id} size="icon" variant="ghost" itemName={card.title} />
            </div>
          )}
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

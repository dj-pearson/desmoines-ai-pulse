import { useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Baby, Search, Star, Utensils, type LucideIcon } from "lucide-react";
import { SponsoredBadge } from "@/components/SponsoredBadge";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useAuth } from "@/hooks/useAuth";
import { SUGGESTED_SEARCHES } from "@/hooks/useSearchInsights";
import { useSponsoredImpression } from "@/hooks/useSponsoredImpression";
import { useTrending, type TrendingContentType } from "@/hooks/useTrending";
import { attractionHref, playgroundHref, restaurantHref } from "@/lib/dashboardItems";
import { isSponsoredActive, logSponsoredClick } from "@/lib/sponsored";

// WP9 of docs/page-plans/home.md.
//
// Every card is a link. They had cursor-pointer and an onClick that only fired
// analytics, so a tap did nothing; the search cards had no handler at all.
//
// Only measured numbers render. Anonymous visitors cannot read
// search_analytics, so they always got a hardcoded list with counts and green
// "trending" arrows. Without real data the column is "Try searching" and shows
// no counts and no arrows.
//
// Pass 2 (docs/page-plans/home-pass2.md WP3 items 2, 4, 11):
//   - no search_analytics read at all: "Try searching" is the static list
//     until get_popular_searches can serve the public safely;
//   - trending_scores is read only for admins (the only role RLS lets read it);
//   - the public columns are "Highly rated", chosen by rating, not the
//     is_featured rows that are paid or admin picks;
//   - a sponsored row that qualifies is labelled, logged, and capped at one
//     per column.

// Events are never rendered here, so the hook does not read them.
const TYPES: TrendingContentType[] = ["restaurant", "attraction", "playground"];

interface ContentRow {
  id: string;
  name: string;
  is_sponsored?: boolean | null;
  sponsored_until?: string | null;
  slug?: string | null;
  rating?: number | string | null;
  location?: string | null;
  cuisine?: string | null;
  price_range?: string | null;
  type?: string | null;
  age_range?: string | null;
}

interface ColumnItem {
  row: ContentRow;
  rank: number;
  views24h?: number;
}

function toRow(content: Record<string, unknown> | undefined): ContentRow | null {
  if (!content || typeof content.id !== "string" || typeof content.name !== "string") {
    return null;
  }
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const rating = content.rating;
  return {
    id: content.id,
    name: content.name,
    slug: str(content.slug),
    rating: typeof rating === "number" || typeof rating === "string" ? rating : null,
    location: str(content.location),
    cuisine: str(content.cuisine),
    price_range: str(content.price_range),
    type: str(content.type),
    age_range: str(content.age_range),
    is_sponsored: typeof content.is_sponsored === "boolean" ? content.is_sponsored : null,
    sponsored_until: str(content.sponsored_until),
  };
}

/** Sponsored rows allowed in one column. The rest of a column is organic. */
const SPONSORED_PER_COLUMN = 1;

/**
 * The first three usable rows, in the order given, with at most
 * SPONSORED_PER_COLUMN active sponsored rows among them. A sponsored row is
 * never moved up; one past the cap is skipped.
 */
function toItems(
  items: Array<{ rank: number; views24h?: number; content?: Record<string, unknown> }>,
): ColumnItem[] {
  const out: ColumnItem[] = [];
  let sponsored = 0;
  for (const item of items) {
    const row = toRow(item.content);
    if (!row) continue;
    if (isSponsoredActive(row)) {
      if (sponsored >= SPONSORED_PER_COLUMN) continue;
      sponsored += 1;
    }
    out.push({ row, rank: item.rank, views24h: item.views24h });
    if (out.length === 3) break;
  }
  return out;
}

interface ColumnProps {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}

function Column({ title, icon, children }: ColumnProps) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h3 className="text-xl font-semibold text-foreground">{title}</h3>
      </div>
      <ul className="space-y-3" role="list">
        {children}
      </ul>
    </div>
  );
}

const cardLinkClass =
  "block rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

type PlaceType = "restaurant" | "attraction" | "playground";

interface PlaceCardProps {
  item: ColumnItem;
  href: string;
  type: PlaceType;
  showMeasured: boolean;
  onClick: () => void;
  meta?: ReactNode;
}

function PlaceCard({ item, href, type, showMeasured, onClick, meta }: PlaceCardProps) {
  const { row } = item;
  const ref = useRef<HTMLAnchorElement>(null);
  // Playgrounds carry no sponsorship columns, so this is false for them.
  const sponsored = isSponsoredActive(row);
  useSponsoredImpression(ref, type, row.id, sponsored);
  return (
    <li>
      <Link
        ref={ref}
        to={href}
        onClick={() => {
          if (sponsored) logSponsoredClick(type, row.id);
          onClick();
        }}
        className={cardLinkClass}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-base font-semibold leading-snug text-foreground">{row.name}</span>
          <span className="flex flex-shrink-0 items-center gap-2">
            {sponsored && <SponsoredBadge />}
            {showMeasured && (
              <Badge variant="secondary" className="text-xs">
                #{item.rank}
              </Badge>
            )}
            {row.rating != null && row.rating !== "" && (
              <span className="flex items-center text-sm font-medium">
                <Star className="mr-1 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className="sr-only">Rating </span>
                {row.rating}
              </span>
            )}
          </span>
        </div>
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">{meta}</div>}
        {row.location && (
          <div className="mt-2 flex items-center text-sm text-muted-foreground">
            <SpriteIcon name="map-pin" className="mr-1 h-4 w-4 flex-shrink-0" />
            <span>{row.location}</span>
          </div>
        )}
        {showMeasured && item.views24h != null && (
          <div className="mt-2 flex items-center text-xs text-muted-foreground">
            <SpriteIcon name="trending-up" className="mr-1 h-3 w-3" />
            <span>{item.views24h} views today</span>
          </div>
        )}
      </Link>
    </li>
  );
}

function iconFor(Icon: LucideIcon) {
  return <Icon className="h-5 w-5 text-primary" aria-hidden="true" />;
}

export default function MostSearched() {
  const { isAdmin } = useAuth();
  const {
    trending,
    isLoading,
    hasRealData: hasRealTrendingData,
  } = useTrending({ types: TYPES, readScores: isAdmin });
  const { trackEvent } = useAnalytics();

  const track = (contentType: PlaceType, contentId: string) => {
    trackEvent({ eventType: "click", contentType, contentId });
  };

  if (isLoading) {
    return (
      <section className="bg-muted/50 py-16" id="most-searched" aria-busy="true">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <Skeleton className="mx-auto h-9 w-64" />
            <Skeleton className="mx-auto mt-3 h-7 w-full max-w-md" />
          </div>
          {/* The content's own grid, so the swap does not reflow the columns. */}
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i}>
                <Skeleton className="mb-4 h-7 w-40" />
                <div className="space-y-3">
                  {[...Array(3)].map((_, j) => (
                    <Skeleton key={j} className="h-24 w-full rounded-xl" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  const searches = SUGGESTED_SEARCHES.slice(0, 6);
  const restaurants = toItems(trending.restaurants);
  const attractions = toItems(trending.attractions);
  const playgrounds = toItems(trending.playgrounds);
  const noPlaces = restaurants.length === 0 && attractions.length === 0 && playgrounds.length === 0;

  const columnTitle = (noun: string) => (hasRealTrendingData ? `Trending ${noun}` : `Highly rated ${noun}`);

  return (
    <section className="bg-muted/50 py-16" id="most-searched" aria-labelledby="most-searched-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h2 id="most-searched-title" className="text-3xl font-bold text-foreground">
            {hasRealTrendingData ? "Trending now" : "Places to start"}
          </h2>
          <p className="mt-3 text-lg text-muted-foreground">
            {hasRealTrendingData
              ? "Ranked by what people viewed today"
              : "Places rated 4 stars or higher, and a few searches to try"}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          <Column title="Try searching" icon={iconFor(Search)}>
            {searches.map((search) => (
              <li key={search.query}>
                <Link to={`/search?q=${encodeURIComponent(search.query)}`} className={cardLinkClass}>
                  <span className="block text-sm font-medium text-foreground">{search.query}</span>
                  {search.category && (
                    <span className="mt-1 flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {search.category}
                      </Badge>
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </Column>

          {noPlaces && (
            <p className="text-sm text-muted-foreground md:col-span-1 lg:col-span-3">
              No rated places to show right now.{" "}
              <Link to="/restaurants" className="font-medium text-foreground underline underline-offset-4">
                Browse restaurants
              </Link>
            </p>
          )}

          {restaurants.length > 0 && (
            <Column title={columnTitle("restaurants")} icon={iconFor(Utensils)}>
              {restaurants.map((item) => (
                <PlaceCard
                  key={item.row.id}
                  item={item}
                  href={restaurantHref(item.row)}
                  type="restaurant"
                  showMeasured={hasRealTrendingData}
                  onClick={() => track("restaurant", item.row.id)}
                  meta={
                    (item.row.cuisine || item.row.price_range) && (
                      <>
                        {item.row.cuisine && <Badge variant="secondary">{item.row.cuisine}</Badge>}
                        {item.row.price_range && (
                          <span className="font-medium text-muted-foreground">{item.row.price_range}</span>
                        )}
                      </>
                    )
                  }
                />
              ))}
            </Column>
          )}

          {attractions.length > 0 && (
            <Column
              title={columnTitle("attractions")}
              icon={<SpriteIcon name="map-pin" className="h-5 w-5 text-primary" />}
            >
              {attractions.map((item) => (
                <PlaceCard
                  key={item.row.id}
                  item={item}
                  href={attractionHref(item.row)}
                  type="attraction"
                  showMeasured={hasRealTrendingData}
                  onClick={() => track("attraction", item.row.id)}
                  meta={item.row.type && <Badge variant="outline">{item.row.type}</Badge>}
                />
              ))}
            </Column>
          )}

          {playgrounds.length > 0 && (
            <Column title={columnTitle("playgrounds")} icon={iconFor(Baby)}>
              {playgrounds.map((item) => (
                <PlaceCard
                  key={item.row.id}
                  item={item}
                  href={playgroundHref(item.row)}
                  type="playground"
                  showMeasured={hasRealTrendingData}
                  onClick={() => track("playground", item.row.id)}
                  meta={
                    item.row.age_range && (
                      <Badge variant="secondary">Ages: {item.row.age_range}</Badge>
                    )
                  }
                />
              ))}
            </Column>
          )}
        </div>
      </div>
    </section>
  );
}

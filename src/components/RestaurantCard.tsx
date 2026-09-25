import { Link, useLocation } from "react-router-dom";
import { Star, Leaf, Wheat } from "lucide-react";
// map-pin renders once per card and this card renders on nine pages. It is a
// two-shape lucide icon, so inline costs 3 nodes and the sprite costs 2.
//
// Star STAYS INLINE deliberately and so does ChefHat. Per the membership rules
// in scripts/generate-icon-sprite.mjs a sprite instance is always 2 nodes, so a
// single-path icon like star saves nothing - and star is the highest-count icon
// on /restaurants/dietary at 197. ChefHat would save one node per card and
// every sprite symbol ships on every page whether used or not.
import { memo, useState, useMemo, useCallback, useRef } from "react";
import { OptimizedImage } from "@/components/OptimizedImage";
import { SponsoredBadge } from "@/components/SponsoredBadge";
import { FavoriteButton } from "@/components/FavoriteButton";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { usePrefetchRestaurant } from "@/hooks/usePrefetchDetail";
import { useSponsoredImpression } from "@/hooks/useSponsoredImpression";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import {
  formatOpenStatusLine,
  resolveOpenStatus,
  type StoredOpeningHours,
} from "@/lib/restaurantHours";
import { isPrerender } from "@/lib/isPrerender";
import { isStaleOpeningCopy } from "@/lib/restaurantMeta";
import { isNewlyOpened, openingLabel as datedOpeningLabel } from "@/lib/restaurantOpenings";
import { isSponsoredActive, logSponsoredClick } from "@/lib/sponsored";
import { toSafeExternalUrl } from "@/lib/capacitorUtils";

/** A price_range is shown only when it is one to four dollar signs. */
const PRICE_RANGE_RE = /^\${1,4}$/;

const UPCOMING_STATUSES: ReadonlySet<string> = new Set(["opening_soon", "announced"]);

/** "desmoinesregister.com" from a URL, for the Source link's text. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

// WEB-UX-030: each entry carries its own dark pair. The render used to append
// `dark:bg-opacity-20 dark:text-opacity-90`, which are no-ops - an opacity
// modifier needs a colour utility in the same variant to act on, so in dark
// mode these chips kept their LIGHT background and light text, measuring
// 3.02:1 for green-700 on a slate card. text-green-600 was also below AA on
// the light surface (3.30:1), so the vegetarian chip moves to -700 as well.
//
// Chips come ONLY from structured tags passed in `dietaryTags`. They used to be
// inferred by substring over the description, which turned "no vegan options"
// into a Vegan chip. There is no dietary column on restaurants today, so no
// caller passes tags yet and no chip renders; that is the honest state.
const DIETARY_TAGS = {
  vegan: { label: "Vegan", icon: Leaf, className: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" },
  vegetarian: { label: "Vegetarian", icon: Leaf, className: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" },
  "gluten-free": { label: "GF", icon: Wheat, className: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
} as const;

type DietaryTagId = keyof typeof DIETARY_TAGS;

function isDietaryTagId(tag: string): tag is DietaryTagId {
  return Object.prototype.hasOwnProperty.call(DIETARY_TAGS, tag);
}

/**
 * Lifecycle states that override the hours. A place that is closed for good or
 * not open yet never shows an hours line, whatever its `opening` text says.
 */
const LIFECYCLE_LABEL: Record<string, string> = {
  closed: "Permanently closed",
  permanently_closed: "Permanently closed",
  temporarily_closed: "Temporarily closed",
  opening_soon: "Opening soon",
  announced: "Announced",
};

export interface RestaurantCardProps {
  restaurant: {
    id: string;
    slug?: string | null;
    name: string;
    description?: string | null;
    cuisine?: string | null;
    rating?: number | null;
    price_range?: string | null;
    location?: string | null;
    city?: string | null;
    status?: string | null;
    opening?: string | null;
    opening_date?: string | null;
    opening_timeframe?: string | null;
    /** Structured hours, used when the row carries them. No list query selects this yet. */
    hours_json?: StoredOpeningHours | null;
    is_sponsored?: boolean | null;
    sponsored_until?: string | null;
    image_url?: string | null;
    phone?: string | null;
    website?: string | null;
  };
  variant?: "default" | "compact" | "featured";
  /**
   * True for the cards above the fold on first paint, which loads the image
   * eagerly at high fetch priority instead of lazily.
   *
   * WEB-PERF-040. OptimizedImage has always supported this and NO caller in
   * the app passed it, so every image on the site - the LCP element on the
   * hubs included - was loading="lazy" with no priority hint.
   */
  priority?: boolean;
  /**
   * A dated openings line from the caller: "Opened Sep 12", "Opening Oct 2026".
   * Without it the card prints "Opened <date>" itself, only for a place
   * isNewlyOpened() accepts.
   */
  openingLabel?: string;
  /**
   * Where the openings pipeline read about this place. /restaurants/new passes
   * the row's source_url so each opening carries its receipt; other pages
   * leave it out. Only http(s) URLs render.
   */
  sourceUrl?: string | null;
  /** Structured dietary tags ("vegan", "vegetarian", "gluten-free"). Unknown values are ignored. */
  dietaryTags?: readonly string[];
}

function StarRating({ rating }: { rating: number }) {
  const stars = [];
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.3;

  for (let i = 0; i < 5; i++) {
    if (i < fullStars) {
      stars.push(
        <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      );
    } else if (i === fullStars && hasHalf) {
      stars.push(
        <div key={i} className="relative h-3.5 w-3.5">
          <Star className="absolute h-3.5 w-3.5 text-gray-200 dark:text-gray-600" />
          <div className="absolute overflow-hidden w-1/2">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          </div>
        </div>
      );
    } else {
      stars.push(
        <Star key={i} className="h-3.5 w-3.5 text-gray-200 dark:text-gray-600" />
      );
    }
  }
  return <div className="flex items-center gap-0.5" aria-hidden="true">{stars}</div>;
}

function RestaurantCardComponent({
  restaurant,
  variant = "default",
  priority = false,
  openingLabel: openingLabelProp,
  sourceUrl,
  dietaryTags,
}: RestaurantCardProps) {
  const [imageError, setImageError] = useState(false);
  const showImage = restaurant.image_url && !imageError;
  // The featured ring follows the caller's variant only. restaurants.is_featured
  // is set on sponsored rows and outlives the sponsorship (20260902000004), so
  // a lapsed flag gets nothing and an active one gets SponsoredBadge.
  const isFeatured = variant === "featured";
  const location = useLocation();

  // Re-evaluated every minute, so a card loaded at 9:55 PM does not still say
  // "Open until 10 PM" at 10:05. The build-time prerender gets no hours line:
  // "Open until 10 PM" frozen into static HTML is wrong within the hour.
  const now = useMinuteClock();
  const prerendering = isPrerender();
  const lifecycleLabel = restaurant.status ? LIFECYCLE_LABEL[restaurant.status] : undefined;
  const openStatus = useMemo(
    () =>
      lifecycleLabel || prerendering ? null : resolveOpenStatus(restaurant.hours_json, restaurant.opening, now),
    [lifecycleLabel, prerendering, restaurant.hours_json, restaurant.opening, now],
  );

  // "New" is an opening date in the last JUST_OPENED_WINDOW_DAYS, printed as
  // the date itself ("Opened Sep 12"). It used to be a week-old badge read
  // from created_at, the day a scraper found the row, so a place open since
  // 2019 was new the week it was imported.
  const openingLabel = useMemo(() => {
    if (openingLabelProp) return openingLabelProp;
    const row = {
      id: restaurant.id,
      name: restaurant.name,
      status: restaurant.status ?? null,
      opening_date: restaurant.opening_date ?? null,
      opening_timeframe: restaurant.opening_timeframe ?? null,
    };
    return isNewlyOpened(row, now) ? datedOpeningLabel(row, now) ?? undefined : undefined;
  }, [
    openingLabelProp,
    restaurant.id,
    restaurant.name,
    restaurant.status,
    restaurant.opening_date,
    restaurant.opening_timeframe,
    now,
  ]);
  const hoursLine = openStatus ? formatOpenStatusLine(openStatus) : null;
  // "Opening Oct 2026" is more useful than "Opening soon" when we have it.
  const lifecycleChip =
    lifecycleLabel && openingLabel && (restaurant.status === "opening_soon" || restaurant.status === "announced")
      ? openingLabel
      : lifecycleLabel;
  const openingLine = !lifecycleChip || lifecycleChip !== openingLabel ? openingLabel : undefined;

  const chips = useMemo(
    () => (dietaryTags ?? []).map((t) => t.toLowerCase()).filter(isDietaryTagId),
    [dietaryTags],
  );
  // popularity_score is a formula of rating, the featured flag and recency,
  // not a measure of how many people go, so no badge reads it.
  const priceRange = restaurant.price_range && PRICE_RANGE_RE.test(restaurant.price_range.trim())
    ? restaurant.price_range.trim()
    : null;
  // Pre-opening copy ("Coming soon!") on a place that has opened says the
  // opposite of the status line above it.
  const isUpcoming = UPCOMING_STATUSES.has(restaurant.status ?? "");
  const description =
    restaurant.description && (isUpcoming || !isStaleOpeningCopy(restaurant.description))
      ? restaurant.description
      : null;
  const sourceHref = toSafeExternalUrl(sourceUrl);

  const prefetchRestaurant = usePrefetchRestaurant();
  const handleMouseEnter = useCallback(() => {
    prefetchRestaurant(restaurant.slug || restaurant.id);
  }, [prefetchRestaurant, restaurant.slug, restaurant.id]);

  // Sponsored listing (WEB-FEAT-005): active only while not expired.
  const sponsoredActive = isSponsoredActive(restaurant);
  const articleRef = useRef<HTMLElement>(null);
  useSponsoredImpression(articleRef, "restaurant", restaurant.id, sponsoredActive);

  const hoursTone = !openStatus
    ? ""
    : openStatus.status === "open"
      ? "text-emerald-700 dark:text-emerald-400"
      : openStatus.status === "closing-soon"
        ? "text-amber-800 dark:text-amber-300"
        : "text-foreground";

  return (
    /* THE CARD IS NOT AN <a>. The name is the one link, and its ::after
       stretches over the whole card so the card stays clickable (the pattern
       RestaurantOpenings.tsx uses). The Save button sits outside the anchor and
       above the overlay, so there is no interactive element nested in a link,
       and screen readers hear status, price and Sponsored as plain content
       instead of one card-level aria-label that hid them. */
    <article
      ref={articleRef}
      className={`group relative h-full rounded-2xl overflow-hidden border bg-card transition-colors duration-200 hover:border-foreground/30 focus-within:border-foreground/30 ${
        sponsoredActive ? "ring-2 ring-amber-500" : isFeatured ? "ring-2 ring-amber-400/50" : ""
      }`}
    >
      {/* Image */}
      <div className={`relative overflow-hidden ${variant === "compact" ? "h-36" : "h-48"}`}>
        {showImage ? (
          <OptimizedImage
            src={restaurant.image_url!}
            alt=""
            width={640}
            height={192}
            className="transition-transform duration-200 group-hover:scale-105 object-cover"
            containerClassName="absolute inset-0"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            priority={priority}
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted" aria-hidden="true">
            <SpriteIcon name="chef-hat" className="h-10 w-10 text-muted-foreground/60" />
          </div>
        )}

        {/* Top badge: paid placement only. The featured-flag and created_at
            badges are gone; see isFeatured and openingLabel above. */}
        {sponsoredActive && (
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 z-10">
            <SponsoredBadge />
          </div>
        )}
      </div>

      {/* Save sits above the stretched link's overlay (z-20, later stacking). */}
      <div className="absolute top-3 right-3 z-20">
        <FavoriteButton
          contentType="restaurant"
          contentId={restaurant.id}
          itemName={restaurant.name}
          size="icon"
          variant="ghost"
          className="h-11 w-11 rounded-full bg-white/90 hover:bg-white backdrop-blur"
        />
      </div>

      {/* Card Body */}
      <div className="p-4 space-y-2">
        <div className="flex items-start gap-2">
          <h3 className="flex-1 min-w-0 text-lg font-bold leading-tight line-clamp-2">
            <Link
              to={`/restaurants/${restaurant.slug || restaurant.id}`}
              // The detail page's back control returns here, filters and all.
              state={{ from: location.pathname + location.search }}
              className="after:absolute after:inset-0 after:z-10 after:rounded-2xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary focus-visible:after:ring-offset-2"
              onMouseEnter={handleMouseEnter}
              onFocus={handleMouseEnter}
              onClick={() => {
                if (sponsoredActive) logSponsoredClick("restaurant", restaurant.id);
              }}
            >
              {restaurant.name}
            </Link>
          </h3>
          {sponsoredActive && <SponsoredBadge className="mt-0.5 shrink-0" />}
        </div>

        {/* Decision line: status, price, city */}
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
          {lifecycleChip ? (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
              {lifecycleChip}
            </span>
          ) : hoursLine ? (
            <span className={`font-semibold ${hoursTone}`}>{hoursLine}</span>
          ) : null}
          {priceRange && (
            <>
              {(lifecycleChip || hoursLine) && <span aria-hidden="true" className="text-muted-foreground">&middot;</span>}
              <span className="font-semibold text-foreground">{priceRange}</span>
            </>
          )}
          {restaurant.city && (
            <>
              {(lifecycleChip || hoursLine || priceRange) && (
                <span aria-hidden="true" className="text-muted-foreground">&middot;</span>
              )}
              <span className="text-muted-foreground">{restaurant.city}</span>
            </>
          )}
        </p>

        {openingLine && <p className="text-xs font-medium text-muted-foreground">{openingLine}</p>}

        {sourceHref && (
          <p className="relative z-20 text-xs text-muted-foreground">
            <a
              href={sourceHref}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4 hover:text-primary"
            >
              Source: {hostOf(sourceHref)}
            </a>
          </p>
        )}

        {restaurant.cuisine && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <SpriteIcon name="chef-hat" className="h-3.5 w-3.5 shrink-0" />
            <span>{restaurant.cuisine}</span>
          </p>
        )}

        {typeof restaurant.rating === "number" && restaurant.rating > 0 && (
          <div className="flex items-center gap-2">
            <StarRating rating={restaurant.rating} />
            <span className="text-sm font-semibold text-foreground">
              <span className="sr-only">Rated </span>
              {restaurant.rating.toFixed(1)}
              <span className="sr-only"> out of 5 on</span>
              <span className="ml-1 text-xs font-normal text-muted-foreground"> Google</span>
            </span>
          </div>
        )}

        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
            {description}
          </p>
        )}

        {chips.length > 0 && (
          <ul className="flex flex-wrap gap-1" aria-label="Dietary options">
            {chips.map((id) => {
              const tag = DIETARY_TAGS[id];
              return (
                <li key={id} className={`inline-flex items-center gap-1 ${tag.className} text-xs font-medium px-2 py-0.5 rounded-full`}>
                  <tag.icon className="h-3 w-3" aria-hidden="true" />
                  {tag.label}
                </li>
              );
            })}
          </ul>
        )}

        {restaurant.location && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground pt-2 border-t">
            <SpriteIcon name="map-pin" className="h-3.5 w-3.5 shrink-0" />
            <span className="line-clamp-1">{restaurant.location}</span>
          </p>
        )}
      </div>
    </article>
  );
}

export const RestaurantCard = memo(RestaurantCardComponent);
export default RestaurantCard;

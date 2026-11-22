import { Link, useLocation } from "react-router-dom";
import { Star, Leaf, Wheat, Phone, Navigation } from "lucide-react";
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
  businessStatusLabel,
  formatOpenStatusLine,
  resolveOpenStatus,
  type StoredOpeningHours,
} from "@/lib/restaurantHours";
import { isPrerender } from "@/lib/isPrerender";
import { isStaleOpeningCopy } from "@/lib/restaurantMeta";
import { isNewlyOpened, openingLabel as datedOpeningLabel } from "@/lib/restaurantOpenings";
import { isSponsoredActive, logSponsoredClick } from "@/lib/sponsored";
import { toSafeExternalUrl } from "@/lib/capacitorUtils";
import { restaurantCardActions, streetAddress } from "@/lib/restaurantCardActions";
import { isShutRestaurant } from "@/lib/restaurantStatus";

/** Call and Directions: 44px tall, the touch-target floor. */
const ACTION_CLASS =
  "inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

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
    /**
     * Google's business_status, when the caller's select carries it. The only
     * place a temporary closure is recorded (restaurants.status has no value
     * for it), so without it a temporarily closed place shows its hours.
     */
    business_status?: string | null;
    opening?: string | null;
    opening_date?: string | null;
    opening_timeframe?: string | null;
    /**
     * Structured hours, used when the row carries them. `unknown` because the
     * generated row types it as Json (SEO-054); resolveOpenStatus validates
     * every field it reads.
     */
    hours_json?: unknown;
    is_sponsored?: boolean | null;
    sponsored_until?: string | null;
    image_url?: string | null;
    phone?: string | null;
    website?: string | null;
    /** For the Directions action; without them it falls back to a street address. */
    latitude?: number | null;
    longitude?: number | null;
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
  const lifecycleLabel =
    (restaurant.status ? LIFECYCLE_LABEL[restaurant.status] : undefined) ??
    businessStatusLabel(restaurant.business_status);
  const openStatus = useMemo(
    () =>
      lifecycleLabel || prerendering ? null : resolveOpenStatus(restaurant.hours_json as StoredOpeningHours | null, restaurant.opening, now),
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

  // WEB-UX-087. A closed place keeps its row (search keeps a Google
  // CLOSED_PERMANENTLY place on purpose) but reads as closed: a muted image,
  // no stars to recommend it, and no Call.
  const shut = isShutRestaurant(restaurant);
  const { callHref, directionsHref } = restaurantCardActions(restaurant);
  // The city is already on the decision line; the address line keeps the street.
  const street = streetAddress(restaurant.location, restaurant.city);
  const rating = !shut && typeof restaurant.rating === "number" && restaurant.rating > 0 ? restaurant.rating : null;

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
    /* Below sm the card is a row (WEB-UX-087): a 96px thumbnail beside the
       name, status, price, city, cuisine and rating, so three or more fit on
       a 390x844 screen where the stacked card fit about one and a half. From
       sm up it is the stacked card it always was. One tree, restyled, rather
       than two layouts: every card on nine pages would carry both. */
    <article
      ref={articleRef}
      className={`group relative flex items-start gap-3 p-3 sm:block sm:p-0 h-full rounded-2xl overflow-hidden border bg-card transition-colors duration-200 hover:border-foreground/30 focus-within:border-foreground/30 ${
        sponsoredActive ? "ring-2 ring-amber-500" : isFeatured ? "ring-2 ring-amber-400/50" : ""
      }`}
    >
      {/* Image */}
      <div
        className={`relative shrink-0 overflow-hidden h-24 w-24 rounded-xl sm:w-auto sm:rounded-none ${
          variant === "compact" ? "sm:h-36" : "sm:h-48"
        } ${shut ? "opacity-60 grayscale" : ""}`}
      >
        {showImage ? (
          <OptimizedImage
            src={restaurant.image_url!}
            alt=""
            width={640}
            height={192}
            className="transition-transform duration-200 group-hover:scale-105 object-cover"
            containerClassName="absolute inset-0"
            sizes="(max-width: 639px) 96px, (max-width: 1024px) 50vw, 33vw"
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
          // Not on the row's thumbnail, which it would cover; the badge beside
          // the name says the same thing there.
          <div className="absolute top-3 left-3 hidden sm:flex flex-wrap gap-1.5 z-10">
            <SponsoredBadge />
          </div>
        )}
      </div>

      {/* Save sits above the stretched link's overlay (z-20, later stacking). */}
      <div className="absolute top-1 right-1 sm:top-3 sm:right-3 z-20">
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
      <div className="flex-1 min-w-0 space-y-1 sm:space-y-2 sm:p-4">
        {/* pr-11 keeps the name clear of the Save button in the row.
            sm:leading-tight is not redundant: sm:text-lg sets its own line
            height in a later media rule and would undo leading-tight. */}
        <div className="flex items-start gap-2 pr-11 sm:pr-0">
          <h3 className="flex-1 min-w-0 text-base sm:text-lg font-bold leading-tight sm:leading-tight line-clamp-2">
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

        {/* Cuisine and rating share a line in the row and stack on the card. */}
        {(restaurant.cuisine || rating !== null) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:block sm:space-y-2">
            {restaurant.cuisine && (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <SpriteIcon name="chef-hat" className="h-3.5 w-3.5 shrink-0" />
                <span>{restaurant.cuisine}</span>
              </p>
            )}

            {rating !== null && (
              <div className="flex items-center gap-1 sm:gap-2">
                {/* One star in the row, five on the card. */}
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 sm:hidden" aria-hidden="true" />
                <span className="hidden sm:flex">
                  <StarRating rating={rating} />
                </span>
                <span className="text-sm font-semibold text-foreground">
                  <span className="sr-only">Rated </span>
                  {rating.toFixed(1)}
                  <span className="sr-only"> out of 5 on</span>
                  <span className="ml-1 text-xs font-normal text-muted-foreground"> Google</span>
                </span>
              </div>
            )}
          </div>
        )}

        {/* Card only. max-sm:hidden, not "hidden sm:block": line-clamp sets
            display itself and beats a plain "hidden", and sm:block would
            undo the clamp. */}
        {description && (
          <p className="max-sm:hidden text-sm text-muted-foreground leading-relaxed line-clamp-2">
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

        {/* Call and Directions sit above the stretched link (z-20), like the
            Source link, and each renders only when the row has what it needs.
            The street address shares the line on the card; the row leaves it
            out to stay short. */}
        {(street || callHref || directionsHref) && (
          <div className="relative z-20 flex items-center gap-2 pt-1 sm:pt-2 sm:border-t">
            {street && (
              <p className="hidden sm:flex flex-1 min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <SpriteIcon name="map-pin" className="h-3.5 w-3.5 shrink-0" />
                <span className="line-clamp-1">{street}</span>
              </p>
            )}
            {callHref && (
              <a
                href={callHref}
                aria-label={`Call ${restaurant.name}`}
                className={ACTION_CLASS}
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
                Call
              </a>
            )}
            {directionsHref && (
              <a
                href={directionsHref}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Directions to ${restaurant.name}`}
                className={ACTION_CLASS}
              >
                <Navigation className="h-4 w-4" aria-hidden="true" />
                Directions
              </a>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export const RestaurantCard = memo(RestaurantCardComponent);
export default RestaurantCard;

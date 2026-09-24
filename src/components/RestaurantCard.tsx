import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Star, Flame, Leaf, Wheat } from "lucide-react";
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
import { SocialProofBadge } from "@/components/SocialProofBadge";
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
import { STATUS_BADGE } from "@/lib/categoryStyles";
import { isSponsoredActive, logSponsoredClick } from "@/lib/sponsored";

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
    slug?: string;
    name: string;
    description?: string;
    cuisine?: string;
    rating?: number;
    price_range?: string;
    location?: string;
    city?: string;
    status?: string;
    opening?: string;
    /** Structured hours, used when the row carries them. No list query selects this yet. */
    hours_json?: StoredOpeningHours | null;
    is_featured?: boolean;
    is_sponsored?: boolean;
    sponsored_until?: string | null;
    image_url?: string;
    phone?: string;
    website?: string;
    popularity_score?: number;
    created_at?: string;
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
  /** A dated openings line from the openings watch: "Opened Sep 12", "Opening Oct 2026". */
  openingLabel?: string;
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
  openingLabel,
  dietaryTags,
}: RestaurantCardProps) {
  const [imageError, setImageError] = useState(false);
  const showImage = restaurant.image_url && !imageError;
  const isFeatured = variant === "featured" || restaurant.is_featured;

  // Re-evaluated every minute, so a card loaded at 9:55 PM does not still say
  // "Open until 10 PM" at 10:05.
  const now = useMinuteClock();
  const lifecycleLabel = restaurant.status ? LIFECYCLE_LABEL[restaurant.status] : undefined;
  const openStatus = useMemo(
    () => (lifecycleLabel ? null : resolveOpenStatus(restaurant.hours_json, restaurant.opening, now)),
    [lifecycleLabel, restaurant.hours_json, restaurant.opening, now],
  );
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
  const isNew = useMemo(() => {
    if (!restaurant.created_at) return false;
    const daysSince = (Date.now() - new Date(restaurant.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince <= 14;
  }, [restaurant.created_at]);

  const isPopular = typeof restaurant.popularity_score === "number" && restaurant.popularity_score > 70;

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

        {/* Top badges */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 z-10">
          {sponsoredActive && <SponsoredBadge />}
          {!sponsoredActive && isFeatured && (
            <Badge className={`${STATUS_BADGE.featured} border-0 text-xs font-semibold px-2.5 py-0.5`}>
              <SpriteIcon name="sparkles" className="h-3 w-3 mr-1" />
              Featured
            </Badge>
          )}
          {!sponsoredActive && !isFeatured && isNew && (
            <SocialProofBadge type="new" size="sm" />
          )}
        </div>
      </div>

      {/* Save sits above the stretched link's overlay (z-20, later stacking). */}
      <div className="absolute top-3 right-3 z-20">
        <FavoriteButton
          contentType="restaurant"
          contentId={restaurant.id}
          itemName={restaurant.name}
          size="icon"
          variant="ghost"
          className="h-9 w-9 rounded-full bg-white/90 hover:bg-white backdrop-blur"
        />
      </div>

      {/* Card Body */}
      <div className="p-4 space-y-2">
        <div className="flex items-start gap-2">
          <h3 className="flex-1 min-w-0 text-lg font-bold leading-tight line-clamp-2">
            <Link
              to={`/restaurants/${restaurant.slug || restaurant.id}`}
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
          {restaurant.price_range && (
            <>
              {(lifecycleChip || hoursLine) && <span aria-hidden="true" className="text-muted-foreground">&middot;</span>}
              <span className="font-semibold text-foreground">{restaurant.price_range}</span>
            </>
          )}
          {restaurant.city && (
            <>
              {(lifecycleChip || hoursLine || restaurant.price_range) && (
                <span aria-hidden="true" className="text-muted-foreground">&middot;</span>
              )}
              <span className="text-muted-foreground">{restaurant.city}</span>
            </>
          )}
        </p>

        {openingLine && <p className="text-xs font-medium text-muted-foreground">{openingLine}</p>}

        {restaurant.cuisine && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <SpriteIcon name="chef-hat" className="h-3.5 w-3.5 shrink-0" />
            <span>{restaurant.cuisine}</span>
          </p>
        )}

        {(Boolean(restaurant.rating) || isPopular) && (
          <div className="flex items-center justify-between">
            {restaurant.rating ? (
              <div className="flex items-center gap-2">
                <StarRating rating={restaurant.rating} />
                <span className="text-sm font-semibold text-foreground">
                  <span className="sr-only">Rated </span>
                  {restaurant.rating.toFixed(1)}
                  <span className="sr-only"> out of 5</span>
                </span>
              </div>
            ) : (
              <span />
            )}
            {/* WEB-UX-030: text-orange-600 on bg-orange-50 measured 3.35:1.
                orange-700 is 4.88:1 on the same tint. Dark side untouched -
                orange-400 on orange-950 already clears AA. */}
            {isPopular && (
              <Badge variant="outline" className="text-xs border-orange-200 text-orange-700 bg-orange-50 dark:bg-orange-950 dark:border-orange-800 dark:text-orange-400 gap-1">
                <Flame className="h-3 w-3" aria-hidden="true" />
                Popular
              </Badge>
            )}
          </div>
        )}

        {restaurant.description && (
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
            {restaurant.description}
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

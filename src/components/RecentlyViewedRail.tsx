import { Link } from "react-router-dom";
import { X, Calendar, UtensilsCrossed, Landmark } from "lucide-react";
import { useRecentlyViewedFeed } from "@/hooks/useRecentlyViewedFeed";
import type { RecentlyViewedType } from "@/lib/recentlyViewed";
import { cn } from "@/lib/utils";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { OptimizedImage } from "@/components/OptimizedImage";

const TYPE_ICON: Record<RecentlyViewedType, typeof Calendar> = {
  event: Calendar,
  restaurant: UtensilsCrossed,
  attraction: Landmark,
};

/**
 * Homepage "Recently viewed" rail (WEB-FEAT-007).
 *
 * Appears only when the LOCAL store held >= 3 entries at mount (so first-time
 * visitors don't see an empty or near-empty rail). It renders synchronously
 * from that store, so it is there at first paint. A signed-in visitor's server
 * rows merge into a rail that is already showing, but never make one appear
 * after paint: that inserted about 230px above the dashboard (home pass-2 WP3
 * item 10). The rail stays until the entries drop below 3.
 */
const MIN_ENTRIES = 3;

export function RecentlyViewedRail({ limit = 12 }: { limit?: number }) {
  const { entries, localCount, remove } = useRecentlyViewedFeed();

  if (localCount < MIN_ENTRIES || entries.length < MIN_ENTRIES) return null;

  const items = entries.slice(0, limit);

  return (
    <section className="py-6 bg-background" aria-labelledby="recently-viewed-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 mb-4">
          <SpriteIcon name="clock" className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <h2 id="recently-viewed-heading" className="text-lg font-semibold">
            Recently viewed
          </h2>
        </div>
        <ul className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
          {items.map((item) => {
            const Icon = TYPE_ICON[item.type];
            return (
              <li
                key={`${item.type}:${item.id}`}
                className="relative shrink-0 w-44 snap-start group"
              >
                <Link
                  to={item.href}
                  className="block rounded-xl border bg-card overflow-hidden hover:border-primary/50 hover:shadow-sm transition-all"
                >
                  <div className="aspect-video bg-muted overflow-hidden">
                    {item.image_url ? (
                      <OptimizedImage
                        src={item.image_url}
                        alt=""
                        width={176}
                        height={99}
                        containerClassName="w-full h-full"
                        className="object-cover"
                        sizes="176px"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Icon className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="text-sm font-medium line-clamp-2">{item.title}</p>
                    {item.subtitle && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {item.subtitle}
                      </p>
                    )}
                  </div>
                </Link>
                {/* 44px hit area (WP2 item 8) around a 28px visual circle, so
                    the target is tappable without covering the image. Always
                    visible where there is no hover (touch); on hover devices it
                    appears on card hover or keyboard focus. It used to be
                    opacity-0 everywhere, which hid it on phones entirely. */}
                <button
                  type="button"
                  onClick={() => remove(item.id, item.type)}
                  className={cn(
                    "group/remove absolute top-0 right-0 flex h-11 w-11 items-center justify-center rounded-full",
                    "focus-visible:outline-none",
                    "opacity-100 transition-opacity",
                    "[@media(hover:hover)]:opacity-0",
                    "[@media(hover:hover)]:group-hover:opacity-100",
                    "[@media(hover:hover)]:focus-visible:opacity-100",
                  )}
                  aria-label={`Remove ${item.title} from recently viewed`}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-secondary-foreground group-focus-visible/remove:ring-2 group-focus-visible/remove:ring-ring">
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

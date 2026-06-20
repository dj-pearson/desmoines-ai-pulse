import { Link } from "react-router-dom";
import { Clock, X, Calendar, UtensilsCrossed, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRecentlyViewedFeed } from "@/hooks/useRecentlyViewedFeed";
import type { RecentlyViewedType } from "@/lib/recentlyViewed";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<RecentlyViewedType, typeof Calendar> = {
  event: Calendar,
  restaurant: UtensilsCrossed,
  attraction: Landmark,
};

/**
 * Homepage "Recently viewed" rail (WEB-FEAT-007).
 *
 * Appears only once there are >= 3 entries (so first-time/cold-start users
 * don't see an empty or near-empty rail). Renders synchronously from the local
 * store, so it doesn't shift layout after paint.
 */
const MIN_ENTRIES = 3;

export function RecentlyViewedRail({ limit = 12 }: { limit?: number }) {
  const { entries, remove } = useRecentlyViewedFeed();

  if (entries.length < MIN_ENTRIES) return null;

  const items = entries.slice(0, limit);

  return (
    <section className="py-6 bg-background" aria-labelledby="recently-viewed-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
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
                      <img
                        src={item.image_url}
                        alt={item.title}
                        width={176}
                        height={99}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
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
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => remove(item.id, item.type)}
                  className={cn(
                    "absolute top-1.5 right-1.5 h-7 w-7 rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity",
                  )}
                  aria-label={`Remove ${item.title} from recently viewed`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

import { Link } from "react-router-dom";
import { Clock, X, Calendar, UtensilsCrossed, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRecentlyViewedFeed } from "@/hooks/useRecentlyViewedFeed";
import type { RecentlyViewedType } from "@/lib/recentlyViewed";

const TYPE_ICON: Record<RecentlyViewedType, typeof Calendar> = {
  event: Calendar,
  restaurant: UtensilsCrossed,
  attraction: Landmark,
};

/**
 * Full recently-viewed list with per-item remove (WEB-FEAT-007) — the
 * dashboard counterpart to the homepage rail. Shows all stored entries
 * (already capped at 20 / pruned > 30 days by the store).
 */
export function RecentlyViewedList() {
  const { entries, remove, clear } = useRecentlyViewedFeed();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Recently viewed
        </CardTitle>
        {entries.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clear} className="text-xs">
            Clear all
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Items you view will show up here so you can jump back in.
          </p>
        ) : (
          <ul className="divide-y">
            {entries.map((item) => {
              const Icon = TYPE_ICON[item.type];
              return (
                <li key={`${item.type}:${item.id}`} className="flex items-center gap-3 py-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <Link to={item.href} className="min-w-0 flex-1 hover:underline">
                    <span className="block text-sm font-medium truncate">{item.title}</span>
                    {item.subtitle && (
                      <span className="block text-xs text-muted-foreground truncate">{item.subtitle}</span>
                    )}
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(item.id, item.type)}
                    className="h-8 w-8 shrink-0"
                    aria-label={`Remove ${item.title} from recently viewed`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

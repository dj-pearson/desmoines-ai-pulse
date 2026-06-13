import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import type { RecentlyViewedEntry, RecentlyViewedType } from "@/lib/recentlyViewed";
import { Clock, X, Calendar, MapPin, Utensils } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface RecentlyViewedProps {
  /** Max items to render. */
  limit?: number;
  /** Minimum entries before the rail renders at all (rail variant). */
  minEntries?: number;
  className?: string;
  /** "rail" = horizontal homepage rail; "list" = full dashboard list. */
  variant?: "rail" | "list";
}

const TYPE_ICON: Record<RecentlyViewedType, typeof Calendar> = {
  event: Calendar,
  restaurant: Utensils,
  attraction: MapPin,
};

const TYPE_LABEL: Record<RecentlyViewedType, string> = {
  event: "Event",
  restaurant: "Restaurant",
  attraction: "Attraction",
};

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return `${Math.floor(seconds / 604800)}w ago`;
}

export function RecentlyViewed({
  limit = 8,
  minEntries = 3,
  className,
  variant = "rail",
}: RecentlyViewedProps) {
  const { recentlyViewed, clearRecentlyViewed, removeFromRecentlyViewed } =
    useRecentlyViewed();

  if (variant === "list") {
    return (
      <RecentlyViewedList
        items={recentlyViewed.slice(0, limit)}
        total={recentlyViewed.length}
        onRemove={removeFromRecentlyViewed}
        onClear={clearRecentlyViewed}
        className={className}
      />
    );
  }

  // Rail variant: only appears once there's enough history to be useful.
  if (recentlyViewed.length < minEntries) {
    return null;
  }

  const items = recentlyViewed.slice(0, limit);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          Recently Viewed
        </h2>
        <Button variant="ghost" size="sm" onClick={clearRecentlyViewed} className="text-sm">
          Clear
        </Button>
      </div>

      {/* Horizontal rail — keeps a fixed card height so there's no CLS. */}
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        {items.map((item) => (
          <RecentlyViewedCard
            key={`${item.type}:${item.id}`}
            item={item}
            onRemove={removeFromRecentlyViewed}
          />
        ))}
      </div>
    </div>
  );
}

function RecentlyViewedCard({
  item,
  onRemove,
}: {
  item: RecentlyViewedEntry;
  onRemove: (id: string, type: RecentlyViewedType) => void;
}) {
  const Icon = TYPE_ICON[item.type];
  return (
    <Link
      to={item.path}
      className="group relative flex-shrink-0 w-56 snap-start rounded-lg border border-border bg-card overflow-hidden hover:shadow-md transition-all"
    >
      <div className="relative h-32 bg-muted">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon className="h-8 w-8 text-muted-foreground/40" />
          </div>
        )}
        <Button
          variant="secondary"
          size="icon"
          className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove(item.id, item.type);
          }}
          aria-label={`Remove ${item.title} from recently viewed`}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="p-3 space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px] gap-1">
            <Icon className="h-3 w-3" />
            {TYPE_LABEL[item.type]}
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            {formatTimeAgo(item.viewedAt)}
          </span>
        </div>
        <p className="font-medium text-sm line-clamp-2 group-hover:text-primary transition-colors">
          {item.title}
        </p>
        {item.subtitle && (
          <p className="text-xs text-muted-foreground line-clamp-1">{item.subtitle}</p>
        )}
      </div>
    </Link>
  );
}

function RecentlyViewedList({
  items,
  total,
  onRemove,
  onClear,
  className,
}: {
  items: RecentlyViewedEntry[];
  total: number;
  onRemove: (id: string, type: RecentlyViewedType) => void;
  onClear: () => void;
  className?: string;
}) {
  if (items.length === 0) {
    return (
      <div className={cn("text-center py-8", className)}>
        <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Nothing viewed yet</h3>
        <p className="text-muted-foreground text-sm">
          Events, restaurants and attractions you open will show up here for quick resume.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{total} item{total === 1 ? "" : "s"}</p>
        <Button variant="ghost" size="sm" onClick={onClear} className="text-sm">
          Clear All
        </Button>
      </div>
      <div className="space-y-2">
        {items.map((item) => {
          const Icon = TYPE_ICON[item.type];
          return (
            <Link key={`${item.type}:${item.id}`} to={item.path} className="block group">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                <div className="relative w-16 h-16 rounded overflow-hidden flex-shrink-0 bg-muted">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Icon className="h-5 w-5 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors">
                    {item.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-[10px]">
                      {TYPE_LABEL[item.type]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatTimeAgo(item.viewedAt)}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemove(item.id, item.type);
                  }}
                  aria-label={`Remove ${item.title}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// Sidebar variant for quick access (compact list).
export function RecentlyViewedSidebar({ className }: { className?: string }) {
  return <RecentlyViewed variant="list" limit={5} className={className} />;
}

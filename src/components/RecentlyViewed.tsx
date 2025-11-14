import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { Clock, X, Calendar, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { formatEventDateShort } from "@/lib/timezone";
import { cn } from "@/lib/utils";

interface RecentlyViewedProps {
  limit?: number;
  className?: string;
  compact?: boolean;
}

export function RecentlyViewed({
  limit = 5,
  className,
  compact = false,
}: RecentlyViewedProps) {
  const { recentlyViewed, clearRecentlyViewed, removeFromRecentlyViewed } =
    useRecentlyViewed();

  const displayItems = recentlyViewed.slice(0, limit);

  if (displayItems.length === 0) {
    return null;
  }

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return "Just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return `${Math.floor(seconds / 604800)}w ago`;
  };

  if (compact) {
    return (
      <div className={cn("space-y-3", className)}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            Recently Viewed
          </h3>
          {displayItems.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearRecentlyViewed}
              className="text-xs"
            >
              Clear All
            </Button>
          )}
        </div>

        <div className="space-y-2">
          {displayItems.map((item) => (
            <Link
              key={item.id}
              to={`/events/${item.id}`}
              className="block group"
            >
              <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                {item.image_url && (
                  <div className="relative w-16 h-16 rounded overflow-hidden flex-shrink-0">
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors">
                    {item.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {item.category}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatTimeAgo(item.viewedAt)}
                    </span>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeFromRecentlyViewed(item.id);
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </Link>
          ))}
        </div>

        {recentlyViewed.length > limit && (
          <Link to="/profile">
            <Button variant="outline" size="sm" className="w-full">
              View All ({recentlyViewed.length})
            </Button>
          </Link>
        )}
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Recently Viewed Events
          </CardTitle>
          {displayItems.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearRecentlyViewed}
              className="text-sm"
            >
              Clear All
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          {displayItems.map((item) => (
            <Link
              key={item.id}
              to={`/events/${item.id}`}
              className="block group"
            >
              <div className="flex gap-4 p-3 rounded-lg hover:bg-muted/50 transition-all duration-300 hover:shadow-md">
                {item.image_url && (
                  <div className="relative w-24 h-24 rounded overflow-hidden flex-shrink-0">
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    />
                  </div>
                )}

                <div className="flex-1 min-w-0 space-y-2">
                  <div>
                    <h4 className="font-semibold line-clamp-2 group-hover:text-primary transition-colors">
                      {item.title}
                    </h4>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className="text-xs">{item.category}</Badge>
                      <span className="text-xs text-muted-foreground">
                        Viewed {formatTimeAgo(item.viewedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3" />
                      <span className="text-xs">
                        {formatEventDateShort({ date: item.date } as any)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3 w-3" />
                      <span className="text-xs line-clamp-1">
                        {item.venue || item.location}
                      </span>
                    </div>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeFromRecentlyViewed(item.id);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </Link>
          ))}
        </div>

        {recentlyViewed.length > limit && (
          <div className="mt-4">
            <Link to="/profile">
              <Button variant="outline" className="w-full">
                View All Recently Viewed ({recentlyViewed.length})
              </Button>
            </Link>
          </div>
        )}

        {displayItems.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-xs text-muted-foreground text-center">
              Continue planning your perfect Des Moines experience
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Sidebar variant for quick access
export function RecentlyViewedSidebar({ className }: { className?: string }) {
  return <RecentlyViewed limit={5} compact className={className} />;
}

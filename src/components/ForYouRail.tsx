import { Link } from "react-router-dom";
import { RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useForYouRail } from "@/hooks/useForYouRail";

/**
 * Web parity for the iOS HomeView For You rail (IOS-DISCOVER-2026-002).
 * Renders a horizontal scroll of personalized event picks (or "Trending now"
 * fallback for cold-start users with fewer than 5 swipes).
 */
export function ForYouRail() {
  const { recommendations, source, isLoading, refetch } = useForYouRail(12);

  if (recommendations.length === 0 && !isLoading) {
    return null;
  }

  const headerTitle = source === "for-you" ? "For You" : "Trending now";

  return (
    <section
      className="py-6"
      aria-labelledby="for-you-rail-heading"
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between mb-3">
          <h2
            id="for-you-rail-heading"
            className="text-xl font-semibold flex items-center gap-2"
          >
            <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
            {headerTitle}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={refetch}
            disabled={isLoading}
            aria-label="Refresh recommendations"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory">
          {isLoading && recommendations.length === 0
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={`skeleton-${i}`} className="snap-start shrink-0 w-56" aria-hidden="true">
                  <div className="aspect-video w-56 rounded-lg bg-muted animate-pulse motion-reduce:animate-none" />
                  <div className="mt-2 h-4 w-3/4 rounded bg-muted animate-pulse motion-reduce:animate-none" />
                  <div className="mt-1 h-3 w-1/2 rounded bg-muted animate-pulse motion-reduce:animate-none" />
                </div>
              ))
            : recommendations.map((rec) => (
            <Link
              key={rec.id}
              to={`/events/${rec.id}`}
              className="snap-start shrink-0 w-56 group"
            >
              <div className="aspect-video w-56 overflow-hidden rounded-lg bg-muted">
                {rec.image_url ? (
                  <img
                    src={rec.image_url}
                    alt={rec.title ?? "Event"}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                    <Sparkles className="h-8 w-8" aria-hidden="true" />
                  </div>
                )}
              </div>
              <p className="mt-2 font-medium text-sm line-clamp-2 group-hover:text-primary">
                {rec.title}
              </p>
              {rec.recommendation_reason && (
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {rec.recommendation_reason}
                </p>
              )}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

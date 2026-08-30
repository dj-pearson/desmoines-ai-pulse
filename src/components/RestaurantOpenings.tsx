import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { Link } from "react-router-dom";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
// Helper to create slug from restaurant name
const createSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
};
import { useRestaurantOpenings } from "@/hooks/useSupabase";

// WEB-UX-030: every value here carries white text. On the -500/-600 ramp that
// measured 1.92:1 (yellow-500), 2.28:1 (green-500), 3.68:1 (blue-500) and
// 3.30:1 (green-600) against the 4.5:1 AA floor. -700 is the first shade where
// white clears it across all of them; the hues are unchanged.
const statusConfig = {
  opening_soon: { label: "Opening Soon", color: "bg-yellow-700" },
  newly_opened: { label: "Newly Opened", color: "bg-green-700" },
  announced: { label: "Announced", color: "bg-blue-700" },
  open: { label: "Open", color: "bg-green-700" },
  closed: { label: "Closed", color: "bg-red-700" },
};

const getStatusConfig = (status: string | undefined) => {
  if (!status || !statusConfig[status as keyof typeof statusConfig]) {
    return { label: "Status Unknown", color: "bg-gray-600" };
  }
  return statusConfig[status as keyof typeof statusConfig];
};

export function RestaurantOpenings() {
  const { data: restaurants = [], isLoading } = useRestaurantOpenings();

  if (isLoading) {
    return (
      <div className="space-y-4 md:space-y-6">
        <h2 className="text-mobile-title md:text-2xl font-bold">
          New Restaurant Openings
        </h2>
        <div className="mobile-grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="h-48 md:h-56 animate-pulse">
              <div className="mobile-padding">
                <div className="h-4 bg-muted rounded mb-4"></div>
                <div className="h-3 bg-muted rounded mb-2"></div>
                <div className="h-3 bg-muted rounded mb-2"></div>
                <div className="h-6 bg-muted rounded mt-4"></div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (restaurants.length === 0) {
    return (
      <div className="space-y-4 md:space-y-6">
        <h2 className="text-mobile-title md:text-2xl font-bold">
          New Restaurant Openings
        </h2>
        <Card className="mobile-padding">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground text-mobile-body">
              No restaurant openings tracked yet. Check back soon for the latest
              restaurant news!
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Mobile-First Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 md:gap-4">
        <h2 className="text-mobile-title md:text-2xl font-bold">
          New Restaurant Openings
        </h2>
        <p className="text-mobile-caption md:text-sm text-muted-foreground">
          Latest restaurant news from local sources
        </p>
      </div>

      {/* Mobile-Optimized Restaurant Grid */}
      <div className="mobile-grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {restaurants.slice(0, 6).map((restaurant) => {
          const slug = createSlug(restaurant.name);
          return (
            /* THE CARD IS NOT AN <a>, AND IT USED TO BE. This whole Card was
               wrapped in <Link className="block">, with the "Read More" anchor
               below nested inside it. An <a> inside an <a> is invalid, and
               Chromium does not render it as written - it SPLITS the anchors,
               so the prerendered /restaurants shipped three empty
               <a class="block" href="/restaurants/..."></a> elements and
               duplicate hrefs for the same restaurant. An empty link is a WCAG
               2.4.4 failure and a crawler following it lands nowhere.

               The stretched-link pattern keeps both destinations as real links:
               the title's ::after overlays the whole card so the card stays
               clickable, and "Read More" sits above it because it is positioned
               and comes later in the DOM. Card is `relative` for the overlay to
               anchor to. */
            <Card
              key={restaurant.id}
              className="relative smooth-transition hover:shadow-lg hover:scale-[1.02] touch-target"
            >
              <CardHeader className="space-y-3 mobile-padding">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-mobile-body md:text-lg leading-tight flex-1 min-w-0">
                      <Link
                        to={`/restaurants/${slug}`}
                        className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                      >
                        {restaurant.name}
                      </Link>
                    </CardTitle>
                    <Badge
                      variant="secondary"
                      className={`${
                        getStatusConfig(restaurant.status).color
                      } text-white text-xs flex-shrink-0`}
                    >
                      {getStatusConfig(restaurant.status).label}
                    </Badge>
                  </div>

                  {/* Mobile-Optimized Meta Information */}
                  <div className="flex flex-col gap-2 text-mobile-caption text-muted-foreground">
                    {restaurant.location && (
                      <div className="flex items-center gap-2">
                        <SpriteIcon name="map-pin" className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{restaurant.location}</span>
                      </div>
                    )}

                    {restaurant.cuisine && (
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded-full">
                          {restaurant.cuisine}
                        </span>
                      </div>
                    )}

                    {(restaurant.openingDate ||
                      restaurant.openingTimeframe) && (
                      <div className="flex items-center gap-2">
                        <SpriteIcon name="calendar" className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                        {/* Label the date (WEB-QA-004). This chip rendered as a
                            bare "3/30/2026" next to a calendar glyph, which reads
                            ambiguously as the date the listing was added — the
                            footer below genuinely is "Added <date>". */}
                        <span>
                          {restaurant.openingDate
                            ? `Opens ${new Date(
                                restaurant.openingDate
                              ).toLocaleDateString()}`
                            : `Opens ${restaurant.openingTimeframe}`}
                        </span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 md:space-y-4 mobile-padding pt-0">
                  {restaurant.description && (
                    <CardDescription className="text-mobile-caption leading-relaxed line-clamp-3">
                      {restaurant.description}
                    </CardDescription>
                  )}
                  {/* Mobile-Optimized Footer */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t border-border/50">
                    <span className="text-xs text-muted-foreground">
                      Added{" "}
                      {new Date(restaurant.createdAt).toLocaleDateString()}
                    </span>
                    {/* WEB-UX-030: this was text-[#DC143C], the brand crimson
                        hardcoded past the theme, which reads 3.4:1 on the dark
                        card. --primary carries a dark value (5.92:1) and is
                        already the link colour everywhere else. */}
                    {restaurant.sourceUrl && (
                      <a
                        href={restaurant.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative inline-flex items-center gap-1 text-xs text-primary hover:underline smooth-transition touch-target self-start"
                        aria-label={`Read more about ${restaurant.name} (opens in new tab)`}
                      >
                        <span aria-hidden="true">Read More</span>
                        <SpriteIcon name="external-link" className="h-3 w-3" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

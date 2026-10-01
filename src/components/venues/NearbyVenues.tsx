import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useVenues } from "@/hooks/useVenues";
import { currentVenueName, formatMiles, nearby, NEARBY_MILES } from "@/lib/venuePages";
import { hotelsNearPath } from "@/lib/hotelsNear";

interface NearbyVenuesProps {
  latitude?: number | string | null;
  longitude?: number | string | null;
  placeName: string;
  limit?: number;
}

/**
 * Event venues within NEARBY_MILES of a hotel, linking to each venue's
 * upcoming-events page (SEO-013's reciprocal link). Same straight-line rule
 * and the same empty-means-absent behaviour as NearbyHotels.
 */
export function NearbyVenues({ latitude, longitude, placeName, limit = 5 }: NearbyVenuesProps) {
  const { data: venues } = useVenues();
  const near = nearby({ latitude, longitude }, venues ?? [], { limit });
  if (near.length === 0) return null;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Event venues near {placeName}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <ul className="space-y-1">
          {near.map(({ item, miles }) => {
            const name = currentVenueName(item.name);
            return (
              <li key={item.id}>
                <Link
                  to={`/music/venues/${item.slug}`}
                  className="flex items-center justify-between gap-3 rounded-lg p-2 text-sm hover:bg-muted/50"
                >
                  <span>What's on at {name}</span>
                  <span className="shrink-0 text-muted-foreground">{formatMiles(miles)}</span>
                </Link>
                {/* SEO-045: every hotel near this venue, so a reader comparing
                    this hotel can see the others by the same measure. */}
                <Link
                  to={hotelsNearPath(item.slug)}
                  className="inline-flex min-h-11 items-center px-2 text-xs font-medium text-primary hover:underline"
                >
                  Other hotels near {name}
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">Straight-line distance, within {NEARBY_MILES} miles.</p>
      </CardContent>
    </Card>
  );
}

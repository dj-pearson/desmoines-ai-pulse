import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useHotelPins } from "@/hooks/useHotels";
import { formatMiles, nearby, NEARBY_MILES } from "@/lib/venuePages";

interface NearbyHotelsProps {
  latitude?: number | string | null;
  longitude?: number | string | null;
  /** What the distances are measured from, e.g. "Wells Fargo Arena". */
  placeName: string;
  limit?: number;
}

/**
 * Hotels within NEARBY_MILES of a place, nearest first (SEO-013).
 *
 * The distance is a straight line between two stored coordinates and the
 * card says so. It is not a walking route, and nothing here calls a hotel
 * walkable. Renders nothing when there is no origin or no hotel in range,
 * so an empty card never ships to a crawler.
 */
export function NearbyHotels({ latitude, longitude, placeName, limit = 5 }: NearbyHotelsProps) {
  const { data: hotels } = useHotelPins();
  const near = nearby({ latitude, longitude }, hotels ?? [], { limit });
  if (near.length === 0) return null;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Hotels near {placeName}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <ul className="space-y-1">
          {near.map(({ item, miles }) => (
            <li key={item.id}>
              <Link
                to={`/stay/${item.slug}`}
                className="flex items-center justify-between gap-3 rounded-lg p-2 text-sm hover:bg-muted/50"
              >
                <span>{item.name}</span>
                <span className="shrink-0 text-muted-foreground">{formatMiles(miles)}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Straight-line distance, within {NEARBY_MILES} miles. Check the route before you walk it.
        </p>
      </CardContent>
    </Card>
  );
}

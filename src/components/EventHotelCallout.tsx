import { useEventHotels } from "@/hooks/useHotels";
import { NearbyHotels } from "@/components/venues/NearbyHotels";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";
import { Link } from "react-router-dom";
import { Database } from "@/integrations/supabase/types";
import AffiliateDisclosureBanner from "@/components/AffiliateDisclosureBanner";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

type Hotel = Database["public"]["Tables"]["hotels"]["Row"];

interface EventHotelCalloutProps {
  eventId: string;
  /** Kept for call-site compatibility; the fallback is by distance now. */
  eventArea?: string;
  /** Venue coordinates for the NearbyHotels fallback. */
  latitude?: number | string | null;
  longitude?: number | string | null;
  /** What NearbyHotels measures from, e.g. "Wells Fargo Arena". */
  placeName?: string;
}

function HotelMiniCard({ hotel, distance, notes }: { hotel: Hotel; distance?: number; notes?: string }) {
  const bookUrl = hotel.affiliate_url || hotel.website;
  const fullStars = hotel.star_rating ? Math.floor(hotel.star_rating) : 0;

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex gap-3">
          {/* Image or placeholder */}
          <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
            {hotel.image_url ? (
              <img src={hotel.image_url} alt={hotel.name} width={80} height={80} className="w-full h-full object-cover" loading="lazy" decoding="async" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#2D1B69] to-[#DC143C] flex items-center justify-center" role="img" aria-label={`No image available for ${hotel.name}`}>
                <SpriteIcon name="building-2" className="h-6 w-6 text-white/70" />
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0 space-y-1">
            <Link to={`/stay/${hotel.slug}`} className="hover:underline">
              <h4 className="font-semibold text-sm line-clamp-1">{hotel.name}</h4>
            </Link>

            {/* Stars */}
            {fullStars > 0 && (
              <div className="flex items-center gap-0.5">
                {Array.from({ length: fullStars }).map((_, i) => (
                  <Star key={i} className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
            )}

            {/* Distance / notes */}
            {(distance || notes) && (
              <p className="text-xs text-muted-foreground">
                {notes || (distance ? `${distance} mi from venue` : "")}
              </p>
            )}

            {/* Price and book */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {hotel.price_range && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">{hotel.price_range}</Badge>
                )}
                {hotel.avg_nightly_rate && (
                  <span className="text-xs text-muted-foreground">~${hotel.avg_nightly_rate}/night</span>
                )}
              </div>
              {bookUrl && (
                <a
                  href={bookUrl}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"
                >
                  Book <SpriteIcon name="external-link" className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The one hotel section on event detail (events plan WP8 item 9).
 *
 * Hotels an editor linked to this event come first. Without any, it falls back
 * to NearbyHotels: real distances from the venue. The old fallback was the
 * site's featured hotels under "Make It a Weekend", which put the same three
 * downtown hotels on a Waukee barn dance, and the page also rendered
 * NearbyHotels in the sidebar, so an event could show two hotel lists.
 * The caller renders this only while the event is upcoming.
 */
export default function EventHotelCallout({
  eventId,
  latitude,
  longitude,
  placeName = "this event",
}: EventHotelCalloutProps) {
  const { hotels: linkedHotels, isLoading } = useEventHotels(eventId);

  if (isLoading) return null;
  if (linkedHotels.length === 0) {
    return (
      <div className="mt-8">
        <NearbyHotels latitude={latitude} longitude={longitude} placeName={placeName} limit={3} />
      </div>
    );
  }
  const hotelsToShow = linkedHotels;

  return (
    <section className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <SpriteIcon name="building-2" className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">
          Stay Nearby
        </h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Hotels near this event venue
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {hotelsToShow.map((hotel) => (
          <HotelMiniCard
            key={hotel.id}
            hotel={hotel}
            distance={hotel.distance_miles}
            notes={hotel.notes}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-col items-center gap-2">
        <Link
          to="/stay"
          className="text-sm text-primary hover:text-primary/80 font-medium"
        >
          View all hotels &rarr;
        </Link>
        <AffiliateDisclosureBanner variant="inline" />
      </div>
    </section>
  );
}

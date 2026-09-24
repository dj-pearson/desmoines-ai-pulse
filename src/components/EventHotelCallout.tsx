import { useEventHotels } from "@/hooks/useHotels";
import { NearbyHotels } from "@/components/venues/NearbyHotels";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";
import { Link } from "react-router-dom";
import { Database } from "@/integrations/supabase/types";
import AffiliateDisclosureBanner from "@/components/AffiliateDisclosureBanner";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { hotelRateLabel, resolveBooking } from "@/lib/hotelBooking";

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
  /**
   * The venue slug /stay?near= understands (a `venues` slug). When given,
   * both the linked-hotels list and the NearbyHotels fallback end with
   * "See all hotels near X" (plan-stay WP2 item 7 / hand-off).
   */
  nearSlug?: string | null;
}

function HotelMiniCard({ hotel, distance, notes }: { hotel: Hotel; distance?: number; notes?: string }) {
  // resolveBooking puts both URLs through safeWebUrl, so a javascript: or
  // relative value in either column renders no link, and only an affiliate
  // link is marked sponsored.
  const booking = resolveBooking(hotel);
  const rateLabel = hotelRateLabel(hotel.avg_nightly_rate);
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
              <div className="w-full h-full bg-muted flex items-center justify-center" role="img" aria-label={`No image available for ${hotel.name}`}>
                <SpriteIcon name="building-2" className="h-6 w-6 text-muted-foreground" />
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

            {/* Rate is a seeded, typical figure: worded as one, never summed. */}
            {rateLabel && <p className="text-xs text-muted-foreground">{rateLabel}</p>}

            {/* Price band and booking link */}
            <div className="flex flex-wrap items-center justify-between gap-x-2">
              {hotel.price_range ? (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{hotel.price_range}</Badge>
              ) : (
                <span />
              )}
              {booking && (
                <a
                  href={booking.href}
                  target="_blank"
                  rel={booking.rel}
                  data-affiliate={booking.isAffiliate ? "true" : "false"}
                  className="inline-flex min-h-11 items-center gap-1 px-1 text-xs font-medium text-primary hover:text-primary/80"
                >
                  {booking.label} <SpriteIcon name="external-link" className="h-3 w-3" />
                  <span className="sr-only"> (opens in a new tab)</span>
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
  nearSlug = null,
}: EventHotelCalloutProps) {
  const { hotels: linkedHotels, isLoading } = useEventHotels(eventId);

  if (isLoading) return null;
  if (linkedHotels.length === 0) {
    return (
      <div className="mt-8">
        <NearbyHotels
          latitude={latitude}
          longitude={longitude}
          placeName={placeName}
          limit={3}
          nearSlug={nearSlug}
        />
      </div>
    );
  }
  const hotelsToShow = linkedHotels;
  const anyAffiliate = hotelsToShow.some((hotel) => resolveBooking(hotel)?.isAffiliate === true);

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
        {nearSlug ? (
          <Link
            to={`/stay?near=${encodeURIComponent(nearSlug)}`}
            className="inline-flex min-h-11 items-center text-sm text-primary hover:text-primary/80 font-medium"
          >
            See all hotels near {placeName} &rarr;
          </Link>
        ) : (
          <Link
            to="/stay"
            className="inline-flex min-h-11 items-center text-sm text-primary hover:text-primary/80 font-medium"
          >
            View all hotels &rarr;
          </Link>
        )}
        {anyAffiliate && <AffiliateDisclosureBanner variant="inline" />}
      </div>
    </section>
  );
}

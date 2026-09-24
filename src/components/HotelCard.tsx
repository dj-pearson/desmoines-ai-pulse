import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";
import { Database } from "@/integrations/supabase/types";
import { STATUS_BADGE } from "@/lib/categoryStyles";
import { hotelRateLabel, resolveBooking } from "@/lib/hotelBooking";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

type Hotel = Database["public"]["Tables"]["hotels"]["Row"];

interface HotelCardProps {
  hotel: Hotel;
  variant?: "default" | "compact" | "featured";
  showBookButton?: boolean;
  /**
   * "1.2 mi from Wells Fargo Arena (straight line)" when the list is sorted by
   * distance to a place (plan-stay WP2 item 7). Omitted otherwise.
   */
  distanceLabel?: string;
}

function renderStars(rating: number | null) {
  if (!rating) return null;
  const stars = [];
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;

  for (let i = 0; i < fullStars; i++) {
    stars.push(<Star key={i} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />);
  }
  if (hasHalf) {
    stars.push(<Star key="half" className="h-3.5 w-3.5 fill-yellow-400/50 text-yellow-400" />);
  }
  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={`${rating} stars`}>
      {stars}
    </div>
  );
}

export default function HotelCard({
  hotel,
  variant = "default",
  showBookButton = true,
  distanceLabel,
}: HotelCardProps) {
  const imageHeight = variant === "compact" ? "h-36" : variant === "featured" ? "h-56" : "h-48";
  // One booking truth (plan-stay WP2 item 4): only an http(s) URL renders, an
  // affiliate link says whose it is, and a plain website is not "sponsored".
  const booking = resolveBooking(hotel);
  const rateLabel = hotelRateLabel(hotel.avg_nightly_rate);

  return (
    <Card className="group overflow-hidden transition-shadow duration-200 hover:shadow-md">
      <Link to={`/stay/${hotel.slug}`} className="block">
        <div className={`relative ${imageHeight} overflow-hidden bg-muted`}>
          {hotel.image_url ? (
            <img
              src={hotel.image_url}
              alt={hotel.name}
              width={640}
              height={192}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              role="img"
              aria-label={`No image available for ${hotel.name}`}
            >
              <SpriteIcon name="building-2" className="h-12 w-12 text-muted-foreground" />
            </div>
          )}

          {hotel.price_range && (
            <Badge className="absolute top-3 right-3 bg-black/70 text-white border-0 text-xs">
              {hotel.price_range}
            </Badge>
          )}

          {hotel.is_featured && (
            <Badge className={`absolute top-3 left-3 ${STATUS_BADGE.featured} border-0 text-xs`}>
              Featured
            </Badge>
          )}
        </div>
      </Link>

      <CardContent className="p-4">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <Link to={`/stay/${hotel.slug}`} className="hover:underline">
              <h3 className="font-semibold text-sm line-clamp-1">{hotel.name}</h3>
            </Link>
            {renderStars(hotel.star_rating)}
          </div>

          {(hotel.chain_name || hotel.brand_parent) && (
            <p className="text-xs text-muted-foreground">
              {hotel.chain_name || hotel.brand_parent}
              {hotel.chain_name && hotel.brand_parent && hotel.chain_name !== hotel.brand_parent && (
                <span> by {hotel.brand_parent}</span>
              )}
            </p>
          )}

          {hotel.area && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <SpriteIcon name="map-pin" className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{hotel.area}</span>
            </div>
          )}

          {distanceLabel && (
            <p className="text-xs font-medium">
              {distanceLabel}
            </p>
          )}

          {hotel.short_description && (
            <p className="text-xs text-muted-foreground line-clamp-2">{hotel.short_description}</p>
          )}

          {hotel.amenities && hotel.amenities.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {hotel.amenities.slice(0, 4).map((amenity) => (
                <Badge key={amenity} variant="outline" className="text-[10px] px-1.5 py-0">
                  {amenity}
                </Badge>
              ))}
              {hotel.amenities.length > 4 && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  +{hotel.amenities.length - 4}
                </Badge>
              )}
            </div>
          )}

          {/* Rate and booking. The rate is a seeded, unrefreshed figure, so it
              is worded as typical rather than as a price (WP2 item 5). */}
          <div className="pt-2 border-t space-y-1">
            <p className="text-xs text-muted-foreground">
              {rateLabel ?? "Check the hotel for current rates"}
            </p>

            {showBookButton && booking && (
              <div className="flex flex-wrap items-center justify-between gap-x-3">
                <a
                  href={booking.href}
                  target="_blank"
                  rel={booking.rel}
                  className="-ml-3 inline-flex min-h-11 items-center gap-1 rounded-md px-3 text-xs font-medium text-primary hover:text-primary/80 hover:underline"
                >
                  {booking.label}
                  <SpriteIcon name="external-link" className="h-3 w-3" />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
                {booking.isAffiliate && (
                  <span className="text-[11px] text-muted-foreground">Affiliate link</span>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

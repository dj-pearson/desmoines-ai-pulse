import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, MapPin, Wifi, Car, Coffee, Dumbbell, PawPrint, Building2, ExternalLink } from "lucide-react";
import { Database } from "@/integrations/supabase/types";

type Hotel = Database["public"]["Tables"]["hotels"]["Row"];

interface HotelCardProps {
  hotel: Hotel;
  variant?: "default" | "compact" | "featured";
  showBookButton?: boolean;
}

const amenityIcons: Record<string, React.ElementType> = {
  "Pool": Wifi,
  "Fitness Center": Dumbbell,
  "Free Breakfast": Coffee,
  "Free Parking": Car,
  "Pet Friendly": PawPrint,
};

const typeGradients: Record<string, string> = {
  "Hotel": "from-blue-600 to-indigo-500",
  "Boutique Hotel": "from-purple-600 to-pink-500",
  "Motel": "from-teal-600 to-cyan-500",
  "Resort": "from-emerald-600 to-teal-500",
  "B&B": "from-orange-600 to-amber-500",
  "Extended Stay": "from-slate-600 to-gray-500",
};

function getGradient(type?: string | null): string {
  if (type && typeGradients[type]) return typeGradients[type];
  return "from-[#2D1B69] to-[#DC143C]";
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
  return <div className="flex items-center gap-0.5">{stars}</div>;
}

export default function HotelCard({ hotel, variant = "default", showBookButton = true }: HotelCardProps) {
  const imageHeight = variant === "compact" ? "h-36" : variant === "featured" ? "h-56" : "h-48";
  const bookUrl = hotel.affiliate_url || hotel.website;

  return (
    <Card className="group overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
      <Link to={`/stay/${hotel.slug}`} className="block">
        <div className={`relative ${imageHeight} overflow-hidden`}>
          {hotel.image_url ? (
            <img
              src={hotel.image_url}
              alt={hotel.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${getGradient(hotel.hotel_type)} flex items-center justify-center`}>
              <Building2 className="h-12 w-12 text-white/70" />
            </div>
          )}

          {/* Price range badge */}
          {hotel.price_range && (
            <Badge className="absolute top-3 right-3 bg-black/70 text-white border-0 text-xs">
              {hotel.price_range}
            </Badge>
          )}

          {/* Featured badge */}
          {hotel.is_featured && (
            <Badge className="absolute top-3 left-3 bg-amber-500 text-white border-0 text-xs">
              Featured
            </Badge>
          )}

          {/* Hover CTA */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-end justify-center pb-4">
            <span className="text-white text-sm font-medium opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300 bg-black/60 px-4 py-1.5 rounded-full">
              View Hotel Details
            </span>
          </div>
        </div>
      </Link>

      <CardContent className="p-4">
        <div className="space-y-2">
          {/* Name and star rating */}
          <div className="flex items-start justify-between gap-2">
            <Link to={`/stay/${hotel.slug}`} className="hover:underline">
              <h3 className="font-semibold text-sm line-clamp-1">{hotel.name}</h3>
            </Link>
            {renderStars(hotel.star_rating)}
          </div>

          {/* Chain name */}
          {hotel.chain_name && (
            <p className="text-xs text-muted-foreground">{hotel.chain_name}</p>
          )}

          {/* Area / location */}
          {hotel.area && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{hotel.area}</span>
            </div>
          )}

          {/* Short description */}
          {hotel.short_description && (
            <p className="text-xs text-muted-foreground line-clamp-2">{hotel.short_description}</p>
          )}

          {/* Amenities preview */}
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

          {/* Price and book button */}
          <div className="flex items-center justify-between pt-2 border-t">
            {hotel.avg_nightly_rate ? (
              <span className="text-sm font-semibold">
                From ${hotel.avg_nightly_rate}<span className="text-xs font-normal text-muted-foreground">/night</span>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Contact for rates</span>
            )}

            {showBookButton && bookUrl && (
              <a
                href={bookUrl}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                Book Now
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

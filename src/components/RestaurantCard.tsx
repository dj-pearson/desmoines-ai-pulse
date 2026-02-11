import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { ChefHat, Star, MapPin, Flame, Sparkles } from "lucide-react";
import { useState } from "react";

interface RestaurantCardProps {
  restaurant: {
    id: string;
    slug?: string;
    name: string;
    description?: string;
    cuisine?: string;
    rating?: number;
    price_range?: string;
    location?: string;
    city?: string;
    status?: string;
    is_featured?: boolean;
    image_url?: string;
    phone?: string;
    website?: string;
    popularity_score?: number;
  };
  variant?: "default" | "compact" | "featured";
}

const cuisineGradients: Record<string, string> = {
  Italian: "from-red-600 to-orange-500",
  Mexican: "from-green-600 to-yellow-500",
  Chinese: "from-red-700 to-amber-500",
  Japanese: "from-pink-600 to-red-400",
  Thai: "from-orange-500 to-yellow-400",
  Indian: "from-orange-600 to-red-500",
  American: "from-blue-600 to-red-500",
  French: "from-blue-500 to-indigo-600",
  Mediterranean: "from-sky-500 to-emerald-400",
  Korean: "from-rose-500 to-orange-400",
  Vietnamese: "from-emerald-500 to-lime-400",
  BBQ: "from-amber-700 to-red-600",
  Seafood: "from-cyan-500 to-blue-600",
  Pizza: "from-red-500 to-yellow-500",
  Steakhouse: "from-stone-700 to-red-800",
  default: "from-[#2D1B69] to-[#DC143C]",
};

function getGradient(cuisine?: string): string {
  if (!cuisine) return cuisineGradients.default;
  for (const [key, value] of Object.entries(cuisineGradients)) {
    if (cuisine.toLowerCase().includes(key.toLowerCase())) return value;
  }
  return cuisineGradients.default;
}

function StarRating({ rating }: { rating: number }) {
  const stars = [];
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.3;

  for (let i = 0; i < 5; i++) {
    if (i < fullStars) {
      stars.push(
        <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      );
    } else if (i === fullStars && hasHalf) {
      stars.push(
        <div key={i} className="relative h-3.5 w-3.5">
          <Star className="absolute h-3.5 w-3.5 text-gray-200" />
          <div className="absolute overflow-hidden w-1/2">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          </div>
        </div>
      );
    } else {
      stars.push(
        <Star key={i} className="h-3.5 w-3.5 text-gray-200" />
      );
    }
  }
  return <div className="flex items-center gap-0.5">{stars}</div>;
}

export default function RestaurantCard({ restaurant, variant = "default" }: RestaurantCardProps) {
  const [imageError, setImageError] = useState(false);
  const gradient = getGradient(restaurant.cuisine);
  const showImage = restaurant.image_url && !imageError;
  const isFeatured = variant === "featured" || restaurant.is_featured;

  return (
    <Link
      to={`/restaurants/${restaurant.slug || restaurant.id}`}
      className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-2xl"
      aria-label={`View ${restaurant.name} - ${restaurant.cuisine || "Restaurant"} in ${restaurant.city || "Des Moines"}`}
    >
      <article
        className={`relative h-full rounded-2xl overflow-hidden border bg-card transition-all duration-300 group-hover:shadow-xl group-hover:-translate-y-1.5 ${
          isFeatured ? "ring-2 ring-amber-400/50 shadow-lg" : "shadow-sm"
        }`}
      >
        {/* Image / Gradient Header */}
        <div className={`relative overflow-hidden ${variant === "compact" ? "h-36" : "h-48"}`}>
          {showImage ? (
            <img
              src={restaurant.image_url}
              alt={`${restaurant.name} - ${restaurant.cuisine || "Restaurant"} in Des Moines`}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              loading="lazy"
              decoding="async"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`}>
              <div className="absolute inset-0 opacity-10">
                <div className="absolute top-4 right-4 w-24 h-24 border-2 border-white/30 rounded-full" />
                <div className="absolute bottom-4 left-4 w-16 h-16 border-2 border-white/20 rounded-full" />
              </div>
            </div>
          )}

          {/* Dark overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

          {/* Top badges */}
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 z-10">
            {isFeatured && (
              <Badge className="bg-amber-500 text-white border-0 shadow-md text-xs font-semibold px-2.5 py-0.5">
                <Sparkles className="h-3 w-3 mr-1" />
                Featured
              </Badge>
            )}
            {restaurant.status === "open" && (
              <Badge className="bg-emerald-500 text-white border-0 shadow-md text-xs font-semibold px-2.5 py-0.5">
                <span className="relative flex h-2 w-2 mr-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                </span>
                Open Now
              </Badge>
            )}
          </div>

          {/* Price badge top-right */}
          {restaurant.price_range && (
            <div className="absolute top-3 right-3 z-10">
              <Badge variant="secondary" className="bg-white/90 backdrop-blur-sm text-gray-800 border-0 shadow-md font-bold text-xs px-2.5">
                {restaurant.price_range}
              </Badge>
            </div>
          )}

          {/* Bottom overlay content */}
          <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
            <h3 className="text-white font-bold text-lg leading-tight line-clamp-2 drop-shadow-lg">
              {restaurant.name}
            </h3>
            {restaurant.cuisine && (
              <div className="flex items-center gap-1.5 mt-1">
                <ChefHat className="h-3.5 w-3.5 text-white/80" />
                <span className="text-white/90 text-sm font-medium">
                  {restaurant.cuisine}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Card Body */}
        <div className="p-4 space-y-3">
          {/* Rating + Price Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {restaurant.rating ? (
                <>
                  <StarRating rating={restaurant.rating} />
                  <span className="text-sm font-semibold text-gray-800">
                    {restaurant.rating.toFixed(1)}
                  </span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">No rating yet</span>
              )}
            </div>
            {restaurant.popularity_score && restaurant.popularity_score > 70 && (
              <Badge variant="outline" className="text-xs border-orange-200 text-orange-600 bg-orange-50 gap-1">
                <Flame className="h-3 w-3" />
                Popular
              </Badge>
            )}
          </div>

          {/* Description */}
          {restaurant.description && (
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
              {restaurant.description}
            </p>
          )}

          {/* Location */}
          {(restaurant.location || restaurant.city) && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1 border-t border-gray-100">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="line-clamp-1">
                {restaurant.location || restaurant.city}
              </span>
            </div>
          )}
        </div>

        {/* Hover CTA strip */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-r from-[#2D1B69] to-[#DC143C] text-white text-center py-2 text-sm font-medium translate-y-full group-hover:translate-y-0 transition-transform duration-300">
          View Restaurant Details
        </div>
      </article>
    </Link>
  );
}

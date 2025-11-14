import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChefHat, Star, DollarSign } from "lucide-react";

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
    status?: string;
    is_featured?: boolean;
  };
}

export default function RestaurantCard({ restaurant }: RestaurantCardProps) {
  return (
    <Link
      to={`/restaurants/${restaurant.slug || restaurant.id}`}
      className="block hover:scale-105 transition-transform duration-200"
    >
      <Card className="h-full hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-lg leading-tight line-clamp-2">
              {restaurant.name}
            </CardTitle>
            <div className="flex items-center gap-1 shrink-0">
              {restaurant.status === "open" && (
                <Badge className="bg-green-500 text-white hover:bg-green-600">
                  Open Now
                </Badge>
              )}
              {restaurant.status === "closed" && (
                <Badge variant="secondary" className="text-muted-foreground">
                  Closed
                </Badge>
              )}
              {restaurant.is_featured && (
                <Badge className="bg-[#DC143C] text-white hover:bg-[#DC143C]/90">
                  Featured
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {restaurant.cuisine && (
              <div className="flex items-center gap-1">
                <ChefHat className="h-4 w-4" />
                <span className="line-clamp-1">
                  {restaurant.cuisine}
                </span>
              </div>
            )}
            {restaurant.rating && (
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <span>{restaurant.rating}</span>
              </div>
            )}
            {restaurant.price_range && (
              <div className="flex items-center gap-1">
                <DollarSign className="h-4 w-4" />
                <span className="font-medium text-green-600">
                  {restaurant.price_range}
                </span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <CardDescription className="line-clamp-3 mb-3">
            {restaurant.description}
          </CardDescription>
          {restaurant.location && (
            <p className="text-sm text-muted-foreground line-clamp-1">
              📍 {restaurant.location}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

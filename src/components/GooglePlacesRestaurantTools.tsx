import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  MapPin,
  Search,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Plus,
  RefreshCw,
  Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface GooglePlacesResult {
  place_id: string;
  name: string;
  formatted_address: string;
  business_status: string;
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  types: string[];
  opening_hours?: {
    open_now: boolean;
  };
  photos?: Array<{
    photo_reference: string;
    height: number;
    width: number;
  }>;
  formatted_phone_number?: string;
  website?: string;
  cuisine_type?: string;
}

interface RestaurantStatus {
  id: string;
  name: string;
  current_status: string;
  google_status: string;
  needs_update: boolean;
}

export default function GooglePlacesRestaurantTools() {
  const [searchLocation, setSearchLocation] = useState("Des Moines, IA");
  const [searchRadius, setSearchRadius] = useState("5000");
  const [newRestaurants, setNewRestaurants] = useState<GooglePlacesResult[]>(
    []
  );
  const [closedRestaurants, setClosedRestaurants] = useState<
    RestaurantStatus[]
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCheckingClosed, setIsCheckingClosed] = useState(false);
  const [searchResults, setSearchResults] = useState<string>("");
  const { toast } = useToast();

  const searchNewRestaurants = async () => {
    if (!searchLocation.trim()) {
      toast({
        title: "Error",
        description: "Please enter a search location",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    setSearchResults("");

    try {
      // Call Supabase Edge Function for Google Places search
      const { data, error } = await supabase.functions.invoke(
        "search-new-restaurants",
        {
          body: {
            location: searchLocation,
            radius: parseInt(searchRadius),
          },
        }
      );

      if (error) throw error;

      if (data?.restaurants) {
        setNewRestaurants(data.restaurants);
        setSearchResults(`Found ${data.restaurants.length} new restaurants`);
        toast({
          title: "Search Complete",
          description: `Found ${data.restaurants.length} potential new restaurants`,
        });
      } else {
        setSearchResults("No new restaurants found");
        toast({
          title: "Search Complete",
          description: "No new restaurants found in the area",
        });
      }
    } catch (error) {
      console.error("Error searching restaurants:", error);
      setSearchResults("Error occurred during search");
      toast({
        title: "Search Failed",
        description:
          "Failed to search for new restaurants. Make sure Edge Functions are deployed.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const checkClosedRestaurants = async () => {
    setIsCheckingClosed(true);

    try {
      // Get all restaurants from database
      const { data: restaurants, error: fetchError } = await supabase
        .from("restaurants")
        .select("id, name, google_place_id, status")
        .neq("status", "closed");

      if (fetchError) throw fetchError;

      // Call Supabase Edge Function to check status
      const { data, error } = await supabase.functions.invoke(
        "check-restaurant-status",
        {
          body: {
            restaurants: restaurants || [],
          },
        }
      );

      if (error) throw error;

      if (data?.closedRestaurants) {
        setClosedRestaurants(data.closedRestaurants);
        toast({
          title: "Status Check Complete",
          description: `Found ${data.closedRestaurants.length} restaurants that may be closed`,
        });
      } else {
        setClosedRestaurants([]);
        toast({
          title: "Status Check Complete",
          description: "All restaurants appear to be open",
        });
      }
    } catch (error) {
      console.error("Error checking restaurant status:", error);
      toast({
        title: "Status Check Failed",
        description:
          "Failed to check restaurant status. Make sure Edge Functions are deployed.",
        variant: "destructive",
      });
    } finally {
      setIsCheckingClosed(false);
    }
  };

  const addRestaurant = async (restaurant: GooglePlacesResult) => {
    try {
      // Determine cuisine type from Google Places types
      const cuisineTypes = restaurant.types.filter((type) =>
        ["restaurant", "food", "meal_takeaway", "meal_delivery"].includes(type)
      );

      const priceRange = restaurant.price_level
        ? Array(restaurant.price_level).fill("$").join("")
        : "$$";

      const { error } = await supabase.from("restaurants").insert({
        name: restaurant.name,
        location: restaurant.formatted_address,
        phone: restaurant.formatted_phone_number,
        website: restaurant.website,
        rating: restaurant.rating,
        price_range: priceRange,
        google_place_id: restaurant.place_id,
        cuisine: restaurant.cuisine_type || "American",
        status: "open",
        description: `Discovered via Google Places API`,
        is_featured: false,
      });

      if (error) throw error;

      toast({
        title: "Restaurant Added",
        description: `${restaurant.name} has been added to the database`,
      });

      // Remove from new restaurants list
      setNewRestaurants((prev) =>
        prev.filter((r) => r.place_id !== restaurant.place_id)
      );
    } catch (error) {
      console.error("Error adding restaurant:", error);
      toast({
        title: "Failed to Add Restaurant",
        description: "Could not add restaurant to database",
        variant: "destructive",
      });
    }
  };

  const markAsClosed = async (restaurantStatus: RestaurantStatus) => {
    try {
      const { error } = await supabase
        .from("restaurants")
        .update({ status: "closed" })
        .eq("id", restaurantStatus.id);

      if (error) throw error;

      toast({
        title: "Restaurant Marked as Closed",
        description: `${restaurantStatus.name} has been marked as permanently closed`,
      });

      // Remove from closed restaurants list
      setClosedRestaurants((prev) =>
        prev.filter((r) => r.id !== restaurantStatus.id)
      );
    } catch (error) {
      console.error("Error marking restaurant as closed:", error);
      toast({
        title: "Failed to Update Restaurant",
        description: "Could not mark restaurant as closed",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Setup Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Google Places Integration Setup
          </CardTitle>
          <CardDescription>
            Required setup steps for Google Places API integration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <p>
                <strong>Setup Required:</strong>
              </p>
              <ol className="list-decimal list-inside space-y-1 mt-2">
                <li>
                  Deploy Edge Functions:{" "}
                  <code>supabase functions deploy search-new-restaurants</code>
                </li>
                <li>
                  Deploy Edge Functions:{" "}
                  <code>supabase functions deploy check-restaurant-status</code>
                </li>
                <li>
                  Run migration: <code>supabase db push</code> to add Google
                  Places fields
                </li>
                <li>
                  Verify GOOGLE_SEARCH_API secret is set in Supabase dashboard
                </li>
              </ol>
            </AlertDescription>
          </Alert>

        </CardContent>
      </Card>

      {/* Search for New Restaurants */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Find New Restaurants
          </CardTitle>
          <CardDescription>
            Search for new restaurants in Des Moines area using Google Places
            API
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="location">Search Location</Label>
              <Input
                id="location"
                value={searchLocation}
                onChange={(e) => setSearchLocation(e.target.value)}
                placeholder="Des Moines, IA"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="radius">Search Radius (meters)</Label>
              <Input
                id="radius"
                value={searchRadius}
                onChange={(e) => setSearchRadius(e.target.value)}
                placeholder="5000"
                type="number"
              />
            </div>
          </div>

          <Button
            onClick={searchNewRestaurants}
            disabled={isSearching}
            className="w-full"
          >
            {isSearching ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Search for New Restaurants
              </>
            )}
          </Button>

          {searchResults && (
            <Alert>
              <AlertDescription>{searchResults}</AlertDescription>
            </Alert>
          )}

          {/* New Restaurants Results */}
          {newRestaurants.length > 0 && (
            <div className="space-y-4">
              <h4 className="font-semibold">New Restaurants Found:</h4>
              <div className="space-y-3">
                {newRestaurants.map((restaurant) => (
                  <div
                    key={restaurant.place_id}
                    className="border rounded-lg p-4 space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h5 className="font-medium">{restaurant.name}</h5>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {restaurant.formatted_address}
                        </p>
                        {restaurant.rating && (
                          <p className="text-sm">
                            Rating: {restaurant.rating}/5 (
                            {restaurant.user_ratings_total} reviews)
                          </p>
                        )}
                        <div className="flex gap-1 mt-2">
                          {restaurant.types.slice(0, 3).map((type) => (
                            <Badge
                              key={type}
                              variant="outline"
                              className="text-xs"
                            >
                              {type.replace(/_/g, " ")}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => addRestaurant(restaurant)}
                        className="ml-4"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Check for Closed Restaurants */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Check Restaurant Status
          </CardTitle>
          <CardDescription>
            Check if existing restaurants are permanently closed
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={checkClosedRestaurants}
            disabled={isCheckingClosed}
            className="w-full"
            variant="outline"
          >
            {isCheckingClosed ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Checking Status...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Check All Restaurant Status
              </>
            )}
          </Button>

          {/* Closed Restaurants Results */}
          {closedRestaurants.length > 0 && (
            <div className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Found {closedRestaurants.length} restaurants that appear to be
                  permanently closed
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                {closedRestaurants.map((restaurant) => (
                  <div
                    key={restaurant.id}
                    className="border rounded-lg p-4 space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h5 className="font-medium">{restaurant.name}</h5>
                        <div className="flex gap-2 mt-2">
                          <Badge variant="outline">
                            Current: {restaurant.current_status}
                          </Badge>
                          <Badge variant="destructive">
                            Google: {restaurant.google_status}
                          </Badge>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => markAsClosed(restaurant)}
                        className="ml-4"
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Mark Closed
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {closedRestaurants.length === 0 && !isCheckingClosed && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                No closed restaurants detected. All restaurants appear to be
                operational.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

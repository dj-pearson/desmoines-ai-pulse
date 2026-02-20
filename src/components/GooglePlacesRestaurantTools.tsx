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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Ban,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from '@/lib/logger';

const log = createLogger('GooglePlacesRestaurantTools');

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

interface BlacklistEntry {
  id: string;
  google_place_id: string | null;
  restaurant_name: string;
  reason: string;
  reason_category: string;
  formatted_address: string | null;
  blocked_at: string;
}

type BlacklistCategory =
  | "not_restaurant"
  | "chain"
  | "duplicate"
  | "out_of_scope"
  | "closed_permanent"
  | "spam"
  | "added_to_db"
  | "other";

const BLACKLIST_CATEGORIES: { value: BlacklistCategory; label: string }[] = [
  { value: "not_restaurant", label: "Not a Restaurant" },
  { value: "chain", label: "Chain/Fast Food" },
  { value: "duplicate", label: "Duplicate Entry" },
  { value: "out_of_scope", label: "Out of Area" },
  { value: "closed_permanent", label: "Permanently Closed" },
  { value: "spam", label: "Spam/Fake" },
  { value: "added_to_db", label: "Already Added" },
  { value: "other", label: "Other" },
];

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
  const [searchOffset, setSearchOffset] = useState(0);
  const [hasMoreResults, setHasMoreResults] = useState(false);
  const { toast } = useToast();

  // Blacklist state
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
  const [isLoadingBlacklist, setIsLoadingBlacklist] = useState(false);
  const [showBlacklist, setShowBlacklist] = useState(false);
  const [blacklistDialogOpen, setBlacklistDialogOpen] = useState(false);
  const [selectedForBlacklist, setSelectedForBlacklist] =
    useState<GooglePlacesResult | null>(null);
  const [blacklistReason, setBlacklistReason] = useState("");
  const [blacklistCategory, setBlacklistCategory] =
    useState<BlacklistCategory>("not_restaurant");

  // Load blacklist entries
  const loadBlacklist = async () => {
    setIsLoadingBlacklist(true);
    try {
      const { data, error } = await supabase
        .from("restaurant_blacklist")
        .select("*")
        .order("blocked_at", { ascending: false });

      if (error) throw error;
      setBlacklist(data || []);
    } catch (error) {
      log.error('loadBlacklist', 'Error loading blacklist', { data: error });
      toast({
        title: "Error",
        description: "Failed to load blacklist",
        variant: "destructive",
      });
    } finally {
      setIsLoadingBlacklist(false);
    }
  };

  // Add to blacklist
  const addToBlacklist = async () => {
    if (!selectedForBlacklist || !blacklistReason.trim()) {
      toast({
        title: "Error",
        description: "Please provide a reason for blacklisting",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase.from("restaurant_blacklist").insert({
        google_place_id: selectedForBlacklist.place_id,
        restaurant_name: selectedForBlacklist.name,
        reason: blacklistReason,
        reason_category: blacklistCategory,
        formatted_address: selectedForBlacklist.formatted_address,
      });

      if (error) throw error;

      toast({
        title: "Added to Blacklist",
        description: `${selectedForBlacklist.name} will no longer appear in search results`,
      });

      // Remove from search results
      setNewRestaurants((prev) =>
        prev.filter((r) => r.place_id !== selectedForBlacklist.place_id)
      );

      // Reset dialog state
      setBlacklistDialogOpen(false);
      setSelectedForBlacklist(null);
      setBlacklistReason("");
      setBlacklistCategory("not_restaurant");

      // Refresh blacklist if visible
      if (showBlacklist) {
        loadBlacklist();
      }
    } catch (error) {
      log.error('addToBlacklist', 'Error adding to blacklist', { data: error });
      toast({
        title: "Error",
        description: "Failed to add to blacklist",
        variant: "destructive",
      });
    }
  };

  // Remove from blacklist
  const removeFromBlacklist = async (entry: BlacklistEntry) => {
    try {
      const { error } = await supabase
        .from("restaurant_blacklist")
        .delete()
        .eq("id", entry.id);

      if (error) throw error;

      toast({
        title: "Removed from Blacklist",
        description: `${entry.restaurant_name} can now appear in search results`,
      });

      setBlacklist((prev) => prev.filter((b) => b.id !== entry.id));
    } catch (error) {
      log.error('removeFromBlacklist', 'Error removing from blacklist', { data: error });
      toast({
        title: "Error",
        description: "Failed to remove from blacklist",
        variant: "destructive",
      });
    }
  };

  // Open blacklist dialog for a restaurant
  const openBlacklistDialog = (restaurant: GooglePlacesResult) => {
    setSelectedForBlacklist(restaurant);
    setBlacklistDialogOpen(true);
  };

  const searchNewRestaurants = async (append = false) => {
    if (!searchLocation.trim()) {
      toast({
        title: "Error",
        description: "Please enter a search location",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    if (!append) {
      setSearchResults("");
      setSearchOffset(0);
      setNewRestaurants([]);
    }

    const currentOffset = append ? searchOffset : 0;

    try {
      // Call Supabase Edge Function for Google Places search
      const { data, error } = await supabase.functions.invoke(
        "search-new-restaurants",
        {
          body: {
            location: searchLocation,
            radius: parseInt(searchRadius),
            offset: currentOffset,
          },
        }
      );

      if (error) throw error;

      if (data?.restaurants) {
        if (append) {
          setNewRestaurants((prev) => [...prev, ...data.restaurants]);
        } else {
          setNewRestaurants(data.restaurants);
        }

        setHasMoreResults(data.has_more || false);
        setSearchOffset(currentOffset + 20);

        const resultMessage = `Found ${data.restaurants.length} new restaurants (${data.total_places_searched} total searched, ${data.existing_restaurants_count} already in database)`;
        setSearchResults(resultMessage);

        toast({
          title: append ? "More Results Loaded" : "Search Complete",
          description: resultMessage,
        });
      } else {
        setSearchResults("No new restaurants found");
        toast({
          title: "Search Complete",
          description: "No new restaurants found in the area",
        });
      }
    } catch (error) {
      log.error('search', 'Error searching restaurants', { data: error });
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
      log.error('checkStatus', 'Error checking restaurant status', { data: error });
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
      log.error('addRestaurant', 'Error adding restaurant', { data: error });
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
      log.error('markClosed', 'Error marking restaurant as closed', { data: error });
      toast({
        title: "Failed to Update Restaurant",
        description: "Could not mark restaurant as closed",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
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

          <div className="flex gap-2">
            <Button
              onClick={() => searchNewRestaurants(false)}
              disabled={isSearching}
              className="flex-1"
            >
              {isSearching ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Search New Restaurants
                </>
              )}
            </Button>

            {hasMoreResults && (
              <Button
                onClick={() => searchNewRestaurants(true)}
                disabled={isSearching}
                variant="outline"
                className="flex-1"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Load More
                  </>
                )}
              </Button>
            )}
          </div>

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
                      <div className="flex gap-2 ml-4">
                        <Button
                          size="sm"
                          onClick={() => addRestaurant(restaurant)}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openBlacklistDialog(restaurant)}
                          title="Hide from future searches"
                        >
                          <Ban className="h-4 w-4" />
                        </Button>
                      </div>
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

      {/* Blacklist Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Ban className="h-5 w-5" />
                Blacklist Management
              </CardTitle>
              <CardDescription>
                Manage places that should be excluded from search results
              </CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setShowBlacklist(!showBlacklist);
                if (!showBlacklist && blacklist.length === 0) {
                  loadBlacklist();
                }
              }}
            >
              {showBlacklist ? (
                <>
                  <EyeOff className="h-4 w-4 mr-2" />
                  Hide Blacklist
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  View Blacklist
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        {showBlacklist && (
          <CardContent className="space-y-4">
            {isLoadingBlacklist ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : blacklist.length === 0 ? (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  No blacklisted places. Use the ban icon on search results to
                  hide unwanted places.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  {blacklist.length} place{blacklist.length !== 1 ? "s" : ""}{" "}
                  blacklisted
                </div>
                {blacklist.map((entry) => (
                  <div
                    key={entry.id}
                    className="border rounded-lg p-4 space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h5 className="font-medium">{entry.restaurant_name}</h5>
                        {entry.formatted_address && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {entry.formatted_address}
                          </p>
                        )}
                        <div className="flex gap-2 mt-2">
                          <Badge variant="secondary">
                            {BLACKLIST_CATEGORIES.find(
                              (c) => c.value === entry.reason_category
                            )?.label || entry.reason_category}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {entry.reason}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Blocked:{" "}
                          {new Date(entry.blocked_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeFromBlacklist(entry)}
                        title="Remove from blacklist"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Blacklist Dialog */}
      <Dialog open={blacklistDialogOpen} onOpenChange={setBlacklistDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to Blacklist</DialogTitle>
            <DialogDescription>
              This place will be hidden from future search results.
            </DialogDescription>
          </DialogHeader>

          {selectedForBlacklist && (
            <div className="space-y-4">
              <div className="border rounded-lg p-3 bg-muted/50">
                <p className="font-medium">{selectedForBlacklist.name}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedForBlacklist.formatted_address}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="blacklist-category">Category</Label>
                <Select
                  value={blacklistCategory}
                  onValueChange={(value: BlacklistCategory) =>
                    setBlacklistCategory(value)
                  }
                >
                  <SelectTrigger id="blacklist-category">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {BLACKLIST_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="blacklist-reason">Reason</Label>
                <Textarea
                  id="blacklist-reason"
                  placeholder="Why should this place be hidden? (e.g., 'This is a gas station convenience store, not a restaurant')"
                  value={blacklistReason}
                  onChange={(e) => setBlacklistReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setBlacklistDialogOpen(false);
                setSelectedForBlacklist(null);
                setBlacklistReason("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={addToBlacklist} disabled={!blacklistReason.trim()}>
              <Ban className="h-4 w-4 mr-2" />
              Add to Blacklist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

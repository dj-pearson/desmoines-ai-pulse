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
  Loader2,
  Plus,
  Ban,
  Trash2,
  Eye,
  EyeOff,
  Info,
  Star,
  Building2,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface GooglePlacesHotelResult {
  place_id: string;
  name: string;
  formatted_address: string;
  business_status: string;
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  types: string[];
  opening_hours?: { open_now: boolean };
  formatted_phone_number?: string;
  website?: string;
  star_rating?: number;
  hotel_type?: string;
  brand_parent?: string;
  chain_name?: string;
}

interface BlacklistEntry {
  id: string;
  google_place_id: string | null;
  hotel_name: string;
  reason: string;
  reason_category: string;
  formatted_address: string | null;
  blocked_at: string;
}

type BlacklistCategory =
  | "not_hotel"
  | "duplicate"
  | "out_of_scope"
  | "closed_permanent"
  | "spam"
  | "already_added"
  | "low_quality"
  | "other";

const BLACKLIST_CATEGORIES: { value: BlacklistCategory; label: string }[] = [
  { value: "not_hotel", label: "Not a Hotel" },
  { value: "duplicate", label: "Duplicate Entry" },
  { value: "out_of_scope", label: "Out of Area" },
  { value: "closed_permanent", label: "Permanently Closed" },
  { value: "low_quality", label: "Low Quality / Not Suitable" },
  { value: "spam", label: "Spam/Fake" },
  { value: "already_added", label: "Already Added" },
  { value: "other", label: "Other" },
];

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function detectArea(address: string): string {
  const a = address.toLowerCase();
  if (a.includes("altoona")) return "Altoona";
  if (a.includes("ankeny")) return "Ankeny";
  if (a.includes("ames")) return "Ames";
  if (a.includes("waukee")) return "Waukee";
  if (a.includes("grimes")) return "Grimes";
  if (a.includes("clive")) return "Clive";
  if (a.includes("urbandale")) return "Urbandale";
  if (a.includes("johnston")) return "Johnston";
  if (a.includes("west des moines")) return "West Des Moines";
  if (a.includes("pleasant hill")) return "Pleasant Hill";
  if (a.includes("fleur dr") || a.includes("fleur drive")) return "Airport";
  return "Downtown";
}

function extractCity(address: string): string {
  const area = detectArea(address);
  if (area === "Airport" || area === "Downtown") return "Des Moines";
  return area;
}

export default function GooglePlacesHotelTools() {
  const [searchLocation, setSearchLocation] = useState("Des Moines, IA");
  const [searchRadius, setSearchRadius] = useState("8000");
  const [newHotels, setNewHotels] = useState<GooglePlacesHotelResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
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
    useState<GooglePlacesHotelResult | null>(null);
  const [blacklistReason, setBlacklistReason] = useState("");
  const [blacklistCategory, setBlacklistCategory] =
    useState<BlacklistCategory>("not_hotel");

  const loadBlacklist = async () => {
    setIsLoadingBlacklist(true);
    try {
      const { data, error } = await supabase
        .from("hotel_blacklist")
        .select("*")
        .order("blocked_at", { ascending: false });

      if (error) throw error;
      setBlacklist(data || []);
    } catch (error) {
      console.error("Error loading hotel blacklist:", error);
      toast({
        title: "Error",
        description: "Failed to load blacklist",
        variant: "destructive",
      });
    } finally {
      setIsLoadingBlacklist(false);
    }
  };

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
      const { error } = await supabase.from("hotel_blacklist").insert({
        google_place_id: selectedForBlacklist.place_id,
        hotel_name: selectedForBlacklist.name,
        reason: blacklistReason,
        reason_category: blacklistCategory,
        formatted_address: selectedForBlacklist.formatted_address,
      });

      if (error) throw error;

      toast({
        title: "Added to Blacklist",
        description: `${selectedForBlacklist.name} will no longer appear in search results`,
      });

      setNewHotels((prev) =>
        prev.filter((h) => h.place_id !== selectedForBlacklist.place_id)
      );

      setBlacklistDialogOpen(false);
      setSelectedForBlacklist(null);
      setBlacklistReason("");
      setBlacklistCategory("not_hotel");

      if (showBlacklist) loadBlacklist();
    } catch (error) {
      console.error("Error adding to blacklist:", error);
      toast({
        title: "Error",
        description: "Failed to add to blacklist",
        variant: "destructive",
      });
    }
  };

  const removeFromBlacklist = async (entry: BlacklistEntry) => {
    try {
      const { error } = await supabase
        .from("hotel_blacklist")
        .delete()
        .eq("id", entry.id);

      if (error) throw error;

      toast({
        title: "Removed from Blacklist",
        description: `${entry.hotel_name} can now appear in search results`,
      });

      setBlacklist((prev) => prev.filter((b) => b.id !== entry.id));
    } catch (error) {
      console.error("Error removing from blacklist:", error);
      toast({
        title: "Error",
        description: "Failed to remove from blacklist",
        variant: "destructive",
      });
    }
  };

  const searchNewHotels = async (append = false) => {
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
      setNewHotels([]);
    }

    const currentOffset = append ? searchOffset : 0;

    try {
      const { data, error } = await supabase.functions.invoke(
        "search-new-hotels",
        {
          body: {
            location: searchLocation,
            radius: parseInt(searchRadius),
            offset: currentOffset,
          },
        }
      );

      if (error) throw error;

      if (data?.hotels) {
        if (append) {
          setNewHotels((prev) => [...prev, ...data.hotels]);
        } else {
          setNewHotels(data.hotels);
        }

        setHasMoreResults(data.has_more || false);
        setSearchOffset(currentOffset + 20);

        const resultMessage = `Found ${data.hotels.length} new hotels (${data.total_places_searched} total searched, ${data.existing_hotels_count} already in database)`;
        setSearchResults(resultMessage);

        toast({
          title: append ? "More Results Loaded" : "Search Complete",
          description: resultMessage,
        });
      } else {
        setSearchResults("No new hotels found");
        toast({
          title: "Search Complete",
          description: "No new hotels found in the area",
        });
      }
    } catch (error) {
      console.error("Error searching hotels:", error);
      setSearchResults("Error occurred during search");
      toast({
        title: "Search Failed",
        description:
          "Failed to search for new hotels. Make sure Edge Functions are deployed.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const addHotel = async (hotel: GooglePlacesHotelResult) => {
    try {
      const priceRange = hotel.price_level
        ? "$".repeat(Math.min(Math.max(hotel.price_level, 1), 4))
        : "$$";

      const area = detectArea(hotel.formatted_address);
      const city = extractCity(hotel.formatted_address);
      const slug = generateSlug(hotel.name);

      const { error } = await supabase.from("hotels").insert({
        name: hotel.name,
        slug: slug,
        address: hotel.formatted_address.split(",")[0]?.trim() || hotel.formatted_address,
        city: city,
        state: "IA",
        area: area,
        phone: hotel.formatted_phone_number || null,
        website: hotel.website || null,
        star_rating: hotel.star_rating || hotel.rating || null,
        price_range: priceRange,
        hotel_type: hotel.hotel_type || "Hotel",
        chain_name: hotel.chain_name || null,
        brand_parent: hotel.brand_parent || "Independent",
        google_place_id: hotel.place_id,
        short_description: `Discovered via Google Places. ${hotel.user_ratings_total ? `${hotel.user_ratings_total} reviews.` : ""}`,
        description: null,
        is_featured: false,
        is_active: true,
        check_in_time: "3:00 PM",
        check_out_time: "11:00 AM",
      });

      if (error) throw error;

      toast({
        title: "Hotel Added",
        description: `${hotel.name} has been added to the database`,
      });

      setNewHotels((prev) =>
        prev.filter((h) => h.place_id !== hotel.place_id)
      );
    } catch (error) {
      console.error("Error adding hotel:", error);
      toast({
        title: "Failed to Add Hotel",
        description: "Could not add hotel to database",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Search for New Hotels */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Find New Hotels
          </CardTitle>
          <CardDescription>
            Search for new hotels in the Des Moines area using Google Places API.
            Automatically detects brand, chain, and hotel type.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="hotel-location">Search Location</Label>
              <Input
                id="hotel-location"
                value={searchLocation}
                onChange={(e) => setSearchLocation(e.target.value)}
                placeholder="Des Moines, IA"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hotel-radius">Search Radius (meters)</Label>
              <Input
                id="hotel-radius"
                value={searchRadius}
                onChange={(e) => setSearchRadius(e.target.value)}
                placeholder="8000"
                type="number"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => searchNewHotels(false)}
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
                  Search New Hotels
                </>
              )}
            </Button>

            {hasMoreResults && (
              <Button
                onClick={() => searchNewHotels(true)}
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

          {/* Hotel Results */}
          {newHotels.length > 0 && (
            <div className="space-y-4">
              <h4 className="font-semibold">New Hotels Found:</h4>
              <div className="space-y-3">
                {newHotels.map((hotel) => (
                  <div
                    key={hotel.place_id}
                    className="border rounded-lg p-4 space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h5 className="font-medium">{hotel.name}</h5>
                          {hotel.brand_parent && (
                            <Badge variant="secondary" className="text-xs">
                              {hotel.brand_parent}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {hotel.formatted_address}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          {hotel.rating && (
                            <p className="text-sm flex items-center gap-1">
                              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                              {hotel.rating}/5
                              {hotel.user_ratings_total && (
                                <span className="text-muted-foreground">
                                  ({hotel.user_ratings_total} reviews)
                                </span>
                              )}
                            </p>
                          )}
                          {hotel.hotel_type && (
                            <Badge variant="outline" className="text-xs">
                              {hotel.hotel_type}
                            </Badge>
                          )}
                          {hotel.chain_name && hotel.chain_name !== hotel.brand_parent && (
                            <span className="text-xs text-muted-foreground">
                              {hotel.chain_name}
                            </span>
                          )}
                        </div>
                        {hotel.website && (
                          <a
                            href={hotel.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Website
                          </a>
                        )}
                      </div>
                      <div className="flex gap-2 ml-4">
                        <Button
                          size="sm"
                          onClick={() => addHotel(hotel)}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedForBlacklist(hotel);
                            setBlacklistDialogOpen(true);
                          }}
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

      {/* Blacklist Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Ban className="h-5 w-5" />
                Hotel Blacklist
              </CardTitle>
              <CardDescription>
                Manage places that should be excluded from hotel search results
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
                        <h5 className="font-medium">{entry.hotel_name}</h5>
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
            <DialogTitle>Add to Hotel Blacklist</DialogTitle>
            <DialogDescription>
              This place will be hidden from future hotel search results.
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
                <Label htmlFor="hotel-blacklist-category">Category</Label>
                <Select
                  value={blacklistCategory}
                  onValueChange={(value: BlacklistCategory) =>
                    setBlacklistCategory(value)
                  }
                >
                  <SelectTrigger id="hotel-blacklist-category">
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
                <Label htmlFor="hotel-blacklist-reason">Reason</Label>
                <Textarea
                  id="hotel-blacklist-reason"
                  placeholder="Why should this place be hidden? (e.g., 'This is an apartment complex, not a hotel')"
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

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Search,
  Filter,
  X,
  MapPin,
  Star,
  DollarSign,
  ChefHat,
  Clock,
  TrendingUp,
  Sparkles,
  SlidersHorizontal,
} from "lucide-react";

export interface RestaurantFilterOptions {
  search: string;
  cuisine: string[];
  priceRange: string[];
  rating: number[];
  location: string[];
  sortBy:
    | "popularity"
    | "rating"
    | "newest"
    | "alphabetical"
    | "price_low"
    | "price_high";
  featuredOnly: boolean;
  openNow: boolean;
  tags: string[];
}

interface RestaurantFiltersProps {
  filters: RestaurantFilterOptions;
  onFiltersChange: (filters: RestaurantFilterOptions) => void;
  availableCuisines: string[];
  availableLocations: string[];
  availableTags: string[];
  totalResults: number;
  isLoading?: boolean;
}

const priceRangeOptions = [
  { value: "$", label: "$ - Budget Friendly", description: "Under $15" },
  { value: "$$", label: "$$ - Moderate", description: "$15-30" },
  { value: "$$$", label: "$$$ - Upscale", description: "$30-50" },
  { value: "$$$$", label: "$$$$ - Fine Dining", description: "$50+" },
];

const sortOptions = [
  {
    value: "popularity",
    label: "AI Popularity",
    icon: TrendingUp,
    description: "Smart ranking based on reviews, ratings, and trends",
  },
  {
    value: "rating",
    label: "Highest Rated",
    icon: Star,
    description: "Best customer ratings first",
  },
  {
    value: "newest",
    label: "Newest First",
    icon: Clock,
    description: "Recently added restaurants",
  },
  {
    value: "alphabetical",
    label: "A-Z",
    icon: SlidersHorizontal,
    description: "Alphabetical order",
  },
  {
    value: "price_low",
    label: "Price: Low to High",
    icon: DollarSign,
    description: "Most affordable first",
  },
  {
    value: "price_high",
    label: "Price: High to Low",
    icon: DollarSign,
    description: "Premium options first",
  },
];

export function RestaurantFilters({
  filters,
  onFiltersChange,
  availableCuisines,
  availableLocations,
  availableTags,
  totalResults,
  isLoading = false,
}: RestaurantFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchInput, setSearchInput] = useState(filters.search);

  // Debounced search
  const debouncedUpdateSearch = useCallback(() => {
    if (searchInput !== filters.search) {
      onFiltersChange({ ...filters, search: searchInput });
    }
  }, [searchInput, filters, onFiltersChange]);

  useEffect(() => {
    const timer = setTimeout(debouncedUpdateSearch, 300);
    return () => clearTimeout(timer);
  }, [debouncedUpdateSearch]);

  const updateFilter = (key: keyof RestaurantFilterOptions, value: unknown) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const toggleArrayFilter = (
    key: "cuisine" | "priceRange" | "location" | "tags",
    value: string
  ) => {
    const currentArray = filters[key] as string[];
    const newArray = currentArray.includes(value)
      ? currentArray.filter((item) => item !== value)
      : [...currentArray, value];
    updateFilter(key, newArray);
  };

  const clearAllFilters = () => {
    onFiltersChange({
      search: "",
      cuisine: [],
      priceRange: [],
      rating: [0, 5],
      location: [],
      sortBy: "popularity",
      featuredOnly: false,
      openNow: false,
      tags: [],
    });
    setSearchInput("");
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.search) count++;
    if (filters.cuisine.length > 0) count++;
    if (filters.priceRange.length > 0) count++;
    if (filters.rating[0] > 0 || filters.rating[1] < 5) count++;
    if (filters.location.length > 0) count++;
    if (filters.featuredOnly) count++;
    if (filters.openNow) count++;
    if (filters.tags.length > 0) count++;
    return count;
  };

  const activeFilterCount = getActiveFilterCount();

  return (
    <div className="space-y-4">
      {/* Quick Search & Sort Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search Input */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search restaurants, cuisines, or cities..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Sort Dropdown */}
            <div className="flex gap-2">
              <Select
                value={filters.sortBy}
                onValueChange={(value) => updateFilter("sortBy", value)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  {sortOptions.map((option) => {
                    const Icon = option.icon;
                    return (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          <div>
                            <div className="font-medium">{option.label}</div>
                            <div className="text-xs text-muted-foreground">
                              {option.description}
                            </div>
                          </div>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              {/* Filter Toggle */}
              <Button
                variant="outline"
                onClick={() => setIsExpanded(!isExpanded)}
                className="relative"
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="ml-2 h-5 w-5 rounded-full p-0 text-xs"
                  >
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </div>
          </div>

          {/* Results Count */}
          <div className="mt-3 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {isLoading ? (
                "Searching..."
              ) : (
                <>
                  {totalResults} restaurant{totalResults !== 1 ? "s" : ""} found
                  {activeFilterCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearAllFilters}
                      className="ml-2 h-6 px-2 text-xs"
                    >
                      Clear all
                    </Button>
                  )}
                </>
              )}
            </p>

            {/* Quick Filter Tags */}
            <div className="flex gap-1 flex-wrap">
              {filters.featuredOnly && (
                <Badge variant="secondary" className="text-xs">
                  <Sparkles className="h-3 w-3 mr-1" />
                  Featured
                </Badge>
              )}
              {filters.openNow && (
                <Badge variant="secondary" className="text-xs">
                  <Clock className="h-3 w-3 mr-1" />
                  Open Now
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expanded Filters */}
      {isExpanded && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5" />
                Advanced Filters
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Cuisine Types */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <ChefHat className="h-4 w-4" />
                  Cuisine Type
                </Label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {availableCuisines.map((cuisine) => (
                    <Badge
                      key={cuisine}
                      variant={
                        filters.cuisine.includes(cuisine)
                          ? "default"
                          : "outline"
                      }
                      className="cursor-pointer hover:bg-primary/80 transition-colors"
                      onClick={() => toggleArrayFilter("cuisine", cuisine)}
                    >
                      {cuisine}
                      {filters.cuisine.includes(cuisine) && (
                        <X className="h-3 w-3 ml-1" />
                      )}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Price Range */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <DollarSign className="h-4 w-4" />
                  Price Range
                </Label>
                <div className="space-y-2">
                  {priceRangeOptions.map((option) => (
                    <div
                      key={option.value}
                      className={`p-2 rounded-md border cursor-pointer transition-colors ${
                        filters.priceRange.includes(option.value)
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      }`}
                      onClick={() =>
                        toggleArrayFilter("priceRange", option.value)
                      }
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{option.label}</span>
                        {filters.priceRange.includes(option.value) && (
                          <X className="h-3 w-3" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {option.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* City Areas */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <MapPin className="h-4 w-4" />
                  City
                </Label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {availableLocations.map((location) => (
                    <Badge
                      key={location}
                      variant={
                        filters.location.includes(location)
                          ? "default"
                          : "outline"
                      }
                      className="cursor-pointer hover:bg-primary/80 transition-colors"
                      onClick={() => toggleArrayFilter("location", location)}
                    >
                      {location}
                      {filters.location.includes(location) && (
                        <X className="h-3 w-3 ml-1" />
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <Separator />

            {/* Rating Range */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <Star className="h-4 w-4" />
                Minimum Rating: {filters.rating[0]} stars
              </Label>
              <Slider
                value={filters.rating}
                onValueChange={(value) => updateFilter("rating", value)}
                max={5}
                min={0}
                step={0.5}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Any rating</span>
                <span>5 stars only</span>
              </div>
            </div>

            <Separator />

            {/* Quick Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 rounded-md border">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-yellow-500" />
                  <div>
                    <Label htmlFor="featured" className="font-medium">
                      Featured Only
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Show editor's picks
                    </p>
                  </div>
                </div>
                <Switch
                  id="featured"
                  checked={filters.featuredOnly}
                  onCheckedChange={(checked) =>
                    updateFilter("featuredOnly", checked)
                  }
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-md border">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-green-500" />
                  <div>
                    <Label htmlFor="openNow" className="font-medium">
                      Open Now
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Currently serving
                    </p>
                  </div>
                </div>
                <Switch
                  id="openNow"
                  checked={filters.openNow}
                  onCheckedChange={(checked) =>
                    updateFilter("openNow", checked)
                  }
                />
              </div>
            </div>

            {/* Popular Tags */}
            {availableTags.length > 0 && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">Popular Tags</Label>
                <div className="flex flex-wrap gap-2">
                  {availableTags.map((tag) => (
                    <Badge
                      key={tag}
                      variant={
                        filters.tags.includes(tag) ? "default" : "outline"
                      }
                      className="cursor-pointer hover:bg-primary/80 transition-colors"
                      onClick={() => toggleArrayFilter("tags", tag)}
                    >
                      #{tag}
                      {filters.tags.includes(tag) && (
                        <X className="h-3 w-3 ml-1" />
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

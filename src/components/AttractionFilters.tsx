import { useState, useEffect } from "react";
import { Search, Filter, Star, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

interface AttractionFiltersProps {
  onFiltersChange: (filters: {
    search?: string;
    type?: string;
    minRating?: number;
    featuredOnly?: boolean;
  }) => void;
  totalCount: number;
}

const attractionTypes = [
  "Museum",
  "Park",
  "Entertainment",
  "Cultural",
  "Historical",
  "Recreation",
  "Sports",
  "Arts",
  "Nature",
  "Shopping",
  "Other"
];

const ratingOptions = [
  { value: 4.5, label: "4.5+ Stars" },
  { value: 4.0, label: "4.0+ Stars" },
  { value: 3.5, label: "3.5+ Stars" },
  { value: 3.0, label: "3.0+ Stars" },
];

export default function AttractionFilters({ onFiltersChange, totalCount }: AttractionFiltersProps) {
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<string>();
  const [minRating, setMinRating] = useState<number>();
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      onFiltersChange({
        search: search || undefined,
        type: selectedType,
        minRating,
        featuredOnly: featuredOnly || undefined,
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [search, selectedType, minRating, featuredOnly, onFiltersChange]);

  const activeFiltersCount = [
    selectedType,
    minRating,
    featuredOnly,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setSearch("");
    setSelectedType(undefined);
    setMinRating(undefined);
    setFeaturedOnly(false);
  };

  const hasActiveFilters = activeFiltersCount > 0 || search.length > 0;

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Search attractions by name, type, or location..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Filter Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Type Filter */}
        <Select value={selectedType} onValueChange={setSelectedType}>
          <SelectTrigger className="w-auto min-w-[140px]">
            <MapPin className="h-4 w-4 mr-2" />
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {attractionTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Advanced Filters */}
        <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              Filters
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 rounded-full p-0 text-xs">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="space-y-4">
              <div className="font-medium">Filter Options</div>
              
              {/* Rating Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Minimum Rating</label>
                <Select value={minRating?.toString()} onValueChange={(value) => setMinRating(value === "all" ? undefined : Number(value))}>
                  <SelectTrigger>
                    <Star className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Any rating" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any rating</SelectItem>
                    {ratingOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value.toString()}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Featured Only */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="featured"
                  checked={featuredOnly}
                  onCheckedChange={(checked) => setFeaturedOnly(checked as boolean)}
                />
                <label
                  htmlFor="featured"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Featured attractions only
                </label>
              </div>

              {/* Clear Filters */}
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearAllFilters}
                  className="w-full"
                >
                  Clear all filters
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Results Count */}
        <div className="text-sm text-muted-foreground ml-auto">
          {totalCount} attraction{totalCount !== 1 ? 's' : ''} found
        </div>
      </div>

      {/* Active Filter Tags */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {search && (
            <Badge variant="secondary" className="gap-1">
              Search: "{search}"
              <button
                onClick={() => setSearch("")}
                className="ml-1 hover:bg-muted-foreground/20 rounded-full"
              >
                ×
              </button>
            </Badge>
          )}
          {selectedType && (
            <Badge variant="secondary" className="gap-1">
              Type: {selectedType}
              <button
                onClick={() => setSelectedType(undefined)}
                className="ml-1 hover:bg-muted-foreground/20 rounded-full"
              >
                ×
              </button>
            </Badge>
          )}
          {minRating && (
            <Badge variant="secondary" className="gap-1">
              {minRating}+ Stars
              <button
                onClick={() => setMinRating(undefined)}
                className="ml-1 hover:bg-muted-foreground/20 rounded-full"
              >
                ×
              </button>
            </Badge>
          )}
          {featuredOnly && (
            <Badge variant="secondary" className="gap-1">
              Featured Only
              <button
                onClick={() => setFeaturedOnly(false)}
                className="ml-1 hover:bg-muted-foreground/20 rounded-full"
              >
                ×
              </button>
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
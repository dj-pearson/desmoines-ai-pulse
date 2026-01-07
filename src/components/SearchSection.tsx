import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, MapPin, DollarSign } from "lucide-react";
import InteractiveDateSelector from "@/components/InteractiveDateSelector";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface SearchSectionProps {
  onSearch: (
    filters: {
      query: string;
      category: string;
      subcategory?: string;
      dateFilter?: {
        start?: Date;
        end?: Date;
        mode: "single" | "range" | "preset";
        preset?: string;
      } | null;
      location?: string;
      priceRange?: string;
    },
    shouldScroll?: boolean
  ) => void;
}

export default function SearchSection({ onSearch }: SearchSectionProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [subcategory, setSubcategory] = useState("");
  const [dateFilter, setDateFilter] = useState<{
    start?: Date;
    end?: Date;
    mode: "single" | "range" | "preset";
    preset?: string;
  } | null>(null);
  const [location, setLocation] = useState("");
  const [priceRange, setPriceRange] = useState("");

  const { trackSearch } = useAnalytics();
  const [resultsCount, setResultsCount] = useState(0);

  // Fetch subcategories based on selected category
  const { data: subcategories } = useQuery({
    queryKey: ["subcategories", category],
    queryFn: async () => {
      if (category === "Events") {
        const { data, error } = await supabase
          .from("events")
          .select("category")
          .gte("date", new Date().toISOString().split("T")[0]);

        if (error) throw error;
        const uniqueCategories = [
          ...new Set(data.map((event) => event.category)),
        ].filter(Boolean);
        return uniqueCategories.sort();
      } else if (category === "Restaurants") {
        const { data, error } = await supabase
          .from("restaurants")
          .select("cuisine");

        if (error) throw error;
        const uniqueCuisines = [
          ...new Set(data.map((restaurant) => restaurant.cuisine)),
        ].filter(Boolean);
        return uniqueCuisines.sort();
      }
      return [];
    },
    enabled:
      category !== "All" &&
      (category === "Events" || category === "Restaurants"),
  });

  // Reset subcategory when category changes
  useEffect(() => {
    setSubcategory("");
  }, [category]);

  // Auto-trigger search when any filter changes
  const handleFilterChange = (
    newFilters: Partial<{
      query?: string;
      category?: string;
      subcategory?: string;
      dateFilter?: {
        start?: Date;
        end?: Date;
        mode: "single" | "range" | "preset";
        preset?: string;
      } | null;
      location?: string;
      priceRange?: string;
    }>
  ) => {
    const updatedFilters = {
      query,
      category,
      subcategory,
      dateFilter,
      location,
      priceRange,
      ...newFilters,
    };
    onSearch(updatedFilters, false); // Don't scroll during filter changes
  };

  const handleDateFilterChange = (
    newDateFilter: {
      start?: Date;
      end?: Date;
      mode: "single" | "range" | "preset";
      preset?: string;
    } | null
  ) => {
    setDateFilter(newDateFilter);
    handleFilterChange({ dateFilter: newDateFilter });
  };

  const handleCategoryChange = (newCategory: string) => {
    setCategory(newCategory);
    setSubcategory(""); // Reset subcategory when category changes
    handleFilterChange({ category: newCategory, subcategory: "" });
  };

  const handleSubcategoryChange = (newSubcategory: string) => {
    const subcategoryValue =
      newSubcategory === "all-subcategories" ? "" : newSubcategory;
    setSubcategory(subcategoryValue);
    handleFilterChange({ subcategory: subcategoryValue });
  };

  const handleLocationChange = (newLocation: string) => {
    setLocation(newLocation);
    handleFilterChange({ location: newLocation });
  };

  const handlePriceChange = (newPriceRange: string) => {
    setPriceRange(newPriceRange);
    handleFilterChange({ priceRange: newPriceRange });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(
      { query, category, subcategory, dateFilter, location, priceRange },
      true
    ); // Scroll when explicitly searching
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);

    console.log("Search query changed:", newQuery, "Length:", newQuery.length);

    // Always trigger filter change for clearing (empty) or meaningful search (2+ chars)
    if (newQuery.length === 0) {
      console.log("Clearing search - showing all results");
      handleFilterChange({ query: "" });
    } else if (newQuery.length >= 2) {
      console.log("Applying search filter:", newQuery);
      handleFilterChange({ query: newQuery });
    }
    // For 1 character, don't filter yet but keep the previous state
  };

  return (
    <section className="py-8 md:py-20 bg-gradient-to-r from-[#2D1B69] to-[#8B0000] mobile-padding">
      <div className="container mx-auto text-center">
        <h2 className="text-mobile-title md:text-4xl lg:text-6xl font-bold text-primary-foreground mb-3 md:mb-6 mobile-safe-text">
          Discover Des Moines
        </h2>
        <p className="text-mobile-body md:text-xl text-primary-foreground/90 mb-6 md:mb-12 max-w-2xl mx-auto mobile-safe-text">
          Your AI-powered guide to events, dining, and attractions in the
          capital city
        </p>

        <form
          onSubmit={handleSearch}
          className="space-y-3 md:space-y-6 max-w-4xl mx-auto"
        >
          {/* Mobile-First Main search bar */}
          <div className="flex flex-col gap-3 md:gap-4">
            <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
              <div className="flex-1">
                <Input
                  type="text"
                  placeholder="Search events, restaurants, attractions..."
                  value={query}
                  onChange={handleQueryChange}
                  className="touch-target text-base md:text-lg bg-background/95 backdrop-blur border-0 focus:ring-2 focus:ring-primary-foreground"
                  aria-label="Search events, restaurants, and attractions"
                  role="searchbox"
                />
              </div>
              <Select value={category} onValueChange={handleCategoryChange}>
                <SelectTrigger className="touch-target w-full sm:w-48 bg-background/95 backdrop-blur border-0" aria-label="Category filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Categories</SelectItem>
                  <SelectItem value="Events">Events</SelectItem>
                  <SelectItem value="Restaurants">Restaurants</SelectItem>
                  <SelectItem value="Attractions">Attractions</SelectItem>
                  <SelectItem value="Playgrounds">Playgrounds</SelectItem>
                </SelectContent>
              </Select>

              {/* Subcategory Dropdown - Shows when Events or Restaurants is selected */}
              {(category === "Events" || category === "Restaurants") &&
                subcategories &&
                subcategories.length > 0 && (
                  <Select
                    value={subcategory}
                    onValueChange={handleSubcategoryChange}
                  >
                    <SelectTrigger
                      className="touch-target w-full sm:w-48 bg-background/95 backdrop-blur border-0"
                      aria-label={category === "Events" ? "Event type filter" : "Cuisine type filter"}
                    >
                      <SelectValue
                        placeholder={
                          category === "Events" ? "Event type" : "Cuisine type"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all-subcategories">
                        {category === "Events" ? "All Events" : "All Cuisines"}
                      </SelectItem>
                      {subcategories.map((sub) => (
                        <SelectItem key={sub} value={sub}>
                          {sub}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
            </div>

            <Button
              type="submit"
              size="lg"
              className="touch-target bg-secondary hover:bg-secondary/90 text-secondary-foreground font-semibold"
            >
              <Search className="h-5 w-5 mr-2" />
              Search
            </Button>
          </div>

          {/* Mobile-Optimized Filters */}
          <div className="mobile-grid sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            <div className="space-y-2">
              <InteractiveDateSelector
                onDateChange={handleDateFilterChange}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-primary-foreground/70 text-mobile-caption">
                <MapPin className="h-4 w-4" />
                <span>Location</span>
              </div>
              <Select value={location} onValueChange={handleLocationChange}>
                <SelectTrigger className="bg-background/95 backdrop-blur border-0 touch-target" aria-label="Location filter">
                  <SelectValue placeholder="Any location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any-location">Any location</SelectItem>
                  <SelectItem value="downtown">Downtown</SelectItem>
                  <SelectItem value="west-des-moines">
                    West Des Moines
                  </SelectItem>
                  <SelectItem value="ankeny">Ankeny</SelectItem>
                  <SelectItem value="urbandale">Urbandale</SelectItem>
                  <SelectItem value="clive">Clive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-primary-foreground/70 text-mobile-caption">
                <DollarSign className="h-4 w-4" />
                <span>Price Range</span>
              </div>
              <Select value={priceRange} onValueChange={handlePriceChange}>
                <SelectTrigger className="bg-background/95 backdrop-blur border-0 touch-target" aria-label="Price range filter">
                  <SelectValue placeholder="Any price" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any-price">Any price</SelectItem>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="under-25">Under $25</SelectItem>
                  <SelectItem value="25-50">$25 - $50</SelectItem>
                  <SelectItem value="50-100">$50 - $100</SelectItem>
                  <SelectItem value="over-100">Over $100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}

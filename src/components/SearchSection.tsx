import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MapPin, DollarSign } from "lucide-react";
import InteractiveDateSelector from "@/components/InteractiveDateSelector";

interface SearchSectionProps {
  onSearch: (filters: {
    query: string;
    category: string;
    dateFilter?: { start?: Date; end?: Date; mode: 'single' | 'range' | 'preset'; preset?: string } | null;
    location?: string;
    priceRange?: string;
  }, shouldScroll?: boolean) => void;
}

export default function SearchSection({ onSearch }: SearchSectionProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [dateFilter, setDateFilter] = useState<{ start?: Date; end?: Date; mode: 'single' | 'range' | 'preset'; preset?: string } | null>(null);
  const [location, setLocation] = useState("");
  const [priceRange, setPriceRange] = useState("");

  // Auto-trigger search when any filter changes
  const handleFilterChange = (newFilters: Partial<{
    query?: string;
    category?: string;
    dateFilter?: { start?: Date; end?: Date; mode: 'single' | 'range' | 'preset'; preset?: string } | null;
    location?: string;
    priceRange?: string;
  }>) => {
    const updatedFilters = { query, category, dateFilter, location, priceRange, ...newFilters };
    onSearch(updatedFilters, false); // Don't scroll during filter changes
  };

  const handleDateFilterChange = (newDateFilter: { start?: Date; end?: Date; mode: 'single' | 'range' | 'preset'; preset?: string } | null) => {
    setDateFilter(newDateFilter);
    handleFilterChange({ dateFilter: newDateFilter });
  };

  const handleCategoryChange = (newCategory: string) => {
    setCategory(newCategory);
    handleFilterChange({ category: newCategory });
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
    onSearch({ query, category, dateFilter, location, priceRange }, true); // Scroll when explicitly searching
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    
    console.log('Search query changed:', newQuery, 'Length:', newQuery.length);
    
    // Always trigger filter change for clearing (empty) or meaningful search (2+ chars)
    if (newQuery.length === 0) {
      console.log('Clearing search - showing all results');
      handleFilterChange({ query: '' });
    } else if (newQuery.length >= 2) {
      console.log('Applying search filter:', newQuery);
      handleFilterChange({ query: newQuery });
    }
    // For 1 character, don't filter yet but keep the previous state
  };

  return (
    <section className="py-20 bg-gradient-to-r from-primary to-primary/80">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">
          Discover Des Moines
        </h2>
        <p className="text-xl text-white/90 mb-12">
          Your AI-powered guide to events, dining, and attractions in the capital city
        </p>
        
        <form onSubmit={handleSearch} className="space-y-6 max-w-4xl mx-auto">
          {/* Main search bar */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                type="text"
                placeholder="Search events, restaurants, attractions..."
                value={query}
                onChange={handleQueryChange}
                className="h-12 text-lg bg-white/95 backdrop-blur"
              />
            </div>
            <Select value={category} onValueChange={handleCategoryChange}>
              <SelectTrigger className="h-12 w-full sm:w-48 bg-white/95 backdrop-blur">
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
            <Button type="submit" size="lg" className="h-12 px-8 bg-accent hover:bg-green-700 text-white">
              <Search className="h-5 w-5 mr-2" />
              Search
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InteractiveDateSelector 
              onDateChange={handleDateFilterChange}
              className="w-full"
            />

            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-white/70" />
              <Select value={location} onValueChange={handleLocationChange}>
                <SelectTrigger className="bg-white/95 backdrop-blur">
                  <SelectValue placeholder="Any location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any-location">Any location</SelectItem>
                  <SelectItem value="downtown">Downtown</SelectItem>
                  <SelectItem value="west-des-moines">West Des Moines</SelectItem>
                  <SelectItem value="ankeny">Ankeny</SelectItem>
                  <SelectItem value="urbandale">Urbandale</SelectItem>
                  <SelectItem value="clive">Clive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-white/70" />
              <Select value={priceRange} onValueChange={handlePriceChange}>
                <SelectTrigger className="bg-white/95 backdrop-blur">
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
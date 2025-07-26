import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SearchSectionProps {
  onSearch: (query: string, category: string) => void;
}

export default function SearchSection({ onSearch }: SearchSectionProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");

  const handleSearch = () => {
    onSearch(searchQuery, selectedCategory);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <section className="bg-gradient-to-r from-primary to-blue-600 text-white py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-4xl md:text-6xl font-bold mb-6">Discover Des Moines</h2>
        <p className="text-xl md:text-2xl mb-12 opacity-90">Your guide to the best events, restaurants, and attractions in the city</p>
        
        <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-lg p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <Input 
                type="text" 
                placeholder="Search events, restaurants, attractions..." 
                className="w-full px-4 py-3 text-neutral-900 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
              />
            </div>
            <div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full px-4 py-3 text-neutral-900 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Categories">All Categories</SelectItem>
                  <SelectItem value="Events">Events</SelectItem>
                  <SelectItem value="Restaurants">Restaurants</SelectItem>
                  <SelectItem value="Entertainment">Entertainment</SelectItem>
                  <SelectItem value="Outdoor">Outdoor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button 
              className="bg-secondary hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
              onClick={handleSearch}
            >
              Search
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

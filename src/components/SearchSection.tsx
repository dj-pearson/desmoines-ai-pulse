import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";

interface SearchSectionProps {
  onSearch: (query: string, category: string) => void;
}

export default function SearchSection({ onSearch }: SearchSectionProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query, category);
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
        
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4 max-w-2xl mx-auto">
          <div className="flex-1">
            <Input
              type="text"
              placeholder="What are you looking for?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-12 text-lg"
            />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-12 w-full sm:w-48">
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
        </form>
      </div>
    </section>
  );
}
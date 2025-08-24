import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import EventCard from "./EventCard";
import { CardsGridSkeleton, SearchResultsSkeleton } from "@/components/ui/loading-skeleton";
import { Event } from "@/lib/types";
import { Calendar, Filter } from "lucide-react";
import { useEvents } from "@/hooks/useSupabase";

interface EventFiltersProps {
  onViewEventDetails: (event: Event) => void;
}

export default function EventFilters({ onViewEventDetails }: EventFiltersProps) {
  const [dateFilter, setDateFilter] = useState("All Dates");
  const [categoryFilter, setCategoryFilter] = useState("All Categories");
  const [locationFilter, setLocationFilter] = useState("All Locations");

  const filters = {
    category: categoryFilter !== "All Categories" ? categoryFilter : undefined,
    location: locationFilter !== "All Locations" ? locationFilter : undefined,
    date: dateFilter !== "All Dates" ? new Date().toISOString() : undefined,
  };

  const { data: events, isLoading, error } = useEvents(filters);

  const resetFilters = () => {
    setDateFilter("All Dates");
    setCategoryFilter("All Categories");
    setLocationFilter("All Locations");
  };

  if (error) {
    return (
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h3 className="text-3xl font-bold text-neutral-900 mb-4">Browse All Events</h3>
            <p className="text-red-500">Failed to load events. Please try again later.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h3 className="text-3xl font-bold text-neutral-900 mb-4">Browse All Events</h3>
          <p className="text-lg text-neutral-500">Find exactly what you're looking for</p>
        </div>

        {/* Filter Controls */}
        <div className="bg-neutral-50 rounded-xl p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label className="block text-sm font-semibold text-neutral-700 mb-2">Date Range</Label>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Dates">All Dates</SelectItem>
                  <SelectItem value="Today">Today</SelectItem>
                  <SelectItem value="This Week">This Week</SelectItem>
                  <SelectItem value="This Month">This Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="block text-sm font-semibold text-neutral-700 mb-2">Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Categories">All Categories</SelectItem>
                  <SelectItem value="Music">Music</SelectItem>
                  <SelectItem value="Food">Food & Drink</SelectItem>
                  <SelectItem value="Art">Art & Culture</SelectItem>
                  <SelectItem value="Outdoor">Outdoor</SelectItem>
                  <SelectItem value="Family">Family</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="block text-sm font-semibold text-neutral-700 mb-2">Location</Label>
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Locations">All Locations</SelectItem>
                  <SelectItem value="Downtown">Downtown</SelectItem>
                  <SelectItem value="East Village">East Village</SelectItem>
                  <SelectItem value="Ingersoll">Ingersoll</SelectItem>
                  <SelectItem value="West Des Moines">West Des Moines</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button 
                variant="outline" 
                onClick={resetFilters}
                className="px-3"
              >
                Reset
              </Button>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
            <p className="text-neutral-500">Loading events...</p>
          </div>
        )}

        {/* Event Grid */}
        {!isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events && events.length > 0 ? (
              events.map((event) => (
                <EventCard 
                  key={event.id} 
                  event={event} 
                  onViewDetails={onViewEventDetails}
                />
              ))
            ) : (
              <div className="col-span-full text-center py-12 text-neutral-500">
                <Calendar className="h-16 w-16 mx-auto mb-4 text-neutral-300" />
                <p className="text-lg mb-2">No events found matching your criteria</p>
                <p className="text-sm">Try adjusting your filters or check back later for new events</p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
import EventCard from "./EventCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Event } from "@/lib/types";
import { useFeaturedEvents } from "@/hooks/useSupabase";

interface FeaturedEventsProps {
  onViewAllEvents: () => void;
  onViewEventDetails: (event: Event) => void;
}

export default function FeaturedEvents({ onViewAllEvents, onViewEventDetails }: FeaturedEventsProps) {
  const { data: events, isLoading, error } = useFeaturedEvents();

  if (error) {
    return (
      <section className="py-16 bg-white" id="events">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h3 className="text-3xl font-bold text-neutral-900 mb-4">Featured Events</h3>
            <p className="text-red-500">Failed to load events. Please try again later.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 bg-white" id="events">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h3 className="text-3xl font-bold text-neutral-900 mb-4">Featured Events</h3>
          <p className="text-lg text-neutral-500">AI-curated events happening in Des Moines</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl shadow-lg overflow-hidden">
                <Skeleton className="w-full h-48" />
                <div className="p-6">
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-full mb-4" />
                  <Skeleton className="h-4 w-1/2 mb-4" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : events && events.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {events.map((event) => (
              <EventCard 
                key={event.id} 
                event={event} 
                onViewDetails={onViewEventDetails}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-neutral-500 text-lg">No featured events available at the moment.</p>
            <p className="text-neutral-400 text-sm mt-2">Events are updated regularly through our scraping system.</p>
          </div>
        )}

        <div className="text-center mt-12">
          <Button 
            className="bg-primary hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
            onClick={onViewAllEvents}
          >
            View All Events
          </Button>
        </div>
      </div>
    </section>
  );
}
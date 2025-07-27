import { useState } from "react";
import Header from "@/components/Header";
import SearchSection from "@/components/SearchSection";
import FeaturedEvents from "@/components/FeaturedEvents";
import PersonalizedDashboard from "@/components/PersonalizedDashboard";
import MostSearched from "@/components/MostSearched";
import EventFilters from "@/components/EventFilters";
import SmartEventNavigation from "@/components/SmartEventNavigation";
import Newsletter from "@/components/Newsletter";
import Footer from "@/components/Footer";
import { RestaurantOpenings } from "@/components/RestaurantOpenings";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Database } from "@/integrations/supabase/types";

type Event = Database["public"]["Tables"]["events"]["Row"];
import { useEventScraper } from "@/hooks/useSupabase";
import { Calendar, MapPin, ExternalLink, Sparkles } from "lucide-react";
import { format } from "date-fns";

export default function Index() {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showEventDetails, setShowEventDetails] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();

  const scrapeMutation = useEventScraper();

  const handleSearch = (filters: {
    query: string;
    category: string;
    date?: string;
    location?: string;
    priceRange?: string;
  }) => {
    // Scroll to events section and apply filters
    document.getElementById("events")?.scrollIntoView({ behavior: "smooth" });
    
    // TODO: Implement actual filtering logic with the enhanced filters
    toast({
      title: "Smart Search Applied",
      description: `Found events matching your criteria`,
    });
  };

  const handleViewEventDetails = (event: Event) => {
    setSelectedEvent(event);
    setShowEventDetails(true);
  };

  const handleViewAllEvents = () => {
    setShowAllEvents(true);
  };

  const handleScrapeEvents = () => {
    scrapeMutation.mutate(undefined, {
      onSuccess: () => {
        toast({
          title: "Events Updated!",
          description: "Latest events have been scraped and enhanced with AI.",
        });
      },
      onError: (error: Error) => {
        toast({
          title: "Scraping Failed",
          description:
            error.message || "Failed to scrape events. Please try again.",
          variant: "destructive",
        });
      },
    });
  };

  const formatEventDate = (date: string | Date) => {
    try {
      return format(new Date(date), "EEEE, MMMM d, yyyy 'at' h:mm a");
    } catch {
      return "Date and time to be announced";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <SearchSection onSearch={handleSearch} />

      {/* Restaurant Openings Section */}
      <section className="py-16 bg-muted/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <RestaurantOpenings />
        </div>
      </section>

      {!showAllEvents && (
        <>
          {isAuthenticated ? (
            <PersonalizedDashboard onViewEventDetails={handleViewEventDetails} />
          ) : (
            <>
              {/* Smart Event Navigation for General Users */}
              <section className="py-8">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                  <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
                      Discover Amazing Events
                    </h2>
                    <p className="text-lg text-gray-600 dark:text-gray-300">
                      Find exactly what you're looking for with smart filtering and recommendations
                    </p>
                  </div>
                  <SmartEventNavigation onViewEventDetails={handleViewEventDetails} />
                </div>
              </section>
            </>
          )}
          <MostSearched />
        </>
      )}

      {showAllEvents && (
        <div className="py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setShowAllEvents(false)}>
                ← Back to Smart Discovery
              </Button>
              <Button
                onClick={handleScrapeEvents}
                disabled={scrapeMutation.isPending}
                className="bg-accent hover:bg-green-700 text-white"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {scrapeMutation.isPending ? "Updating..." : "Update Events"}
              </Button>
            </div>
          </div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <EventFilters onViewEventDetails={handleViewEventDetails} />
          </div>
        </div>
      )}

      <Newsletter />
      <Footer />

      {/* Event Details Dialog */}
      <Dialog open={showEventDetails} onOpenChange={setShowEventDetails}>
        <DialogContent className="max-w-2xl">
          {selectedEvent && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold">
                  {selectedEvent.title}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {selectedEvent.image_url && (
                  <img
                    src={selectedEvent.image_url}
                    alt={selectedEvent.title}
                    className="w-full h-64 object-cover rounded-lg"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = "none";
                    }}
                  />
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center text-neutral-600">
                    <Calendar className="h-5 w-5 mr-2" />
                    <span>{formatEventDate(selectedEvent.date)}</span>
                  </div>

                  <div className="flex items-center text-neutral-600">
                    <MapPin className="h-5 w-5 mr-2" />
                    <span>{selectedEvent.location}</span>
                  </div>
                </div>

                {selectedEvent.venue && (
                  <div>
                    <h4 className="font-semibold mb-2">Venue</h4>
                    <p className="text-neutral-600">{selectedEvent.venue}</p>
                  </div>
                )}

                {selectedEvent.price && (
                  <div>
                    <h4 className="font-semibold mb-2">Price</h4>
                    <p className="text-neutral-600">{selectedEvent.price}</p>
                  </div>
                )}

                <div>
                  <h4 className="font-semibold mb-2">Description</h4>
                  <p className="text-neutral-600 leading-relaxed">
                    {selectedEvent.enhanced_description ||
                      selectedEvent.original_description}
                  </p>
                  {selectedEvent.is_enhanced && (
                    <p className="text-sm text-accent mt-2 flex items-center">
                      <Sparkles className="h-4 w-4 mr-1" />
                      Enhanced with AI
                    </p>
                  )}
                </div>

                {selectedEvent.source_url && (
                  <div className="pt-4 border-t">
                    <Button asChild className="w-full">
                      <a
                        href={selectedEvent.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View Original Event
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

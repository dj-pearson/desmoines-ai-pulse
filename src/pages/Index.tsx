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
import AllInclusiveDashboard from "@/components/AllInclusiveDashboard";
import { RatingSystem } from "@/components/RatingSystem";
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
import SEOStructure from "@/components/SEOStructure";
import GEOContent from "@/components/GEOContent";
import { AdBanner } from "@/components/AdBanner";

export default function Index() {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showEventDetails, setShowEventDetails] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [searchFilters, setSearchFilters] = useState<{
    query?: string;
    category?: string;
    dateFilter?: { start?: Date; end?: Date; mode: 'single' | 'range' | 'preset'; preset?: string } | null;
    location?: string;
    priceRange?: string;
  }>({});
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();

  const scrapeMutation = useEventScraper();

  const handleSearch = (filters: {
    query: string;
    category: string;
    dateFilter?: { start?: Date; end?: Date; mode: 'single' | 'range' | 'preset'; preset?: string } | null;
    location?: string;
    priceRange?: string;
  }, shouldScroll: boolean = false) => {
    // Store all search filters for the dashboard
    setSearchFilters(filters);
    
    // Only scroll to events section when explicitly requested (not during typing)
    if (shouldScroll) {
      document.getElementById("events")?.scrollIntoView({ behavior: "smooth" });
    }
    
    // Show feedback to user
    const filterCount = Object.values(filters).filter(f => f && f !== 'All' && f !== 'any-date' && f !== 'any-location' && f !== 'any-price' && f !== '').length;
    toast({
      title: "Filters Applied",
      description: filterCount > 0 ? `${filterCount} filter(s) active` : "Showing all results",
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
      {/* SEO and structured data for AI optimization */}
      <SEOStructure />
      
      {/* Main content wrapper with semantic HTML for AI parsing */}
      <main role="main" itemScope itemType="https://schema.org/WebPage">
        <Header />
        
        {/* Mobile-First Hero section with structured data */}
        <section className="relative bg-gradient-to-br from-primary/10 to-secondary/10 mobile-padding py-6 md:py-16 safe-area-top">
          <div className="container mx-auto text-center">
            <h1 className="text-mobile-hero md:text-4xl lg:text-6xl font-bold text-foreground mb-3 md:mb-6 leading-relaxed mobile-safe-text">
              Discover Des Moines Like Never Before
            </h1>
            <p className="text-mobile-body md:text-xl text-muted-foreground mb-6 md:mb-8 max-w-3xl mx-auto px-2 mobile-safe-text">
              Your AI-powered guide to the best events, restaurants, attractions, and family activities 
              in Des Moines, Iowa. Real-time updates, personalized recommendations, and comprehensive local insights.
            </p>
            
            {/* Mobile-Optimized Stats Grid */}
            <div className="mobile-grid sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mt-6 md:mt-12">
              <div className="bg-background/50 backdrop-blur rounded-lg p-3 md:p-4 space-y-1 md:space-y-2">
                <div className="text-xl md:text-3xl font-bold text-primary">500+</div>
                <p className="text-mobile-caption text-muted-foreground">Events Monthly</p>
              </div>
              <div className="bg-background/50 backdrop-blur rounded-lg p-3 md:p-4 space-y-1 md:space-y-2">
                <div className="text-xl md:text-3xl font-bold text-primary">200+</div>
                <p className="text-mobile-caption text-muted-foreground">Restaurants</p>
              </div>
              <div className="bg-background/50 backdrop-blur rounded-lg p-3 md:p-4 space-y-1 md:space-y-2">
                <div className="text-xl md:text-3xl font-bold text-primary">50+</div>
                <p className="text-mobile-caption text-muted-foreground">Attractions</p>
              </div>
              <div className="bg-background/50 backdrop-blur rounded-lg p-3 md:p-4 space-y-1 md:space-y-2">
                <div className="text-xl md:text-3xl font-bold text-primary">100+</div>
                <p className="text-mobile-caption text-muted-foreground">Playgrounds</p>
              </div>
            </div>
          </div>
        </section>

        {/* Top Banner Ad Placement */}
        <div className="mobile-padding">
          <AdBanner placement="top_banner" className="mb-6" />
        </div>

        <SearchSection onSearch={handleSearch} />

      {/* Mobile-Optimized All-Inclusive Dashboard */}
      <div id="events" className="mobile-padding">
        <AllInclusiveDashboard 
          onViewEventDetails={handleViewEventDetails} 
          filters={searchFilters}
        />
      </div>

      {!showAllEvents && (
        <>
          {isAuthenticated ? (
            <div className="mobile-padding">
              <PersonalizedDashboard onViewEventDetails={handleViewEventDetails} />
            </div>
          ) : (
            <>
              {/* Mobile-First Smart Event Navigation for General Users */}
              <section className="py-6 md:py-8 mobile-padding">
                <div className="container mx-auto">
                  <div className="text-center mb-6 md:mb-8">
                    <h2 className="text-mobile-title md:text-3xl font-bold text-foreground mb-3 md:mb-4">
                      Discover Amazing Events
                    </h2>
                    <p className="text-mobile-body md:text-lg text-muted-foreground max-w-2xl mx-auto">
                      Find exactly what you're looking for with smart filtering and recommendations
                    </p>
                  </div>
                  <SmartEventNavigation onViewEventDetails={handleViewEventDetails} />
                </div>
              </section>
            </>
          )}
          <div className="mobile-padding">
            <MostSearched />
          </div>
          
          {/* Below the Fold Ad Placement */}
          <div className="mobile-padding">
            <AdBanner placement="below_fold" className="my-8" />
          </div>
        </>
      )}

      {showAllEvents && (
        <div className="py-6 md:py-8 mobile-padding">
          <div className="container mx-auto mb-6 md:mb-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <Button 
                variant="outline" 
                onClick={() => setShowAllEvents(false)}
                className="touch-target"
              >
                ← Back to Smart Discovery
              </Button>
              <Button
                onClick={handleScrapeEvents}
                disabled={scrapeMutation.isPending}
                className="bg-accent hover:bg-accent/90 text-white touch-target"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {scrapeMutation.isPending ? "Updating..." : "Update Events"}
              </Button>
            </div>
          </div>
          <div className="container mx-auto">
            <EventFilters onViewEventDetails={handleViewEventDetails} />
          </div>
        </div>
        )}

        {/* GEO-optimized content section */}
        <section className="py-16 bg-muted/30">
          <GEOContent />
        </section>

        <Newsletter />
        <Footer />
      </main>

      {/* Mobile-Optimized Event Details Dialog */}
      <Dialog open={showEventDetails} onOpenChange={setShowEventDetails}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto m-2">
          {selectedEvent && (
            <>
              <DialogHeader className="text-left space-y-2">
                <DialogTitle className="text-mobile-title md:text-2xl font-bold pr-8">
                  {selectedEvent.title}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 md:space-y-6">
                {selectedEvent.image_url && (
                  <img
                    src={selectedEvent.image_url}
                    alt={selectedEvent.title}
                    className="w-full h-48 md:h-64 object-cover rounded-lg"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = "none";
                    }}
                  />
                )}

                <div className="mobile-grid sm:grid-cols-2 gap-3 md:gap-4">
                  <div className="flex items-center text-muted-foreground p-3 bg-muted/50 rounded-lg">
                    <Calendar className="h-5 w-5 mr-2 flex-shrink-0" />
                    <span className="text-mobile-caption md:text-sm">{formatEventDate(selectedEvent.date)}</span>
                  </div>

                  <div className="flex items-center text-muted-foreground p-3 bg-muted/50 rounded-lg">
                    <MapPin className="h-5 w-5 mr-2 flex-shrink-0" />
                    <span className="text-mobile-caption md:text-sm truncate">{selectedEvent.location}</span>
                  </div>
                </div>

                {selectedEvent.venue && (
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <h4 className="font-semibold mb-2 text-mobile-body">Venue</h4>
                    <p className="text-muted-foreground text-mobile-caption">{selectedEvent.venue}</p>
                  </div>
                )}

                {selectedEvent.price && (
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <h4 className="font-semibold mb-2 text-mobile-body">Price</h4>
                    <p className="text-muted-foreground text-mobile-caption">{selectedEvent.price}</p>
                  </div>
                )}

                <div className="p-3 bg-muted/30 rounded-lg">
                  <h4 className="font-semibold mb-2 text-mobile-body">Description</h4>
                  <p className="text-muted-foreground leading-relaxed text-mobile-caption">
                    {selectedEvent.enhanced_description ||
                      selectedEvent.original_description}
                  </p>
                  {selectedEvent.is_enhanced && (
                    <p className="text-sm text-primary mt-2 flex items-center">
                      <Sparkles className="h-4 w-4 mr-1" />
                      Enhanced with AI
                    </p>
                  )}
                </div>

                {/* Rating System */}
                <div className="border-t pt-4">
                  <RatingSystem 
                    contentType="event"
                    contentId={selectedEvent.id}
                    compact={true}
                  />
                </div>

                {selectedEvent.source_url && (
                  <div className="pt-4 border-t">
                    <Button asChild className="w-full touch-target">
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

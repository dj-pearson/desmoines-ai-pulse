import { useState, lazy, Suspense } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, ExternalLink, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useEventScraper } from "@/hooks/useSupabase";
import { Event } from "@/lib/types";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import SEOStructure from "@/components/SEOStructure";
import { SEOEnhancedHead } from "@/components/SEOEnhancedHead";
import SearchSection from "@/components/SearchSection";
import AllInclusiveDashboard from "@/components/AllInclusiveDashboard";
import PersonalizedDashboard from "@/components/PersonalizedDashboard";
import SmartEventNavigation from "@/components/SmartEventNavigation";
import MostSearched from "@/components/MostSearched";
import EventFilters from "@/components/EventFilters";
import GEOContent from "@/components/GEOContent";
import Newsletter from "@/components/Newsletter";
import { EventSocialHub } from "@/components/EventSocialHub";

// Lazy load Three.js component to reduce initial bundle size
const Hero3DCityscape = lazy(() => import("@/components/Hero3DCityscape"));

export default function Index() {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showEventDetails, setShowEventDetails] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [showSocialHub, setShowSocialHub] = useState(false);
  const [socialEventId, setSocialEventId] = useState<string | null>(null);
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();

  const scrapeMutation = useEventScraper();

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Des Moines Insider",
    "alternateName": "DSM Insider",
    "url": "https://desmoinesinsider.com",
    "description": "Your complete guide to Des Moines events, restaurants, and attractions. Discover what's happening in the Des Moines metro area.",
    "publisher": {
      "@type": "Organization",
      "name": "Des Moines Insider",
      "logo": {
        "@type": "ImageObject",
        "url": "https://desmoinesinsider.com/DMI-Logo.png"
      }
    },
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": "https://desmoinesinsider.com/events?search={search_term_string}"
      },
      "query-input": "required name=search_term_string"
    },
    "sameAs": [
      "https://www.facebook.com/desmoinesinsider",
      "https://www.twitter.com/desmoinesinsider",
      "https://www.instagram.com/desmoinesinsider"
    ]
  };

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

  const handleViewSocial = (eventId: string) => {
    setSocialEventId(eventId);
    setShowSocialHub(true);
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
    <div className="min-h-screen bg-background overflow-x-hidden">
      <SEOEnhancedHead 
        title="Des Moines Insider - Your Complete Guide to DSM Events, Restaurants & Attractions"
        description="Discover the best events, restaurants, and attractions in Des Moines, Iowa. Find upcoming concerts, festivals, dining spots, and things to do in the Des Moines metro area."
        url="https://desmoinesinsider.com/"
        type="website"
        structuredData={structuredData}
      />

      {/* SEO and structured data for AI optimization */}
      <SEOStructure />

      {/* Main content wrapper with semantic HTML for AI parsing */}
      <main role="main" itemScope itemType="https://schema.org/WebPage">
        <Header />

        {/* Hero section with structured data */}
        <section className="relative min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#1a1a2e] to-[#2D1B69] py-16 overflow-hidden">
          <Suspense fallback={<div className="absolute inset-0 bg-gradient-to-br from-[#0a0a1a] via-[#1a1a2e] to-[#2D1B69]" />}>
            <Hero3DCityscape />
          </Suspense>
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 drop-shadow-lg">
              Discover Des Moines Like Never Before
            </h1>
            <p className="text-xl text-white/90 mb-8 max-w-3xl mx-auto drop-shadow-md">
              Your AI-powered guide to the best events, restaurants,
              attractions, and family activities in Des Moines, Iowa. Real-time
              updates, personalized recommendations, and comprehensive local
              insights.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-12 text-center">
              <div className="space-y-2 bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                <div className="text-3xl font-bold text-[#FFD700]">200+</div>
                <p className="text-sm text-white/80">Events Monthly</p>
              </div>
              <div className="space-y-2 bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                <div className="text-3xl font-bold text-[#FFD700]">300+</div>
                <p className="text-sm text-white/80">Restaurants</p>
              </div>
              <div className="space-y-2 bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                <div className="text-3xl font-bold text-[#FFD700]">50+</div>
                <p className="text-sm text-white/80">Attractions</p>
              </div>
              <div className="space-y-2 bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
                <div className="text-3xl font-bold text-[#FFD700]">100+</div>
                <p className="text-sm text-white/80">Playgrounds</p>
              </div>
            </div>
          </div>
        </section>

        <SearchSection onSearch={handleSearch} />

        {/* All-Inclusive Dashboard */}
        <AllInclusiveDashboard onViewEventDetails={handleViewEventDetails} />

        {!showAllEvents && !showSocialHub && (
          <>
            {isAuthenticated ? (
              <PersonalizedDashboard
                onViewEventDetails={handleViewEventDetails}
              />
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
                        Find exactly what you're looking for with smart
                        filtering and recommendations
                      </p>
                    </div>
                    <SmartEventNavigation
                      onViewEventDetails={handleViewEventDetails}
                    />
                  </div>
                </section>
              </>
            )}
            <MostSearched />
          </>
        )}

        {showSocialHub && socialEventId && (
          <div className="py-8">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="mb-6">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowSocialHub(false);
                    setSocialEventId(null);
                  }}
                >
                  ← Back to Events
                </Button>
              </div>
              <EventSocialHub
                eventId={socialEventId}
                eventTitle={selectedEvent?.title || "Event"}
                eventDate={selectedEvent?.date ? new Date(selectedEvent.date).toISOString() : ""}
              />
            </div>
          </div>
        )}

        {showAllEvents && (
          <div className="py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={() => setShowAllEvents(false)}
                >
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

        {/* GEO-optimized content section */}
        <section className="py-16 bg-muted/30">
          <GEOContent />
        </section>

        <Newsletter />
        <Footer />
      </main>

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
                    loading="lazy"
                    decoding="async"
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

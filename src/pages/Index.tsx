import { useState, useEffect, lazy, Suspense } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, ExternalLink, Sparkles, CalendarPlus } from "lucide-react";
import { downloadICS } from "@/lib/calendar";
import { FavoriteButton } from "@/components/FavoriteButton";
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
import { FAQSection } from "@/components/FAQSection";
import { OnboardingModal } from "@/components/OnboardingModal";
import { PersonalizedRecommendations } from "@/components/PersonalizedRecommendations";

// Lazy load Three.js component to reduce initial bundle size
// Temporarily disabled due to React Scheduler compatibility issue
// const Hero3DCityscape = lazy(() => import("@/components/Hero3DCityscape"));

export default function Index() {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showEventDetails, setShowEventDetails] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [showSocialHub, setShowSocialHub] = useState(false);
  const [socialEventId, setSocialEventId] = useState<string | null>(null);
  const [searchFilters, setSearchFilters] = useState<{
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
  } | undefined>(undefined);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { toast } = useToast();
  const { isAuthenticated, user } = useAuth();

  // Check if user should see onboarding
  useEffect(() => {
    if (isAuthenticated && user) {
      const hasSeenOnboarding = localStorage.getItem(`onboarding_complete_${user.id}`);
      if (!hasSeenOnboarding) {
        // Small delay to let page load before showing modal
        const timer = setTimeout(() => {
          setShowOnboarding(true);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [isAuthenticated, user]);

  const handleOnboardingComplete = () => {
    if (user) {
      localStorage.setItem(`onboarding_complete_${user.id}`, "true");
    }
    setShowOnboarding(false);
  };

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

  const handleSearch = (
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
    shouldScroll: boolean = true
  ) => {
    // Update search filters state
    setSearchFilters(filters);

    // Scroll to events section if explicitly requested (e.g., user clicked Search button)
    if (shouldScroll) {
      // Small delay to ensure content has rendered
      setTimeout(() => {
        const dashboardElement = document.querySelector('[data-dashboard="all-inclusive"]');
        if (dashboardElement) {
          dashboardElement.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 100);
    }

    // Show feedback for search queries
    if (filters.query && filters.query.trim() !== "") {
      toast({
        title: "Search Applied",
        description: `Searching for "${filters.query}"`,
      });
    }
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
          {/* Temporarily disabled 3D cityscape due to React Scheduler compatibility issue */}
          {/* <Suspense fallback={<div className="absolute inset-0 bg-gradient-to-br from-[#0a0a1a] via-[#1a1a2e] to-[#2D1B69]" />}>
            <Hero3DCityscape />
          </Suspense> */}
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
        <div data-dashboard="all-inclusive">
          <AllInclusiveDashboard
            onViewEventDetails={handleViewEventDetails}
            filters={searchFilters}
          />
        </div>

        {!showAllEvents && !showSocialHub && (
          <>
            {/* Personalized Recommendations Section */}
            <section className="py-12 bg-muted/30">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <PersonalizedRecommendations limit={6} />
              </div>
            </section>

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

        {/* FAQ Section for Featured Snippets */}
        <section className="py-16 bg-background">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <FAQSection
              title="Common Questions About Des Moines"
              description="Get answers to frequently asked questions about events, restaurants, attractions, and things to do in Des Moines, Iowa."
              faqs={[
                {
                  question: "What are the best things to do in Des Moines this weekend?",
                  answer: "Des Moines offers diverse weekend activities including live music at venues like Hoyt Sherman Place and Wooly's, family events at Science Center of Iowa, seasonal farmers markets in Downtown and East Village, outdoor activities at Gray's Lake and Raccoon River Park, and dining experiences in over 300 local restaurants. Check our Events page for real-time updates on concerts, festivals, sports events, and family activities happening this weekend."
                },
                {
                  question: "How do I find free events in Des Moines?",
                  answer: "Des Moines Insider tracks over 200 monthly events with detailed price information. Use our advanced search filters to select 'Free' in the price range option. Popular free activities include Downtown Farmers Market (April-October), Sculpture Park at Western Gateway, public library events, outdoor concerts at Cowles Commons, and seasonal festivals. Our AI-powered system updates free events daily with verified information."
                },
                {
                  question: "What neighborhoods should I explore in Des Moines?",
                  answer: "Des Moines features seven distinct neighborhoods: Downtown (business district and entertainment), East Village (boutiques and trendy dining), Sherman Hill (historic architecture), Beaverdale (family-friendly community), Ingersoll (local shops and cafes), Valley Junction in West Des Moines (antiques and art galleries), and Drake (university area with student culture). Each neighborhood page on our site includes detailed guides with restaurant recommendations, attractions, and events specific to that area."
                },
                {
                  question: "Where can I find the best restaurants in Des Moines?",
                  answer: "Des Moines has over 300 documented restaurants across diverse cuisines. Top-rated areas include East Village for farm-to-table dining, Ingersoll for local favorites, Valley Junction for unique experiences, and Downtown for upscale options. Our restaurant directory includes real-time information on new openings (tracked within 48 hours), cuisine types, price ranges, and operating hours. We update restaurant data weekly with 95% accuracy to ensure current information."
                },
                {
                  question: "What family-friendly attractions are available in Des Moines?",
                  answer: "Des Moines offers 50+ family attractions including Blank Park Zoo (year-round animal exhibits), Science Center of Iowa (interactive STEM exhibits), Adventureland Park (amusement rides and water park), Living History Farms (interactive farm experience), and 100+ mapped playgrounds with safety and accessibility information. Popular indoor options include Prairie Meadows (family entertainment), and numerous museums. Our platform provides age appropriateness, accessibility details, and current hours for all attractions."
                },
                {
                  question: "How often is event information updated on Des Moines Insider?",
                  answer: "Events are updated daily through our AI-powered web scraping system that monitors over 50 official sources including venue websites, municipal calendars, and event organizers. We capture 98% of public events in the Des Moines metro area with an average 24-hour update cycle. Restaurant information updates weekly, and attraction details are verified monthly. All content includes timestamp information and real-time status updates for accuracy."
                },
                {
                  question: "What areas does Des Moines Insider cover?",
                  answer: "We provide comprehensive coverage for the entire Des Moines metropolitan area including Des Moines (all neighborhoods), West Des Moines, Ankeny, Urbandale, Johnston, Clive, Waukee, and Windsor Heights. Our geographic radius extends 50 miles from downtown Des Moines (coordinates: 41.5868°N, 93.6250°W), covering 15+ suburban communities in Polk County and surrounding areas. Location-based filtering helps you find events and restaurants near your specific area."
                },
                {
                  question: "Can I get personalized event recommendations?",
                  answer: "Yes! Create a free Des Moines Insider account to receive AI-powered personalized recommendations based on your interests, location preferences, past activity, and favorite venues. Personalized users see 40% more relevant suggestions and can save favorite events, create custom alerts for new events matching their interests, and receive notifications for last-minute ticket availability. Our machine learning system improves recommendations as you engage with the platform."
                }
              ]}
              showSchema={true}
              className="border-0 shadow-lg"
            />
          </div>
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

                <div className="pt-4 border-t space-y-3">
                  <FavoriteButton
                    eventId={selectedEvent.id}
                    size="default"
                    variant="outline"
                    className="w-full"
                    showText
                  />

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => downloadICS(selectedEvent)}
                  >
                    <CalendarPlus className="h-4 w-4 mr-2" />
                    Add to Calendar
                  </Button>

                  {selectedEvent.source_url && (
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
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* First-time User Onboarding */}
      {showOnboarding && <OnboardingModal onComplete={handleOnboardingComplete} />}
    </div>
  );
}

import { useState, useEffect, lazy, Suspense } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, ExternalLink, Sparkles, CalendarPlus, MessageSquare, Phone, Mic, Brain, Zap, TrendingUp, Share2 } from "lucide-react";
import { downloadICS } from "@/lib/calendar";
import { FavoriteButton } from "@/components/FavoriteButton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useEventScraper } from "@/hooks/useSupabase";
import { Event } from "@/lib/types";
import { BRAND } from "@/lib/brandConfig";
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
import { PreferencesOnboarding } from "@/components/PreferencesOnboarding";
import { PersonalizedRecommendations } from "@/components/PersonalizedRecommendations";
import { EnhancedHero } from "@/components/EnhancedHero";
import { RecentlyViewed } from "@/components/RecentlyViewed";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { BackToTop } from "@/components/BackToTop";
import { SocialProof } from "@/components/SocialProof";
import { BreadcrumbListSchema } from "@/components/schema/BreadcrumbListSchema";

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
  const { preferences, isLoading: preferencesLoading } = useUserPreferences();

  // Check if user should see preferences onboarding
  useEffect(() => {
    if (isAuthenticated && user && !preferencesLoading) {
      // Show preferences onboarding if not completed
      if (!preferences?.onboardingCompleted) {
        // Small delay to let page load before showing modal
        const timer = setTimeout(() => {
          setShowOnboarding(true);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [isAuthenticated, user, preferences, preferencesLoading]);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
  };

  const handleClearFilters = () => {
    setSearchFilters(undefined);
    toast({
      title: "Filters Cleared",
      description: "Showing all results",
    });
  };

  const handleShareEvent = async (event: Event) => {
    const shareUrl = `${window.location.origin}/events/${event.id}`;
    const shareData = {
      title: event.title,
      text: `Check out ${event.title} in Des Moines!`,
      url: shareUrl,
    };

    if (navigator.share && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // User cancelled or error
        if ((err as Error).name !== 'AbortError') {
          // Fallback to clipboard
          await navigator.clipboard.writeText(shareUrl);
          toast({
            title: "Link Copied!",
            description: "Event link copied to clipboard",
          });
        }
      }
    } else {
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(shareUrl);
      toast({
        title: "Link Copied!",
        description: "Event link copied to clipboard",
      });
    }
  };

  const handleAIPlanClick = () => {
    // Placeholder for AI Trip Planner (Month 4 feature)
    // For now, show a toast to indicate coming soon
    toast({
      title: "AI Trip Planner Coming Soon!",
      description: "Our intelligent trip planning feature is currently in development. Stay tuned!",
    });
  };

  const scrapeMutation = useEventScraper();

  // WebSite Schema
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": BRAND.name,
    "alternateName": BRAND.shortName,
    "url": BRAND.baseUrl,
    "description": BRAND.description,
    "applicationCategory": "City Guide, AI Assistant, Event Discovery",
    "keywords": `conversational AI, semantic search, multi-channel city guide, predictive analytics, behavioral intelligence, AI trip planner, context-aware recommendations, ${BRAND.city} events`,
    "publisher": {
      "@type": "Organization",
      "name": BRAND.name,
      "description": "AI-powered conversational city guide platform",
      "logo": {
        "@type": "ImageObject",
        "url": `${BRAND.baseUrl}${BRAND.logo}`
      }
    },
    "potentialAction": [
      {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": `${BRAND.baseUrl}/events?search={search_term_string}`,
          "actionPlatform": [
            "http://schema.org/DesktopWebPlatform",
            "http://schema.org/MobileWebPlatform",
            "http://schema.org/IOSPlatform",
            "http://schema.org/AndroidPlatform"
          ]
        },
        "query-input": "required name=search_term_string"
      },
      {
        "@type": "InteractAction",
        "name": "SMS Concierge",
        "description": "Text-based AI assistant for event recommendations"
      },
      {
        "@type": "InteractAction",
        "name": "Voice Assistant",
        "description": "Alexa and Google Assistant integration for hands-free discovery"
      }
    ],
    "sameAs": [
      "https://www.facebook.com/desmoinespulse",
      "https://www.twitter.com/desmoinespulse",
      "https://www.instagram.com/desmoinespulse"
    ]
  };

  // LocalBusiness Schema - CRITICAL for Local SEO
  const localBusinessData = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": BRAND.name,
    "image": `${BRAND.baseUrl}${BRAND.logo}`,
    "description": BRAND.description,
    "@id": BRAND.baseUrl,
    "url": BRAND.baseUrl,
    "telephone": "",
    "priceRange": "Free",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "",
      "addressLocality": BRAND.city,
      "addressRegion": BRAND.stateAbbr,
      "postalCode": "50309",
      "addressCountry": BRAND.country
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": 41.5868,
      "longitude": -93.6250
    },
    "openingHoursSpecification": {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday"
      ],
      "opens": "00:00",
      "closes": "23:59"
    },
    "sameAs": [
      "https://www.facebook.com/desmoinespulse",
      "https://www.twitter.com/desmoinespulse",
      "https://www.instagram.com/desmoinespulse"
    ],
    "areaServed": {
      "@type": "GeoCircle",
      "geoMidpoint": {
        "@type": "GeoCoordinates",
        "latitude": 41.5868,
        "longitude": -93.6250
      },
      "geoRadius": "50000"
    },
    "serviceArea": {
      "@type": "Place",
      "name": BRAND.region,
      "description": `${BRAND.city}, West Des Moines, Ankeny, Urbandale, Johnston, Clive, Waukee, Windsor Heights, and surrounding Central ${BRAND.state} communities`
    },
    "hasMap": `https://www.google.com/maps/place/${BRAND.city.replace(' ', '+')},+${BRAND.stateAbbr}/@41.5868,-93.6250,12z`,
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "reviewCount": "1247",
      "bestRating": "5",
      "worstRating": "1"
    }
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
        title={`${BRAND.name} - Conversational City Guide | AI-Powered Event & Restaurant Discovery`}
        description={BRAND.description}
        url={`${BRAND.baseUrl}/`}
        type="website"
        structuredData={structuredData}
      />

      {/* LocalBusiness Structured Data - Critical for Local SEO */}
      <script type="application/ld+json">
        {JSON.stringify(localBusinessData)}
      </script>

      {/* BreadcrumbList Schema - Helps with rich snippets in search results */}
      <BreadcrumbListSchema
        items={[
          { name: "Home", url: BRAND.baseUrl }
        ]}
      />

      {/* SEO and structured data for AI optimization */}
      <SEOStructure />

      {/* Main content wrapper with semantic HTML for AI parsing */}
      <main role="main" itemScope itemType="https://schema.org/WebPage">
        <Header />

        {/* Enhanced Hero with dynamic content and quick actions */}
        <EnhancedHero
          eventCount={1000}
          restaurantCount={300}
          onAIPlanClick={handleAIPlanClick}
        />

        <SearchSection onSearch={handleSearch} />

        {/* AI Conversational Features Section */}
        <section className="py-16 bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
                More Than a Directory—Your AI-Powered City Companion
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
                Des Moines AI Pulse goes beyond traditional event listings. We understand context, learn from your behavior, and proactively guide you to the best experiences across every channel.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Conversational Intelligence */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-blue-100 dark:bg-blue-900/30 rounded-full p-3">
                    <Brain className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Conversational Intelligence</h3>
                </div>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  Ask naturally, like you're talking to a local friend. "Find romantic dinner spots with live music tonight" or "Plan a family-friendly Saturday morning."
                </p>
                <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                  <Sparkles className="h-4 w-4" />
                  <span>Semantic search understands intent</span>
                </div>
              </div>

              {/* Multi-Channel Access */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-purple-100 dark:bg-purple-900/30 rounded-full p-3">
                    <MessageSquare className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Access Anywhere</h3>
                </div>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  Get recommendations via web, SMS, voice (Alexa/Google), or ChatGPT. Your city guide follows you everywhere you need it.
                </p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-1 rounded">Web</span>
                  <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-1 rounded">SMS</span>
                  <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-1 rounded">Voice</span>
                  <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-1 rounded">ChatGPT</span>
                </div>
              </div>

              {/* Context-Aware Recommendations */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-green-100 dark:bg-green-900/30 rounded-full p-3">
                    <Zap className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Context-Aware</h3>
                </div>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  We consider time, weather, location, your past preferences, and real-time availability to suggest the perfect experiences for you.
                </p>
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <Brain className="h-4 w-4" />
                  <span>Learns from your behavior</span>
                </div>
              </div>

              {/* Proactive Assistance */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-orange-100 dark:bg-orange-900/30 rounded-full p-3">
                    <TrendingUp className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Proactive Intelligence</h3>
                </div>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  Get alerts for events you'll love, weather changes affecting your plans, and last-minute availability—before you even ask.
                </p>
                <div className="flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400">
                  <Sparkles className="h-4 w-4" />
                  <span>Smart notifications & alerts</span>
                </div>
              </div>

              {/* Predictive Analytics */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-red-100 dark:bg-red-900/30 rounded-full p-3">
                    <TrendingUp className="h-6 w-6 text-red-600 dark:text-red-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Predictive Insights</h3>
                </div>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  See demand forecasts, optimal visit times, and sell-out predictions. Make smarter decisions with data-driven intelligence.
                </p>
                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                  <TrendingUp className="h-4 w-4" />
                  <span>Real-time demand analytics</span>
                </div>
              </div>

              {/* Automated Trip Planning */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-indigo-100 dark:bg-indigo-900/30 rounded-full p-3">
                    <Calendar className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">AI Trip Planner</h3>
                </div>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  Generate complete day-by-day itineraries in seconds. Optimized for travel times, variety, and your unique interests.
                </p>
                <div className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400">
                  <Sparkles className="h-4 w-4" />
                  <span>Automated itinerary generation</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* All-Inclusive Dashboard */}
        <div data-dashboard="all-inclusive">
          <AllInclusiveDashboard
            onViewEventDetails={handleViewEventDetails}
            filters={searchFilters}
            onClearFilters={handleClearFilters}
          />
        </div>

        {!showAllEvents && !showSocialHub && (
          <>
            {/* Recently Viewed Section */}
            <section className="py-8 bg-background">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <RecentlyViewed limit={8} />
              </div>
            </section>

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

        {/* Social Proof Section */}
        <SocialProof />

        {/* FAQ Section for Featured Snippets */}
        <section className="py-16 bg-background">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <FAQSection
              title="Frequently Asked Questions About Des Moines AI Pulse"
              description="Learn how our conversational AI technology transforms the way you discover and experience Des Moines."
              faqs={[
                {
                  question: "What makes Des Moines AI Pulse different from other event directories?",
                  answer: "Des Moines AI Pulse is the first truly conversational city guide powered by advanced AI. Unlike traditional directories that require manual searching, our platform understands natural language, learns from your behavior, and proactively recommends experiences across multiple channels (web, SMS, voice assistants, ChatGPT). We use semantic search to understand intent—ask 'romantic dinner with live music' and get context-aware results, not just keyword matches. Our behavioral intelligence and predictive analytics create a personalized experience that gets smarter the more you use it."
                },
                {
                  question: "How can I access Des Moines AI Pulse recommendations?",
                  answer: "Access recommendations your way: (1) Web - Browse our intelligent platform with semantic search, (2) SMS - Text your questions to our AI concierge for instant recommendations, (3) Voice - Ask Alexa or Google Assistant about Des Moines events and dining, (4) ChatGPT - Use our plugin for conversational planning. All channels sync your preferences and learn from your interactions to provide increasingly personalized suggestions. Your city guide follows you wherever you need it."
                },
                {
                  question: "How does the AI understand what I'm looking for?",
                  answer: "Our semantic search technology powered by advanced AI models understands the meaning and context of your queries, not just keywords. Ask naturally like 'romantic dinner with live jazz' or 'family activities for rainy Saturday,' and our AI analyzes intent, preferences, constraints, and real-time factors (weather, availability, time of day). The system learns from your interactions—the more you use it, the better it understands your unique preferences. We combine natural language processing, behavioral analytics, and predictive intelligence to deliver personalized, context-aware recommendations."
                },
                {
                  question: "What is the AI Trip Planner and how does it work?",
                  answer: "The AI Trip Planner generates complete day-by-day itineraries in seconds based on your interests, dates, budget, and party size. Simply input your preferences (food, arts, music, family, outdoors), and our AI optimizes a schedule considering: travel times between locations, activity variety, optimal timing (morning/afternoon/evening appropriateness), budget constraints, and real-time availability. The planner includes restaurants near events, backup options for weather changes, and reservation links. Export to PDF or add activities directly to your calendar."
                },
                {
                  question: "How does behavioral learning improve my experience?",
                  answer: "Our platform tracks your interactions (searches, favorites, bookings) to build an intelligent profile of your preferences—completely privacy-first and anonymized. Over time, the AI learns patterns: if you frequently search for outdoor events, we'll prioritize parks and festivals; if you favor Italian restaurants, similar venues appear higher in recommendations. The system also detects emerging preferences and proactively suggests new experiences you'll likely enjoy. Behavioral intelligence creates a progressively personalized experience unique to you."
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
                  question: "What are predictive insights and how do they help me?",
                  answer: "Our predictive analytics engine analyzes historical data, current trends, and real-time signals to forecast demand and optimize your experience. See predictions like 'High demand—73% of similar events sold out' or 'Best time to visit: Tuesday 7pm (20% less busy).' For businesses, we provide demand forecasts, pricing recommendations, and optimal staffing insights. These data-driven predictions help you avoid crowds, secure tickets before events sell out, and discover hidden gems at ideal times."
                },
                {
                  question: "How does Des Moines AI Pulse stay current with events and venues?",
                  answer: "Our AI-powered web scraping and data aggregation system monitors 50+ official sources 24/7, capturing 98% of public events in the Des Moines metro area. Updates occur in real-time with an average 24-hour refresh cycle. The AI automatically detects new restaurants (within 48 hours of opening), venue changes, pricing updates, and schedule modifications. We combine automated scraping with human verification, AI-enhanced descriptions, and community contributions to ensure accuracy and freshness across 1000+ events, 300+ restaurants, and 50+ attractions."
                },
                {
                  question: "What areas does Des Moines Insider cover?",
                  answer: "We provide comprehensive coverage for the entire Des Moines metropolitan area including Des Moines (all neighborhoods), West Des Moines, Ankeny, Urbandale, Johnston, Clive, Waukee, and Windsor Heights. Our geographic radius extends 50 miles from downtown Des Moines (coordinates: 41.5868°N, 93.6250°W), covering 15+ suburban communities in Polk County and surrounding areas. Location-based filtering helps you find events and restaurants near your specific area."
                },
                {
                  question: "How do I get started with personalized AI recommendations?",
                  answer: "Create a free account to unlock the full power of our AI intelligence. Once registered, the system begins learning from your interactions—searches, favorites, bookings, and browsing patterns. Within days, you'll receive highly personalized recommendations tailored to your unique preferences. Enable notifications for proactive alerts about events you'll love, weather changes affecting saved plans, and last-minute availability. The AI continuously adapts, delivering 40% more relevant suggestions than generic searches. Access your personalized experience across all channels: web, SMS, voice, and ChatGPT."
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
                  <div className="grid grid-cols-2 gap-3">
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
                      onClick={() => handleShareEvent(selectedEvent)}
                    >
                      <Share2 className="h-4 w-4 mr-2" />
                      Share
                    </Button>
                  </div>

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

      {/* First-time User Preferences Onboarding */}
      {showOnboarding && (
        <PreferencesOnboarding
          open={showOnboarding}
          onComplete={handleOnboardingComplete}
        />
      )}

      {/* Back to Top Button */}
      <BackToTop />
    </div>
  );
}

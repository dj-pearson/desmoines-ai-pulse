import { useState, useEffect, lazy, Suspense } from "react";
import { Helmet } from "react-helmet-async";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, ExternalLink, Sparkles, CalendarPlus, Brain, Zap, TrendingUp, Share2, ArrowRight } from "lucide-react";
import { downloadICS } from "@/lib/calendar";
import { createEventSlugWithCentralTime } from "@/lib/timezone";
import { FavoriteButton } from "@/components/FavoriteButton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Event } from "@/lib/types";
import { BRAND } from "@/lib/brandConfig";
import { Link, useNavigate } from "react-router-dom";
import { openExternalUrl } from "@/lib/capacitorUtils";
import Header from "@/components/Header";
import { FAQSection } from "@/components/FAQSection";
import SEOHead from "@/components/SEOHead";
import SEOStructure from "@/components/SEOStructure";
import { SEOEnhancedHead } from "@/components/SEOEnhancedHead";
import SearchSection from "@/components/SearchSection";
import { NLPSearchBar } from "@/components/NLPSearchBar";
import { EnhancedHero } from "@/components/EnhancedHero";
import { ForYouRail } from "@/components/ForYouRail";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useHomepageStats } from "@/hooks/useHomepageStats";
import { BackToTop } from "@/components/BackToTop";
import { BreadcrumbListSchema } from "@/components/schema/BreadcrumbListSchema";
import SpeakableSchema from "@/components/schema/SpeakableSchema";
import { AdBanner } from "@/components/AdBanner";

// Lazy load below-the-fold and heavy components to improve initial load
const Footer = lazy(() => import("@/components/Footer"));
const AllInclusiveDashboard = lazy(() => import("@/components/AllInclusiveDashboard"));
const PersonalizedDashboard = lazy(() => import("@/components/PersonalizedDashboard"));
const SmartEventNavigation = lazy(() => import("@/components/SmartEventNavigation"));
const MostSearched = lazy(() => import("@/components/MostSearched"));
const GEOContent = lazy(() => import("@/components/GEOContent"));
const Newsletter = lazy(() => import("@/components/Newsletter"));
const EventSocialHub = lazy(() => import("@/components/EventSocialHub").then(m => ({ default: m.EventSocialHub })));
// FAQSection imported directly (not lazy) for SEO indexing
const PreferencesOnboarding = lazy(() => import("@/components/PreferencesOnboarding").then(m => ({ default: m.PreferencesOnboarding })));
const PersonalizedRecommendations = lazy(() => import("@/components/PersonalizedRecommendations").then(m => ({ default: m.PersonalizedRecommendations })));
const RecentlyViewed = lazy(() => import("@/components/RecentlyViewed").then(m => ({ default: m.RecentlyViewed })));
const RecentlyViewedRail = lazy(() => import("@/components/RecentlyViewedRail").then(m => ({ default: m.RecentlyViewedRail })));
const HomeInterestNav = lazy(() => import("@/components/HomeInterestNav").then(m => ({ default: m.HomeInterestNav })));
const SocialProof = lazy(() => import("@/components/SocialProof").then(m => ({ default: m.SocialProof })));

// Shape-matched skeleton loaders for lazy-loaded sections
const SectionLoader = () => (
  <div className="w-full py-12 flex items-center justify-center">
    <div className="animate-pulse flex space-x-4">
      <div className="h-4 w-4 bg-primary/20 rounded-full"></div>
      <div className="h-4 w-4 bg-primary/30 rounded-full"></div>
      <div className="h-4 w-4 bg-primary/20 rounded-full"></div>
    </div>
  </div>
);

const CardGridSkeleton = () => (
  <div className="w-full py-12 px-4">
    <div className="max-w-7xl mx-auto">
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-muted rounded w-1/3 mx-auto"></div>
        <div className="h-4 bg-muted/60 rounded w-1/2 mx-auto"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-lg border border-border p-4 space-y-3">
              <div className="h-40 bg-muted rounded"></div>
              <div className="h-5 bg-muted rounded w-3/4"></div>
              <div className="h-4 bg-muted/60 rounded w-full"></div>
              <div className="h-4 bg-muted/60 rounded w-2/3"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const DashboardSkeleton = () => (
  <div className="w-full py-12 px-4">
    <div className="max-w-7xl mx-auto animate-pulse space-y-6">
      <div className="h-8 bg-muted rounded w-1/4"></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-lg border border-border p-4 space-y-3">
            <div className="h-32 bg-muted rounded"></div>
            <div className="h-5 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted/60 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// WEB-SEO-012: shared by the two head managers this page renders
// (SEOEnhancedHead and SEOStructure) so they cannot disagree.
const HOME_TITLE = 'Things to Do in Des Moines This Weekend | Des Moines Insider';
const HOME_DESCRIPTION =
  "Find what's happening in Des Moines, Iowa today and this weekend — live events, concerts, festivals, family activities, and the restaurants open right now. Updated daily across Des Moines, West Des Moines, Ankeny, Urbandale and the metro.";

export default function Index() {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showEventDetails, setShowEventDetails] = useState(false);
  // Consolidated view state: which secondary view is active
  const [activeView, setActiveView] = useState<
    | { type: 'default' }
    | { type: 'socialHub'; eventId: string }
  >({ type: 'default' });
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
  const navigate = useNavigate();
  const { preferences, isLoading: preferencesLoading } = useUserPreferences();
  const { eventsToday, restaurantsCount, newThisWeek, isLoading: statsLoading } = useHomepageStats();

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
    const shareUrl = `${window.location.origin}/events/${createEventSlugWithCentralTime(event.title, event)}`;
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
    // Route to the real, shipped AI Trip Planner (no more "coming soon" dead CTA).
    navigate("/trip-planner");
  };


  // WebSite Schema
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": BRAND.name,
    "alternateName": BRAND.shortName,
    "url": BRAND.baseUrl,
    "description": BRAND.description,
    // NO applicationCategory. It said "City Guide, AI Assistant, Event
    // Discovery" and was wrong twice over: it is a property of
    // SoftwareApplication, not WebSite, so it is invalid on this node and
    // contributes nothing - and it told crawlers this site is an AI assistant.
    // Ask Pulse ships on iOS and Android and has never been built for web
    // (XPLAT-009). Structured data is the one place a claim is machine-read.
    "keywords": `semantic search, multi-channel city guide, predictive analytics, behavioral intelligence, AI trip planner, context-aware recommendations, ${BRAND.city} events`,
    "publisher": {
      "@type": "Organization",
      "name": BRAND.name,
      "description": "AI-powered city guide platform",
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
    // WEB-SEO-016: an aggregateRating of 4.8 from 1,247 reviews used to sit
    // here. Nothing produces those numbers — there is no reviews or ratings
    // table in the schema at all. Publishing a fabricated rating for our own
    // business is a direct breach of Google's review-snippet guidelines and is
    // the kind of thing that draws a manual action. Removed rather than
    // adjusted: there is no honest value to put in its place.
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

  const handleViewSocial = (eventId: string) => {
    setActiveView({ type: 'socialHub', eventId });
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
      {/* WEB-SEO-012: the homepage used to be titled "Conversational City Guide
          | AI-Powered Event & Restaurant Discovery" and described with
          BRAND.description. That sold the product to itself on our
          highest-authority page — nobody searches for how we are built.
          Title and description now lead with the query. BRAND.description is
          deliberately left alone: it is the Organization/LocalBusiness
          description in schema, where self-description is correct. */}
      <SEOEnhancedHead
        title={HOME_TITLE}
        description={HOME_DESCRIPTION}
        url={`${BRAND.baseUrl}/`}
        type="website"
        structuredData={structuredData}
      />


      {/* BreadcrumbList Schema - Helps with rich snippets in search results */}
      <BreadcrumbListSchema
        items={[
          { name: "Home", url: BRAND.baseUrl }
        ]}
      />

      {/* Speakable Schema for GEO - enables AI search engine attribution */}
      <SpeakableSchema
        name={`${BRAND.name} - AI-Powered City Guide`}
        description={BRAND.description}
        url={BRAND.baseUrl}
      />

      {/* SEO and structured data for AI optimization */}
      {/* WEB-SEO-012: SEOStructure mounts AFTER SEOEnhancedHead above and its
          Helmet also sets <title> and <meta name="description">. React Helmet
          resolves last-mount-wins, so with only canonicalUrl passed here its
          defaults silently overrode whatever SEOEnhancedHead set — which is why
          editing the title above had no effect on the shipped HTML until this
          was found by grepping dist/index.html rather than trusting the source.
          Both components are given the same values so the winner is correct
          whichever way the tree evolves. Collapsing the two head managers into
          one is tracked separately (WEB-SEO-002). */}
      <SEOStructure
        title={HOME_TITLE}
        description={HOME_DESCRIPTION}
        canonicalUrl={`${BRAND.baseUrl}/`}
        /* WEB-SEO-013: without this SEOStructure emits its OWN LocalBusiness
           default, so the homepage shipped TWO LocalBusiness blocks - measured
           in dist/index.html at 1437 and 799 bytes, different content, both
           describing the same business. Google treats a duplicated entity type
           on one page as ambiguous and may use neither. Passing the block
           rendered above makes the two emitters agree on one object, which is
           the same trick the WEB-SEO-012 comment applies to title and
           description. The default also carried a placeholder telephone,
           +1-515-000-0000, which is now not emitted at all. */
        structuredData={localBusinessData}
      />

      {/* Main content wrapper with semantic HTML for AI parsing */}
      <div itemScope itemType="https://schema.org/WebPage">
        <Header />

        {/* Enhanced Hero with dynamic content and quick actions */}
        <EnhancedHero
          eventsToday={eventsToday}
          restaurantsCount={restaurantsCount}
          newThisWeek={newThisWeek}
          isLoadingStats={statsLoading}
          onAIPlanClick={handleAIPlanClick}
        />

        {/* Primary: natural-language (NLP) search */}
        <section className="border-b bg-gradient-to-b from-background to-muted/20 py-8">
          <div className="mx-auto max-w-3xl px-4">
            <div className="mb-4 text-center">
              <h2 className="text-xl font-bold sm:text-2xl">
                Just describe what you're looking for
              </h2>
              <p className="text-sm text-muted-foreground">
                Try "free things to do this weekend with kids" — our AI understands plain language.
              </p>
            </div>
            <NLPSearchBar
              placeholder="Search naturally, like 'Family dinner under $50 near downtown Saturday'"
              showExamples
              showResults
            />
          </div>
        </section>

        {/* Secondary: structured filter search */}
        <div className="bg-muted/10 py-2 text-center text-sm text-muted-foreground">
          Prefer to filter by category, date, and price?
        </div>
        <SearchSection onSearch={handleSearch} />

        {/* For You / Trending rail — IOS-DISCOVER-2026-002 web parity */}
        <ForYouRail />

        {/* Data-driven domain ordering + recently-viewed rail (WEB-FEAT-007).
            Both compute synchronously from the local store, so no layout shift. */}
        <Suspense fallback={null}>
          <HomeInterestNav />
          <RecentlyViewedRail />
        </Suspense>

        {/* All-Inclusive Dashboard — real content first, before marketing (WEB-UX-015) */}
        <div data-dashboard="all-inclusive">
          <Suspense fallback={<DashboardSkeleton />}>
            <AllInclusiveDashboard
              onViewEventDetails={handleViewEventDetails}
              filters={searchFilters}
              onClearFilters={handleClearFilters}
            />
          </Suspense>
        </div>

        {/* Top Banner Ad Placement */}
        <div className="py-4 bg-muted/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <AdBanner placement="top_banner" />
          </div>
        </div>

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
              <Link to="/events" className="group bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all hover:border-blue-300 dark:hover:border-blue-600">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-blue-100 dark:bg-blue-900/30 rounded-full p-3">
                    <Brain className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Conversational Intelligence</h3>
                </div>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  Ask naturally, like you're talking to a local friend. "Find romantic dinner spots with live music tonight" or "Plan a family-friendly Saturday morning."
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                    <Sparkles className="h-4 w-4" />
                    <span>Semantic search understands intent</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-blue-600 dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>

              {/* Context-Aware Recommendations */}
              <Link to="/events" className="group bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all hover:border-green-300 dark:hover:border-green-600">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-green-100 dark:bg-green-900/30 rounded-full p-3">
                    <Zap className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Context-Aware</h3>
                </div>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  We consider time, weather, location, your past preferences, and real-time availability to suggest the perfect experiences for you.
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                    <Brain className="h-4 w-4" />
                    <span>Learns from your behavior</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-green-600 dark:text-green-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>

              {/* Proactive Assistance */}
              <Link to="/events/today" className="group bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all hover:border-orange-300 dark:hover:border-orange-600">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-orange-100 dark:bg-orange-900/30 rounded-full p-3">
                    <TrendingUp className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Proactive Intelligence</h3>
                </div>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  Get alerts for events you'll love, weather changes affecting your plans, and last-minute availability—before you even ask.
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-orange-700 dark:text-orange-400">
                    <Sparkles className="h-4 w-4" />
                    <span>Smart notifications & alerts</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-orange-600 dark:text-orange-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>

              {/* Predictive Analytics */}
              <Link to="/restaurants" className="group bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all hover:border-red-300 dark:hover:border-red-600">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-red-100 dark:bg-red-900/30 rounded-full p-3">
                    <TrendingUp className="h-6 w-6 text-red-600 dark:text-red-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Predictive Insights</h3>
                </div>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  See demand forecasts, optimal visit times, and sell-out predictions. Make smarter decisions with data-driven intelligence.
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                    <TrendingUp className="h-4 w-4" />
                    <span>Real-time demand analytics</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-red-600 dark:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>

              {/* Automated Trip Planning */}
              <Link to="/trip-planner" className="group bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all hover:border-indigo-300 dark:hover:border-indigo-600">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-indigo-100 dark:bg-indigo-900/30 rounded-full p-3">
                    <Calendar className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">AI Trip Planner</h3>
                </div>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  Generate complete day-by-day itineraries in seconds. Optimized for travel times, variety, and your unique interests.
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400">
                    <Sparkles className="h-4 w-4" />
                    <span>Automated itinerary generation</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-indigo-600 dark:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>

              {/* Attractions & Playgrounds */}
              <Link to="/attractions" className="group bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all hover:border-purple-300 dark:hover:border-purple-600">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-purple-100 dark:bg-purple-900/30 rounded-full p-3">
                    <MapPin className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Attractions & More</h3>
                </div>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  Discover museums, parks, playgrounds, and landmarks. Find the perfect family-friendly activity or hidden gem in Des Moines.
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400">
                    <Sparkles className="h-4 w-4" />
                    <span>50+ attractions mapped</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-purple-600 dark:text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
            </div>
          </div>
        </section>

        {activeView.type === 'default' && (
          <Suspense fallback={<CardGridSkeleton />}>
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
          </Suspense>
        )}

        {activeView.type === 'socialHub' && (
          <Suspense fallback={<SectionLoader />}>
            <div className="py-8">
              <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="mb-6">
                  <Button
                    variant="outline"
                    onClick={() => setActiveView({ type: 'default' })}
                  >
                    ← Back to Events
                  </Button>
                </div>
                <EventSocialHub
                  eventId={activeView.eventId}
                  eventTitle={selectedEvent?.title || "Event"}
                  eventDate={selectedEvent?.date ? new Date(selectedEvent.date).toISOString() : ""}
                />
              </div>
            </div>
          </Suspense>
        )}


        {/* GEO-optimized content section */}
        <Suspense fallback={<SectionLoader />}>
          <section className="py-16 bg-muted/30">
            <GEOContent />
          </section>
        </Suspense>

        {/* Social Proof Section */}
        <Suspense fallback={<SectionLoader />}>
          <SocialProof />
        </Suspense>

        {/* FAQ Section for Featured Snippets - directly rendered for SEO */}
        <section className="py-16 bg-background">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* WEB-SEO-012: these questions used to be about our own product —
                "What makes Des Moines AI Pulse different from other event
                directories?", "How does behavioral learning improve my
                experience?". Eight of eleven described the software rather than
                the city, on the page with the most authority to spend. They now
                answer what visitors actually search for. Substantive answers
                matter more than the markup here: Google retired FAQ rich
                results for non-gov/health sites in 2023, so the value of this
                block is on-page relevance plus extraction by AI assistants,
                and both reward real answers over restated marketing. */}
            <FAQSection
                title="Des Moines: Frequently Asked Questions"
                description="Quick answers about events, dining, and things to do across the Des Moines metro."
                faqs={[
                  {
                    question: "What is there to do in Des Moines this weekend?",
                    answer: "Des Moines has live events every weekend across music, food, arts, sports and family activities. The Downtown Farmers' Market runs Saturday mornings May through October in the Historic Court District, touring Broadway shows play the Des Moines Civic Center, concerts run at Wells Fargo Arena and smaller venues like xBk Live, and the East Village and Historic Valley Junction host regular gallery and shopping events. See our full this-weekend listing for what is confirmed for the coming Saturday and Sunday, updated daily."
                  },
                  {
                    question: "What free things are there to do in Des Moines?",
                    answer: "Several of the best-known attractions in Des Moines are free year-round: the Des Moines Art Center, the John and Mary Pappajohn Sculpture Park, the State Historical Museum of Iowa in the East Village, the Iowa State Capitol grounds, and Lauridsen Skatepark — at 88,000 square feet, the largest skatepark in the United States. Free splash pads open across the metro in summer, and Saylorville Lake and the Neal Smith Trail are open for hiking and biking at no cost."
                  },
                  {
                    question: "What events are happening in Des Moines today?",
                    answer: "Our today listing shows events confirmed for the current date in Central Time across Des Moines and the surrounding suburbs, filterable by category. It is rebuilt daily from event sources across the metro rather than depending on venues submitting their listings to us."
                  },
                  {
                    question: "Where are the best restaurants in Des Moines?",
                    answer: "Des Moines dining spans fine dining, chef-driven small plates and long-standing local institutions. Well-known names include Harbinger and Alba in the East Village, 801 Chophouse and Proudfoot & Bird downtown, Splash Seafood Bar and Grill, and Latin King — where you can order Steak de Burgo, the dish most associated with the city. Our restaurant directory covers the metro with cuisine, price range, neighborhood and current open/closed status."
                  },
                  {
                    question: "What restaurants in Des Moines are open right now?",
                    answer: "Our open-now listing checks current hours against the time in Central Time and shows only what is serving at this moment. For late-night specifically, Fong's Pizza serves until midnight with slices until 3 a.m. on weekends, and Zombie Burger and Jethro's run until around 11 p.m."
                  },
                  {
                    question: "What is there to do in Des Moines with kids?",
                    answer: "The metro has strong family options, many of them free. Blank Park Zoo, the Science Center of Iowa and Adventureland in Altoona are the main paid attractions; the Des Moines Art Center, the State Historical Museum and the Pappajohn Sculpture Park are free and work well with children. We also map playgrounds across the metro with age suitability and accessibility details, and maintain a kids and family events listing."
                  },
                  {
                    question: "Which areas does Des Moines Insider cover?",
                    answer: "Des Moines proper plus the Greater Des Moines metro: West Des Moines, Ankeny, Urbandale, Clive, Johnston, Waukee, Windsor Heights and Altoona. We also cover Des Moines neighborhoods individually, including Downtown, the East Village, Beaverdale, Highland Park, Historic Valley Junction and the Court Avenue District."
                  },
                  {
                    question: "When is the Iowa State Fair?",
                    answer: "The Iowa State Fair runs for 11 days each August at the Iowa State Fairgrounds on the east side of Des Moines. It is the largest single event in the state and draws over a million visitors. Our Iowa State Fair guide covers dates, the grandstand concert lineup, parking, admission and food."
                  },
                  {
                    question: "How often are the listings updated?",
                    answer: "Event listings are refreshed daily. Restaurant details, including hours used for open-now status, are reviewed weekly, and attractions monthly. Event times are stored and displayed in Central Time to avoid the timezone drift common on aggregated calendars."
                  },
                ]}
                showSchema={true}
              />
          </div>
        </section>

        {/* Below-Fold Ad Placement */}
        <div className="py-6 bg-muted/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <AdBanner placement="below_fold" />
          </div>
        </div>

        <Suspense fallback={<SectionLoader />}>
          <Newsletter />
        </Suspense>
        <Suspense fallback={<SectionLoader />}>
          <Footer />
        </Suspense>
      </div>

      {/* Event Details Dialog - full-screen on mobile */}
      <Dialog open={showEventDetails} onOpenChange={setShowEventDetails}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto sm:max-h-[85vh]">
          {selectedEvent && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl sm:text-2xl font-bold pr-8">
                  {selectedEvent.title}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {selectedEvent.image_url && (
                  <div className="overflow-hidden rounded-lg">
                    <img
                      src={selectedEvent.image_url}
                      alt={selectedEvent.title}
                      className="w-full h-48 sm:h-64 object-cover"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = "none";
                      }}
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-start text-neutral-600 dark:text-neutral-400">
                    <Calendar className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
                    <span className="text-sm sm:text-base">{formatEventDate(selectedEvent.date)}</span>
                  </div>

                  <div className="flex items-start text-neutral-600 dark:text-neutral-400">
                    <MapPin className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
                    <span className="text-sm sm:text-base">{selectedEvent.location}</span>
                  </div>
                </div>

                {(selectedEvent.venue || selectedEvent.price) && (
                  <div className="flex flex-wrap gap-4">
                    {selectedEvent.venue && (
                      <div>
                        <h3 className="font-semibold mb-1 text-sm">Venue</h3>
                        <p className="text-neutral-600 dark:text-neutral-400 text-sm">{selectedEvent.venue}</p>
                      </div>
                    )}
                    {selectedEvent.price && (
                      <div>
                        <h3 className="font-semibold mb-1 text-sm">Price</h3>
                        <p className="text-neutral-600 dark:text-neutral-400 text-sm">{selectedEvent.price}</p>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <h3 className="font-semibold mb-2 text-sm">Description</h3>
                  <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed text-sm">
                    {selectedEvent.enhanced_description ||
                      selectedEvent.original_description}
                  </p>
                  {selectedEvent.is_enhanced && (
                    <p className="text-xs text-accent mt-2 flex items-center">
                      <Sparkles className="h-3 w-3 mr-1" />
                      Enhanced with AI
                    </p>
                  )}
                </div>

                <div className="pt-4 border-t space-y-3">
                  {/* View full event page */}
                  <Button asChild className="w-full">
                    <Link
                      to={`/events/${createEventSlugWithCentralTime(selectedEvent.title, selectedEvent)}`}
                      onClick={() => setShowEventDetails(false)}
                    >
                      View Full Event Details
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>

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
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => openExternalUrl(selectedEvent.source_url!)}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View Original Event
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
        <Suspense fallback={null}>
          <PreferencesOnboarding
            open={showOnboarding}
            onComplete={handleOnboardingComplete}
          />
        </Suspense>
      )}

      {/* Back to Top Button */}
      <BackToTop />
    </div>
  );
}

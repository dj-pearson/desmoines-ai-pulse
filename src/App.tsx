import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { RouteErrorBoundary } from "@/components/ui/route-error-boundary";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense, useState, useEffect, ComponentType } from "react";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useKeyboardAware } from "@/hooks/useKeyboardAware";
import { usePageTransition } from "@/hooks/usePageTransition";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useDeepLinks } from "@/hooks/useDeepLinks";
import { useSwipeBack } from "@/hooks/useSwipeBack";
import { useStatusBarStyle } from "@/hooks/useStatusBarStyle";
import { useFocusOnRouteChange } from "@/hooks/useFocusOnRouteChange";
import { usePageTracking } from "@/hooks/usePageTracking";
import { useLocation } from "react-router-dom";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { WelcomeModal } from "@/components/WelcomeModal";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import BottomNav from "@/components/BottomNav";
import { AuthProvider } from "@/contexts/AuthContext";
import { AccessibilityProvider } from "@/contexts/AccessibilityContext";
import { AccessibilityWidget } from "@/components/AccessibilityWidget";
import { SessionManager } from "@/components/auth/SessionManager";
import { OfflineBanner } from "@/components/OfflineBanner";

/**
 * Wrapper around React.lazy that retries once on chunk load failure,
 * then does a hard page reload to pick up the latest deployment.
 * Prevents "Loading..." forever when Cloudflare purges old JS chunks.
 */
function lazyWithRetry(
  importFn: () => Promise<{ default: ComponentType<any> }>
) {
  return lazy(() =>
    importFn().catch((error) => {
      const hasReloaded = sessionStorage.getItem("chunk_reload");
      if (!hasReloaded) {
        sessionStorage.setItem("chunk_reload", "1");
        window.location.reload();
        return new Promise(() => {}); // never resolves; reload will take over
      }
      sessionStorage.removeItem("chunk_reload");
      throw error; // let the error boundary handle it
    })
  );
}

// Lazy load pages for better mobile performance
const Index = lazyWithRetry(() => import("./pages/Index"));
const Auth = lazyWithRetry(() => import("./pages/Auth"));
const AuthCallback = lazyWithRetry(() => import("./pages/AuthCallback"));
const AuthVerified = lazyWithRetry(() => import("./pages/AuthVerified"));
const Profile = lazyWithRetry(() => import("./pages/Profile"));
const ProfilePage = lazyWithRetry(() => import("./pages/ProfilePage"));
const UserDashboard = lazyWithRetry(() => import("./pages/UserDashboard"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const Admin = lazyWithRetry(() => import("./pages/Admin"));
const Restaurants = lazyWithRetry(() => import("./pages/Restaurants"));
const Attractions = lazyWithRetry(() => import("./pages/Attractions"));
const Playgrounds = lazyWithRetry(() => import("./pages/Playgrounds"));
const EventDetails = lazyWithRetry(() => import("./pages/EventDetails"));
const RestaurantDetails = lazyWithRetry(() => import("./pages/RestaurantDetails"));
const AttractionDetails = lazyWithRetry(() => import("./pages/AttractionDetails"));
const PlaygroundDetails = lazyWithRetry(() => import("./pages/PlaygroundDetails"));
const EventsPage = lazyWithRetry(() => import("./pages/EventsPage"));
const Articles = lazyWithRetry(() => import("./pages/Articles"));
const ArticleDetails = lazyWithRetry(() => import("./pages/ArticleDetails"));
const AdminArticleEditor = lazyWithRetry(() => import("./pages/AdminArticleEditor"));
const CMSDashboard = lazyWithRetry(() => import("./pages/CMSDashboard"));
const Advertise = lazyWithRetry(() => import("./pages/Advertise"));
const AdvertiseSuccess = lazyWithRetry(() => import("./pages/AdvertiseSuccess"));
const AdvertiseCancel = lazyWithRetry(() => import("./pages/AdvertiseCancel"));
const WeekendPage = lazyWithRetry(() => import("./pages/WeekendPage"));
const NeighborhoodsPage = lazyWithRetry(() => import("./pages/NeighborhoodsPage"));
const NeighborhoodPage = lazyWithRetry(() => import("./pages/NeighborhoodPage"));
const IowaStateFairPage = lazyWithRetry(() => import("./pages/IowaStateFairPage"));
const CampaignDashboard = lazyWithRetry(() => import("./pages/CampaignDashboard"));
const CampaignDetail = lazyWithRetry(() => import("./pages/CampaignDetail"));
const UploadCreatives = lazyWithRetry(() => import("./pages/UploadCreatives"));
const AdminCampaigns = lazyWithRetry(() => import("./pages/AdminCampaigns"));
const AdminCampaignDetail = lazyWithRetry(() => import("./pages/AdminCampaignDetail"));
const CampaignAnalytics = lazyWithRetry(() => import("./pages/CampaignAnalytics"));
const TeamManagement = lazyWithRetry(() => import("./pages/TeamManagement"));
const Social = lazyWithRetry(() => import("./pages/Social"));
const SmartCalendarIntegration = lazyWithRetry(
  () => import("./components/SmartCalendarIntegration")
);
const Gamification = lazyWithRetry(() => import("./pages/Gamification"));
const Pricing = lazyWithRetry(() => import("./pages/Pricing"));
const SubscriptionSuccess = lazyWithRetry(() => import("./pages/SubscriptionSuccess"));
const SubscriptionPortal = lazyWithRetry(() => import("./pages/SubscriptionPortal"));
const AdminRefunds = lazyWithRetry(() => import("./pages/AdminRefunds"));
const BusinessPartnership = lazyWithRetry(() => import("./pages/BusinessPartnership"));
const BusinessHub = lazyWithRetry(() => import("./pages/BusinessHub"));
const GuidesPage = lazyWithRetry(() => import("./pages/GuidesPage"));
const MonthlyEventsPage = lazyWithRetry(() => import("./pages/MonthlyEventsPage"));
const EventsSegmentHandler = lazyWithRetry(() => import("./components/EventsSegmentHandler"));
const AdvancedSearchPage = lazyWithRetry(() => import("./components/AdvancedSearchPage"));
const RealTimePage = lazyWithRetry(() => import("./components/RealTimePage"));

// SEO-focused time-sensitive pages
const EventsToday = lazyWithRetry(() => import("./pages/EventsToday"));
const EventsThisWeekend = lazyWithRetry(() => import("./pages/EventsThisWeekend"));
const EventsByLocation = lazyWithRetry(() => import("./pages/EventsByLocation"));

// SEO hub pages - new category pages
const FreeEvents = lazyWithRetry(() => import("./pages/FreeEvents"));
const KidsEvents = lazyWithRetry(() => import("./pages/KidsEvents"));
const DateNightEvents = lazyWithRetry(() => import("./pages/DateNightEvents"));
const OpenNowRestaurants = lazyWithRetry(() => import("./pages/OpenNowRestaurants"));
const DietaryRestaurants = lazyWithRetry(() => import("./pages/DietaryRestaurants"));

// Lead magnet tools
const EventPromotionPlanner = lazyWithRetry(() => import("./pages/EventPromotionPlanner"));

// Hotels / Stay pages
const Hotels = lazyWithRetry(() => import("./pages/Hotels"));
const HotelDetails = lazyWithRetry(() => import("./pages/HotelDetails"));

// AI-powered features
const TripPlanner = lazyWithRetry(() => import("./pages/TripPlanner"));

// Curated itineraries
const ItinerariesPage = lazyWithRetry(() => import("./pages/Itineraries"));
const ItineraryDetail = lazyWithRetry(() => import("./pages/ItineraryDetail"));

// Deals & coupons
const DealsPage = lazyWithRetry(() => import("./pages/Deals"));

// Interactive discovery map
const DiscoverMap = lazyWithRetry(() => import("./pages/DiscoverMap"));

// Content hubs & visitor pages
const GettingAround = lazyWithRetry(() => import("./pages/GettingAround"));
const VisitorsGuide = lazyWithRetry(() => import("./pages/VisitorsGuide"));
const GroupTravel = lazyWithRetry(() => import("./pages/GroupTravel"));
const SeasonalGuide = lazyWithRetry(() => import("./pages/SeasonalGuide"));
const MusicHub = lazyWithRetry(() => import("./pages/MusicHub"));
const VenueDetail = lazyWithRetry(() => import("./pages/VenueDetail"));
const SportsHub = lazyWithRetry(() => import("./pages/SportsHub"));
const TeamDetail = lazyWithRetry(() => import("./pages/TeamDetail"));
const OutdoorsHub = lazyWithRetry(() => import("./pages/OutdoorsHub"));
const TrailDetail = lazyWithRetry(() => import("./pages/TrailDetail"));
const BreweryTrail = lazyWithRetry(() => import("./pages/BreweryTrail"));

// Affiliate disclosure
const AffiliateDisclosure = lazyWithRetry(() => import("./pages/AffiliateDisclosure"));

// pSEO 2.0 programmatic pages
const PseoRoutePage = lazyWithRetry(() => import("./pseo/pages/PseoRoutePage"));
const ThingsToDoHub = lazyWithRetry(() => import("./pages/ThingsToDoHub"));

// Event submission
const SubmitEvent = lazyWithRetry(() => import("./pages/SubmitEvent"));

// Legal pages — direct imports (small static content, must always be reachable)
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Terms from "./pages/Terms";
import AccessibilityStatement from "./pages/AccessibilityStatement";
import CookiePolicy from "./pages/CookiePolicy";
import DMCAPolicy from "./pages/DMCAPolicy";
import AcceptableUsePolicy from "./pages/AcceptableUsePolicy";

// Cookie consent (GDPR/CCPA opt-in banner) — lightweight, mount globally
import { CookieConsentBanner } from "@/components/CookieConsentBanner";

// Contact page
const Contact = lazyWithRetry(() => import("./pages/Contact"));

// Admin sub-pages
const AdminContent = lazyWithRetry(() => import("./pages/AdminContent"));
const AdminMenus = lazyWithRetry(() => import("./pages/AdminMenus"));
const AdminAI = lazyWithRetry(() => import("./pages/AdminAI"));
const AdminTools = lazyWithRetry(() => import("./pages/AdminTools"));
const AdminAnalyticsPage = lazyWithRetry(() => import("./pages/AdminAnalyticsPage"));
const AdminGscCallback = lazyWithRetry(() => import("./pages/AdminGscCallback"));
const AdminSecurity = lazyWithRetry(() => import("./pages/AdminSecurity"));
const AdminSystem = lazyWithRetry(() => import("./pages/AdminSystem"));
const AdminMedia = lazyWithRetry(() => import("./pages/AdminMedia"));
const BestOf = lazyWithRetry(() => import("./pages/BestOf"));
const BestOfCategory = lazyWithRetry(() => import("./pages/BestOfCategory"));
const WhatsNew = lazyWithRetry(() => import("./pages/WhatsNew"));

// Mobile-optimized loading component with accessibility support
const PageLoader = () => (
  <div
    className="min-h-screen bg-background flex items-center justify-center"
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <div className="animate-pulse space-y-4 text-center motion-reduce:animate-none">
      <div className="h-8 bg-muted rounded w-48 mx-auto" aria-hidden="true"></div>
      <div className="h-4 bg-muted rounded w-32 mx-auto" aria-hidden="true"></div>
      <span className="sr-only">Loading page content...</span>
    </div>
  </div>
);

// Scroll to top on route changes – essential for Capacitor where
// the browser's default scroll restoration doesn't kick in.
function ScrollToTopOnNavigate() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

const KeyboardShortcutsProvider = ({ children }: { children: React.ReactNode }) => {
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

  // Enable focus management on route changes for accessibility
  useFocusOnRouteChange("main-content", true);

  // Track page views for analytics dashboard
  usePageTracking();

  useKeyboardShortcuts({
    enabled: true,
    onShowHelp: () => setShowShortcutsModal(true),
  });

  // Ensure iOS keyboard doesn't obscure focused inputs
  useKeyboardAware();

  // Register for push notifications on Capacitor (auto-registers if previously enabled)
  usePushNotifications();

  // Handle incoming deep links (Universal Links / App Links)
  useDeepLinks();

  // Enable swipe-from-left-edge to go back on iOS
  useSwipeBack();

  // Switch status bar text color based on page (light on dark heroes, dark elsewhere)
  useStatusBarStyle();

  // Subtle page transition animation for Capacitor (no-op on web)
  const pageTransitionRef = usePageTransition<HTMLDivElement>();

  return (
    <div ref={pageTransitionRef}>
      {children}
      <KeyboardShortcutsModal
        open={showShortcutsModal}
        onOpenChange={setShowShortcutsModal}
      />
      <WelcomeModal />
    </div>
  );
};

const App = () => (
  <AccessibilityProvider>
  <TooltipProvider>
    <BrowserRouter>
      <ScrollToTopOnNavigate />
      <AuthProvider>
        <SessionManager />
        <OfflineBanner />
        <ErrorBoundary>
          <KeyboardShortcutsProvider>
            <Toaster />
            <Sonner />
            <AccessibilityWidget />
            <RouteErrorBoundary>
            <main id="main-content" tabIndex={-1}>
            <Suspense fallback={<PageLoader />}>
            <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/auth/verified" element={<AuthVerified />} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/my-events" element={<ProfilePage />} />
            <Route path="/dashboard" element={<ProtectedRoute><UserDashboard /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute requireAdmin><Admin /></ProtectedRoute>} />
            <Route path="/admin/content" element={<ProtectedRoute requireAdmin><AdminContent /></ProtectedRoute>} />
            <Route path="/admin/ai" element={<ProtectedRoute requireAdmin><AdminAI /></ProtectedRoute>} />
            <Route path="/admin/tools" element={<ProtectedRoute requireAdmin><AdminTools /></ProtectedRoute>} />
            <Route path="/admin/analytics-dashboard" element={<ProtectedRoute requireAdmin><AdminAnalyticsPage /></ProtectedRoute>} />
            <Route path="/admin/oauth/callback" element={<ProtectedRoute requireAdmin><AdminGscCallback /></ProtectedRoute>} />
            <Route path="/admin/security" element={<ProtectedRoute requireAdmin><AdminSecurity /></ProtectedRoute>} />
            <Route path="/admin/system" element={<ProtectedRoute requireAdmin><AdminSystem /></ProtectedRoute>} />
            <Route path="/admin/media" element={<ProtectedRoute requireAdmin><AdminMedia /></ProtectedRoute>} />
            <Route path="/admin/menus" element={<ProtectedRoute requireAdmin><AdminMenus /></ProtectedRoute>} />
            <Route path="/restaurants" element={<Restaurants />} />
            {/* Restaurant SEO hub pages */}
            <Route path="/restaurants/open-now" element={<OpenNowRestaurants />} />
            <Route path="/restaurants/dietary" element={<DietaryRestaurants />} />
            <Route path="/attractions" element={<Attractions />} />
            <Route path="/playgrounds" element={<Playgrounds />} />
            <Route path="/events" element={<EventsPage />} />
            {/* Time-sensitive SEO pages */}
            <Route path="/events/today" element={<EventsToday />} />
            <Route
              path="/events/this-weekend"
              element={<EventsThisWeekend />}
            />
            {/* Category SEO hub pages */}
            <Route path="/events/free" element={<FreeEvents />} />
            <Route path="/events/kids" element={<KidsEvents />} />
            <Route path="/events/date-night" element={<DateNightEvents />} />
            {/* Location-based event pages */}
            <Route
              path="/events/west-des-moines"
              element={<EventsByLocation />}
            />
            <Route path="/events/ankeny" element={<EventsByLocation />} />
            <Route path="/events/urbandale" element={<EventsByLocation />} />
            <Route path="/events/johnston" element={<EventsByLocation />} />
            <Route path="/events/altoona" element={<EventsByLocation />} />
            <Route path="/events/clive" element={<EventsByLocation />} />
            <Route
              path="/events/windsor-heights"
              element={<EventsByLocation />}
            />
            <Route path="/events/:slug" element={<EventsSegmentHandler />} />
            <Route path="/articles" element={<Articles />} />
            <Route path="/articles/:slug" element={<ArticleDetails />} />
            <Route
              path="/admin/articles/new"
              element={<ProtectedRoute requireAdmin><AdminArticleEditor /></ProtectedRoute>}
            />
            <Route
              path="/admin/articles/edit/:id"
              element={<ProtectedRoute requireAdmin><AdminArticleEditor /></ProtectedRoute>}
            />
            <Route
              path="/admin/cms"
              element={<ProtectedRoute requireAdmin><CMSDashboard /></ProtectedRoute>}
            />
            <Route path="/admin/campaigns" element={<ProtectedRoute requireAdmin><AdminCampaigns /></ProtectedRoute>} />
            <Route path="/admin/campaigns/:campaignId" element={<ProtectedRoute requireAdmin><AdminCampaignDetail /></ProtectedRoute>} />
            <Route path="/restaurants/:slug" element={<RestaurantDetails />} />
            <Route path="/attractions/:slug" element={<AttractionDetails />} />
            <Route path="/playgrounds/:slug" element={<PlaygroundDetails />} />
            {/* Hotels / Stay pages */}
            <Route path="/stay" element={<Hotels />} />
            <Route path="/stay/:slug" element={<HotelDetails />} />
            <Route path="/advertise" element={<Advertise />} />
            <Route path="/advertise/success" element={<AdvertiseSuccess />} />
            <Route path="/advertise/cancel" element={<AdvertiseCancel />} />
            <Route path="/campaigns" element={<ProtectedRoute><CampaignDashboard /></ProtectedRoute>} />
            <Route path="/campaigns/:campaignId" element={<ProtectedRoute><CampaignDetail /></ProtectedRoute>} />
            <Route path="/campaigns/:campaignId/creatives" element={<ProtectedRoute><UploadCreatives /></ProtectedRoute>} />
            <Route path="/campaigns/:campaignId/analytics" element={<ProtectedRoute><CampaignAnalytics /></ProtectedRoute>} />
            <Route path="/campaigns/team" element={<ProtectedRoute><TeamManagement /></ProtectedRoute>} />
            <Route path="/weekend" element={<WeekendPage />} />
            <Route path="/neighborhoods" element={<NeighborhoodsPage />} />
            <Route
              path="/neighborhoods/:neighborhood"
              element={<NeighborhoodPage />}
            />
            <Route path="/iowa-state-fair" element={<IowaStateFairPage />} />
            <Route path="/social" element={<Social />} />
            <Route path="/calendar" element={<SmartCalendarIntegration />} />
            <Route path="/gamification" element={<Gamification />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/subscription/success" element={<SubscriptionSuccess />} />
            <Route path="/subscription" element={<ProtectedRoute><SubscriptionPortal /></ProtectedRoute>} />
            <Route path="/admin/refunds" element={<ProtectedRoute requireAdmin><AdminRefunds /></ProtectedRoute>} />
            <Route
              path="/business-partnership"
              element={<BusinessPartnership />}
            />
            <Route path="/business" element={<BusinessHub />} />
            <Route path="/search" element={<AdvancedSearchPage />} />
            <Route path="/guides" element={<GuidesPage />} />
            <Route path="/real-time" element={<RealTimePage />} />
            {/* Lead magnet tools */}
            <Route path="/tools/event-promotion-planner" element={<EventPromotionPlanner />} />
            {/* AI-powered features */}
            <Route path="/trip-planner" element={<TripPlanner />} />
            {/* Curated itineraries */}
            <Route path="/itineraries" element={<ItinerariesPage />} />
            <Route path="/itineraries/:slug" element={<ItineraryDetail />} />
            {/* Deals & coupons */}
            <Route path="/deals" element={<DealsPage />} />
            {/* Discovery map */}
            <Route path="/map" element={<DiscoverMap />} />
            {/* Event submission */}
            <Route path="/submit-event" element={<SubmitEvent />} />
            {/* Affiliate disclosure */}
            <Route path="/affiliate-disclosure" element={<AffiliateDisclosure />} />
            {/* Legal pages */}
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/accessibility" element={<AccessibilityStatement />} />
            <Route path="/cookie-policy" element={<CookiePolicy />} />
            <Route path="/dmca" element={<DMCAPolicy />} />
            <Route path="/acceptable-use" element={<AcceptableUsePolicy />} />
            {/* Contact page */}
            <Route path="/contact" element={<Contact />} />
            {/* Community voting */}
            <Route path="/best-of" element={<BestOf />} />
            <Route path="/best-of/:category" element={<BestOfCategory />} />
            {/* Scene updates feed */}
            <Route path="/whats-new" element={<WhatsNew />} />
            {/* Visitor & planner pages */}
            <Route path="/getting-around" element={<GettingAround />} />
            <Route path="/visitors-guide" element={<VisitorsGuide />} />
            <Route path="/group-travel" element={<GroupTravel />} />
            <Route path="/guides/:slug" element={<SeasonalGuide />} />
            {/* Content hubs */}
            <Route path="/music" element={<MusicHub />} />
            <Route path="/music/venues/:slug" element={<VenueDetail />} />
            <Route path="/sports" element={<SportsHub />} />
            <Route path="/sports/:slug" element={<TeamDetail />} />
            <Route path="/outdoors" element={<OutdoorsHub />} />
            <Route path="/outdoors/:slug" element={<TrailDetail />} />
            <Route path="/breweries" element={<BreweryTrail />} />
            {/* pSEO 2.0 programmatic pages — catch-all before 404 */}
            <Route path="/things-to-do" element={<ThingsToDoHub />} />
            <Route path="/guide/:location" element={<PseoRoutePage />} />
            <Route path="/things-to-do/:seg1" element={<PseoRoutePage />} />
            <Route path="/things-to-do/:seg1/:seg2" element={<PseoRoutePage />} />
            <Route path="/nightlife/:seg1" element={<PseoRoutePage />} />
            <Route path="/nightlife/:seg1/:seg2" element={<PseoRoutePage />} />
            {/* Generic pSEO catch-all for category/location combos like
                /brunch/east-village, /italian/valley-junction, /asian/ankeny.
                React Router v6 ranks static segments higher than dynamic ones,
                so existing routes (e.g. /restaurants/:slug) still match first. */}
            <Route path="/:seg1/:seg2" element={<PseoRoutePage />} />
            <Route path="/:seg1" element={<PseoRoutePage />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </main>
          </RouteErrorBoundary>
          <CookieConsentBanner />
          <BottomNav />
        </KeyboardShortcutsProvider>
      </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  </TooltipProvider>
  </AccessibilityProvider>
);

export default App;

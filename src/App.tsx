import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { RouteErrorBoundary } from "@/components/ui/route-error-boundary";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense, useState, useEffect, ComponentType } from "react";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
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

// Affiliate disclosure
const AffiliateDisclosure = lazyWithRetry(() => import("./pages/AffiliateDisclosure"));

// Legal pages — direct imports (small static content, must always be reachable)
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Terms from "./pages/Terms";
import AccessibilityStatement from "./pages/AccessibilityStatement";

// Contact page
const Contact = lazyWithRetry(() => import("./pages/Contact"));

// Admin sub-pages
const AdminContent = lazyWithRetry(() => import("./pages/AdminContent"));
const AdminAI = lazyWithRetry(() => import("./pages/AdminAI"));
const AdminTools = lazyWithRetry(() => import("./pages/AdminTools"));
const AdminAnalyticsPage = lazyWithRetry(() => import("./pages/AdminAnalyticsPage"));
const AdminSecurity = lazyWithRetry(() => import("./pages/AdminSecurity"));
const AdminSystem = lazyWithRetry(() => import("./pages/AdminSystem"));

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

  return (
    <>
      {children}
      <KeyboardShortcutsModal
        open={showShortcutsModal}
        onOpenChange={setShowShortcutsModal}
      />
      <WelcomeModal />
    </>
  );
};

const App = () => (
  <AccessibilityProvider>
  <TooltipProvider>
    <BrowserRouter>
      <ScrollToTopOnNavigate />
      <AuthProvider>
        <SessionManager />
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
            <Route path="/admin/security" element={<ProtectedRoute requireAdmin><AdminSecurity /></ProtectedRoute>} />
            <Route path="/admin/system" element={<ProtectedRoute requireAdmin><AdminSystem /></ProtectedRoute>} />
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
            <Route path="/events/:slug" element={<EventDetails />} />
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
            <Route path="/events/:monthYear" element={<MonthlyEventsPage />} />
            <Route path="/real-time" element={<RealTimePage />} />
            {/* Lead magnet tools */}
            <Route path="/tools/event-promotion-planner" element={<EventPromotionPlanner />} />
            {/* AI-powered features */}
            <Route path="/trip-planner" element={<TripPlanner />} />
            {/* Affiliate disclosure */}
            <Route path="/affiliate-disclosure" element={<AffiliateDisclosure />} />
            {/* Legal pages */}
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/accessibility" element={<AccessibilityStatement />} />
            {/* Contact page */}
            <Route path="/contact" element={<Contact />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </main>
          </RouteErrorBoundary>
          <BottomNav />
        </KeyboardShortcutsProvider>
      </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  </TooltipProvider>
  </AccessibilityProvider>
);

export default App;

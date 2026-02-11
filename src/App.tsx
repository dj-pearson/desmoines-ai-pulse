import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { RouteErrorBoundary } from "@/components/ui/route-error-boundary";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense, useState } from "react";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useFocusOnRouteChange } from "@/hooks/useFocusOnRouteChange";
import { usePageTracking } from "@/hooks/usePageTracking";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { WelcomeModal } from "@/components/WelcomeModal";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import BottomNav from "@/components/BottomNav";
import { AuthProvider } from "@/contexts/AuthContext";
import { SessionManager } from "@/components/auth/SessionManager";

// Lazy load pages for better mobile performance
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const AuthVerified = lazy(() => import("./pages/AuthVerified"));
const Profile = lazy(() => import("./pages/Profile"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const UserDashboard = lazy(() => import("./pages/UserDashboard"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Admin = lazy(() => import("./pages/Admin"));
const Restaurants = lazy(() => import("./pages/Restaurants"));
const Attractions = lazy(() => import("./pages/Attractions"));
const Playgrounds = lazy(() => import("./pages/Playgrounds"));
const EventDetails = lazy(() => import("./pages/EventDetails"));
const RestaurantDetails = lazy(() => import("./pages/RestaurantDetails"));
const AttractionDetails = lazy(() => import("./pages/AttractionDetails"));
const PlaygroundDetails = lazy(() => import("./pages/PlaygroundDetails"));
const EventsPage = lazy(() => import("./pages/EventsPage"));
const Articles = lazy(() => import("./pages/Articles"));
const ArticleDetails = lazy(() => import("./pages/ArticleDetails"));
const AdminArticleEditor = lazy(() => import("./pages/AdminArticleEditor"));
const CMSDashboard = lazy(() => import("./pages/CMSDashboard"));
const Advertise = lazy(() => import("./pages/Advertise"));
const AdvertiseSuccess = lazy(() => import("./pages/AdvertiseSuccess"));
const AdvertiseCancel = lazy(() => import("./pages/AdvertiseCancel"));
const WeekendPage = lazy(() => import("./pages/WeekendPage"));
const NeighborhoodsPage = lazy(() => import("./pages/NeighborhoodsPage"));
const NeighborhoodPage = lazy(() => import("./pages/NeighborhoodPage"));
const IowaStateFairPage = lazy(() => import("./pages/IowaStateFairPage"));
const CampaignDashboard = lazy(() => import("./pages/CampaignDashboard"));
const CampaignDetail = lazy(() => import("./pages/CampaignDetail"));
const UploadCreatives = lazy(() => import("./pages/UploadCreatives"));
const AdminCampaigns = lazy(() => import("./pages/AdminCampaigns"));
const AdminCampaignDetail = lazy(() => import("./pages/AdminCampaignDetail"));
const CampaignAnalytics = lazy(() => import("./pages/CampaignAnalytics"));
const TeamManagement = lazy(() => import("./pages/TeamManagement"));
const Social = lazy(() => import("./pages/Social"));
const SmartCalendarIntegration = lazy(
  () => import("./components/SmartCalendarIntegration")
);
const Gamification = lazy(() => import("./pages/Gamification"));
const Pricing = lazy(() => import("./pages/Pricing"));
const SubscriptionSuccess = lazy(() => import("./pages/SubscriptionSuccess"));
const SubscriptionPortal = lazy(() => import("./pages/SubscriptionPortal"));
const AdminRefunds = lazy(() => import("./pages/AdminRefunds"));
const BusinessPartnership = lazy(() => import("./pages/BusinessPartnership"));
const BusinessHub = lazy(() => import("./pages/BusinessHub"));
const GuidesPage = lazy(() => import("./pages/GuidesPage"));
const MonthlyEventsPage = lazy(() => import("./pages/MonthlyEventsPage"));
const AdvancedSearchPage = lazy(() => import("./components/AdvancedSearchPage"));
const RealTimePage = lazy(() => import("./components/RealTimePage"));

// SEO-focused time-sensitive pages
const EventsToday = lazy(() => import("./pages/EventsToday"));
const EventsThisWeekend = lazy(() => import("./pages/EventsThisWeekend"));
const EventsByLocation = lazy(() => import("./pages/EventsByLocation"));

// SEO hub pages - new category pages
const FreeEvents = lazy(() => import("./pages/FreeEvents"));
const KidsEvents = lazy(() => import("./pages/KidsEvents"));
const DateNightEvents = lazy(() => import("./pages/DateNightEvents"));
const OpenNowRestaurants = lazy(() => import("./pages/OpenNowRestaurants"));
const DietaryRestaurants = lazy(() => import("./pages/DietaryRestaurants"));

// Lead magnet tools
const EventPromotionPlanner = lazy(() => import("./pages/EventPromotionPlanner"));

// AI-powered features
const TripPlanner = lazy(() => import("./pages/TripPlanner"));

// Legal pages
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const Terms = lazy(() => import("./pages/Terms"));
const AccessibilityStatement = lazy(() => import("./pages/AccessibilityStatement"));

// Contact page
const Contact = lazy(() => import("./pages/Contact"));

// Admin sub-pages
const AdminContent = lazy(() => import("./pages/AdminContent"));
const AdminAI = lazy(() => import("./pages/AdminAI"));
const AdminTools = lazy(() => import("./pages/AdminTools"));
const AdminAnalyticsPage = lazy(() => import("./pages/AdminAnalyticsPage"));
const AdminSecurity = lazy(() => import("./pages/AdminSecurity"));
const AdminSystem = lazy(() => import("./pages/AdminSystem"));

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
  <TooltipProvider>
    <BrowserRouter>
      <AuthProvider>
        <SessionManager />
        <ErrorBoundary>
          <KeyboardShortcutsProvider>
            <Toaster />
            <Sonner />
            <RouteErrorBoundary>
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
          </RouteErrorBoundary>
          <BottomNav />
        </KeyboardShortcutsProvider>
      </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense, useState } from "react";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { WelcomeModal } from "@/components/WelcomeModal";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import BottomNav from "@/components/BottomNav";

// Lazy load pages for better mobile performance
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
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
const Advertise = lazy(() => import("./pages/Advertise"));
const AdvertiseSuccess = lazy(() => import("./pages/AdvertiseSuccess"));
const AdvertiseCancel = lazy(() => import("./pages/AdvertiseCancel"));
const WeekendPage = lazy(() => import("./pages/WeekendPage"));
const NeighborhoodsPage = lazy(() => import("./pages/NeighborhoodsPage"));
const NeighborhoodPage = lazy(() => import("./pages/NeighborhoodPage"));
const IowaStateFairPage = lazy(() => import("./pages/IowaStateFairPage"));
const CampaignDashboard = lazy(() => import("./pages/CampaignDashboard"));
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

// Lead magnet tools
const EventPromotionPlanner = lazy(() => import("./pages/EventPromotionPlanner"));

// Mobile-optimized loading component
const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="animate-pulse space-y-4 text-center">
      <div className="h-8 bg-muted rounded w-48 mx-auto"></div>
      <div className="h-4 bg-muted rounded w-32 mx-auto"></div>
    </div>
  </div>
);

const KeyboardShortcutsProvider = ({ children }: { children: React.ReactNode }) => {
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

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
      <ErrorBoundary>
        <KeyboardShortcutsProvider>
          <Toaster />
          <Sonner />
          <Suspense fallback={<PageLoader />}>
            <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth/verified" element={<AuthVerified />} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/my-events" element={<ProfilePage />} />
            <Route path="/dashboard" element={<ProtectedRoute><UserDashboard /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute requireAdmin><Admin /></ProtectedRoute>} />
            <Route path="/restaurants" element={<Restaurants />} />
            <Route path="/attractions" element={<Attractions />} />
            <Route path="/playgrounds" element={<Playgrounds />} />
            <Route path="/events" element={<EventsPage />} />
            {/* Time-sensitive SEO pages */}
            <Route path="/events/today" element={<EventsToday />} />
            <Route
              path="/events/this-weekend"
              element={<EventsThisWeekend />}
            />
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
            <Route path="/admin/campaigns" element={<ProtectedRoute requireAdmin><AdminCampaigns /></ProtectedRoute>} />
            <Route path="/admin/campaigns/:campaignId" element={<ProtectedRoute requireAdmin><AdminCampaignDetail /></ProtectedRoute>} />
            <Route path="/restaurants/:slug" element={<RestaurantDetails />} />
            <Route path="/attractions/:slug" element={<AttractionDetails />} />
            <Route path="/playgrounds/:slug" element={<PlaygroundDetails />} />
            <Route path="/advertise" element={<Advertise />} />
            <Route path="/advertise/success" element={<AdvertiseSuccess />} />
            <Route path="/advertise/cancel" element={<AdvertiseCancel />} />
            <Route path="/campaigns" element={<ProtectedRoute><CampaignDashboard /></ProtectedRoute>} />
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
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
          <BottomNav />
        </KeyboardShortcutsProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </TooltipProvider>
);

export default App;

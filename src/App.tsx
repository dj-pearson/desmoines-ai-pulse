import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";

// Lazy load pages for better mobile performance
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Profile = lazy(() => import("./pages/Profile"));
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
const Advertise = lazy(() => import("./pages/Advertise"));
const CampaignDashboard = lazy(() => import("./pages/CampaignDashboard"));

// Mobile-optimized loading component
const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="animate-pulse space-y-4 text-center">
      <div className="h-8 bg-muted rounded w-48 mx-auto"></div>
      <div className="h-4 bg-muted rounded w-32 mx-auto"></div>
    </div>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (renamed from cacheTime)
      refetchOnWindowFocus: false, // Better mobile performance
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/dashboard" element={<UserDashboard />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/restaurants" element={<Restaurants />} />
            <Route path="/attractions" element={<Attractions />} />
            <Route path="/playgrounds" element={<Playgrounds />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/:slug" element={<EventDetails />} />
            <Route path="/restaurants/:slug" element={<RestaurantDetails />} />
            <Route path="/attractions/:slug" element={<AttractionDetails />} />
            <Route path="/playgrounds/:slug" element={<PlaygroundDetails />} />
            <Route path="/advertise" element={<Advertise />} />
            <Route path="/campaigns" element={<CampaignDashboard />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

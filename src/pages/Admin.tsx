import { useState, useEffect, useCallback } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import ContentEditDialog from "@/components/ContentEditDialog";
import UserRoleManager from "@/components/UserRoleManager";
import ContentTable from "@/components/ContentTable";
import AICrawler from "@/components/AICrawler";
import ScraperConfigWizard from "@/components/ScraperConfigWizard";
import ScrapingJobManager from "@/components/ScrapingJobManager";
import SEOTools from "@/components/SEOTools";
import { DomainHighlightManager } from "@/components/DomainHighlightManager";
import EventReviewSystem from "@/components/EventReviewSystem";
import AffiliateManager from "@/components/AffiliateManager";
import GooglePlacesRestaurantTools from "@/components/GooglePlacesRestaurantTools";
import { RestaurantBulkUpdaterSimple } from "@/components/RestaurantBulkUpdaterSimple";
import { CronMonitor } from "@/components/CronMonitor";
import SocialMediaManager from "@/components/SocialMediaManager";
import {
  Shield,
  Users,
  FileText,
  Database,
  Crown,
  AlertTriangle,
  Settings,
  Bot,
  Zap,
  Calendar,
  Building,
  Utensils,
  Camera,
  Play,
  Globe,
  Cog,
  UserCheck,
  DollarSign,
  Menu,
  X,
  Share2,
} from "lucide-react";
import { useEvents } from "@/hooks/useEvents";
import { ContentItem, ContentType } from "@/lib/types";
import { useRestaurants } from "@/hooks/useRestaurants";
import { useAttractions } from "@/hooks/useAttractions";
import { usePlaygrounds } from "@/hooks/usePlaygrounds";
import { useRestaurantOpenings } from "@/hooks/useRestaurantOpenings";
import { useScraping } from "@/hooks/useScraping";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useClearEventCache } from "@/hooks/useClearEventCache";

export default function Admin() {
  const { user, userRole, isLoading, hasAdminAccess, isRootAdmin } =
    useAdminAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { clearEventCache } = useClearEventCache();
  const [activeTab, setActiveTab] = useState("overview");
  const [showScraperWizard, setShowScraperWizard] = useState(false);
  const [showJobManager, setShowJobManager] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Search state for each content type
  const [searchTerms, setSearchTerms] = useState({
    events: "",
    restaurants: "",
    attractions: "",
    playgrounds: "",
    restaurantOpenings: "",
  });

  // Separate state for input values to prevent re-renders
  const [inputValues, setInputValues] = useState({
    events: "",
    restaurants: "",
    attractions: "",
    playgrounds: "",
    restaurantOpenings: "",
  });

  // Debounce the search term updates
  useEffect(() => {
    const timeouts = {
      events: setTimeout(
        () =>
          setSearchTerms((prev) => ({ ...prev, events: inputValues.events })),
        300
      ),
      restaurants: setTimeout(
        () =>
          setSearchTerms((prev) => ({
            ...prev,
            restaurants: inputValues.restaurants,
          })),
        300
      ),
      attractions: setTimeout(
        () =>
          setSearchTerms((prev) => ({
            ...prev,
            attractions: inputValues.attractions,
          })),
        300
      ),
      playgrounds: setTimeout(
        () =>
          setSearchTerms((prev) => ({
            ...prev,
            playgrounds: inputValues.playgrounds,
          })),
        300
      ),
      restaurantOpenings: setTimeout(
        () =>
          setSearchTerms((prev) => ({
            ...prev,
            restaurantOpenings: inputValues.restaurantOpenings,
          })),
        300
      ),
    };

    return () => {
      Object.values(timeouts).forEach((timeout) => clearTimeout(timeout));
    };
  }, [inputValues]);

  // Search handlers that only update input values (not search terms)
  const handleEventsSearch = useCallback((search: string) => {
    setInputValues((prev) => ({ ...prev, events: search }));
  }, []);

  const handleRestaurantsSearch = useCallback((search: string) => {
    setInputValues((prev) => ({ ...prev, restaurants: search }));
  }, []);

  const handleAttractionsSearch = useCallback((search: string) => {
    setInputValues((prev) => ({ ...prev, attractions: search }));
  }, []);

  const handlePlaygroundsSearch = useCallback((search: string) => {
    setInputValues((prev) => ({ ...prev, playgrounds: search }));
  }, []);

  const handleRestaurantOpeningsSearch = useCallback((search: string) => {
    setInputValues((prev) => ({ ...prev, restaurantOpenings: search }));
  }, []);

  // Edit dialog state
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    contentType: ContentType | null;
    item: ContentItem | null;
  }>({
    open: false,
    contentType: null,
    item: null,
  });

  // Data hooks with search filters
  const events = useEvents({ search: searchTerms.events });
  const restaurants = useRestaurants({ search: searchTerms.restaurants });
  const attractions = useAttractions({ search: searchTerms.attractions });
  const playgrounds = usePlaygrounds({ search: searchTerms.playgrounds });
  const restaurantOpenings = useRestaurantOpenings({
    search: searchTerms.restaurantOpenings,
  });
  const scraping = useScraping();

  useEffect(() => {
    console.log("Admin useEffect:", {
      user: user?.id || "null",
      userRole,
      isLoading,
      hasAdminAccess,
      isRootAdmin,
    });

    // Wait for loading to complete
    if (isLoading) {
      return;
    }

    if (!user) {
      console.log("Redirecting to /auth - not authenticated");
      navigate("/auth");
    } else if (!hasAdminAccess) {
      console.log("Redirecting to / - no admin access");
      navigate("/");
    }
  }, [user, userRole, isLoading, hasAdminAccess, isRootAdmin, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 md:h-12 md:w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-mobile-caption text-muted-foreground">
            Loading admin dashboard...
          </p>
        </div>
      </div>
    );
  }

  if (!hasAdminAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center mobile-padding">
        <Card className="mobile-padding max-w-md w-full">
          <div className="text-center">
            <AlertTriangle className="h-8 w-8 md:h-12 md:w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-mobile-title md:text-xl font-semibold mb-2">
              Access Denied
            </h2>
            <p className="text-muted-foreground mb-4 text-mobile-caption">
              You don't have permission to access the admin dashboard.
            </p>
            <Button
              onClick={() => navigate("/")}
              variant="outline"
              className="touch-target"
            >
              Go Home
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const getRoleIcon = () => {
    if (isRootAdmin) return <Crown className="h-5 w-5" />;
    if (userRole === "admin") return <Shield className="h-5 w-5" />;
    return <Users className="h-5 w-5" />;
  };

  const getRoleBadge = () => {
    const variant = isRootAdmin
      ? "default"
      : userRole === "admin"
      ? "destructive"
      : "secondary";
    return (
      <Badge variant={variant} className="ml-2">
        {userRole.replace("_", " ")}
      </Badge>
    );
  };

  const canManageContent = () =>
    ["moderator", "admin", "root_admin"].includes(userRole);
  const canManageUsers = () => ["admin", "root_admin"].includes(userRole);

  // Handler functions for content management
  const handleEdit = (contentType: ContentType, item: ContentItem) => {
    setEditDialog({
      open: true,
      contentType,
      item,
    });
  };

  const handleCreate = (contentType: ContentType) => {
    // Create an empty item with default values based on content type
    let emptyItem: Partial<ContentItem> = {};

    if (contentType === "restaurant") {
      emptyItem = {
        name: "",
        description: "",
        location: "",
        cuisine: "",
        priceRange: "$$",
        phone: "",
        website: "",
        rating: null,
        imageUrl: "",
        status: "open",
        openingDate: null,
        openingTimeframe: "",
        isFeatured: false,
      };
    } else if (contentType === "event") {
      emptyItem = {
        title: "",
        originalDescription: "",
        date: new Date(),
        location: "",
        venue: "",
        category: "General",
        price: "",
        sourceUrl: "",
        isFeatured: false,
        isEnhanced: false,
      };
    } else if (contentType === "attraction") {
      emptyItem = {
        name: "",
        description: "",
        location: "",
        type: "",
        website: "",
        imageUrl: "",
        rating: null,
        isFeatured: false,
      };
    } else if (contentType === "playground") {
      emptyItem = {
        name: "",
        description: "",
        location: "",
        ageRange: "",
        amenities: [],
        imageUrl: "",
        rating: null,
        isFeatured: false,
      };
    }

    setEditDialog({
      open: true,
      contentType,
      item: { ...emptyItem, isNew: true } as unknown as ContentItem, // Mark as new for the dialog
    });
  };

  const handleDelete = async (contentType: string, id: string) => {
    try {
      const tableNameMap: Record<
        string,
        "events" | "restaurants" | "attractions" | "playgrounds"
      > = {
        event: "events",
        restaurant: "restaurants",
        restaurant_opening: "restaurants",
        attraction: "attractions",
        playground: "playgrounds",
      };

      const tableName = tableNameMap[contentType];
      if (!tableName) throw new Error(`Unknown content type: ${contentType}`);

      const { error } = await supabase.from(tableName).delete().eq("id", id);

      if (error) throw error;

      toast.success(
        `${
          contentType.charAt(0).toUpperCase() + contentType.slice(1)
        } deleted successfully!`
      );

      // Refresh the appropriate data
      if (contentType === "event") events.refetch();
      else if (contentType === "restaurant") restaurants.refetch();
      else if (contentType === "attraction") attractions.refetch();
      else if (contentType === "playground") playgrounds.refetch();
      else if (contentType === "restaurant_opening")
        restaurantOpenings.refetch();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete: " + (error as Error).message);
    }
  };

  const handleSave = async () => {
    // Refresh the appropriate data after save
    const { contentType } = editDialog;
    console.log("handleSave called for contentType:", contentType);

    try {
      if (contentType === "event") {
        console.log("Refetching events...");
        await events.refetch();
        await queryClient.invalidateQueries({ queryKey: ["events"] });
      } else if (contentType === "restaurant") {
        console.log("Refetching restaurants...");
        await restaurants.refetch();
        await queryClient.invalidateQueries({ queryKey: ["restaurants"] });
        // Also refresh restaurant openings since restaurants with opening_date show there
        console.log("Refetching restaurant openings...");
        await restaurantOpenings.refetch();
        await queryClient.invalidateQueries({
          queryKey: ["restaurant_openings"],
        });
      } else if (contentType === "attraction") {
        console.log("Refetching attractions...");
        await attractions.refetch();
        await queryClient.invalidateQueries({ queryKey: ["attractions"] });
      } else if (contentType === "playground") {
        console.log("Refetching playgrounds...");
        await playgrounds.refetch();
        await queryClient.invalidateQueries({ queryKey: ["playgrounds"] });
      } else if (contentType === "restaurant_opening") {
        console.log("Refetching restaurant openings...");
        await restaurantOpenings.refetch();
        await queryClient.invalidateQueries({
          queryKey: ["restaurant_openings"],
        });
      }

      console.log("All refetches completed successfully");
    } catch (error) {
      console.error("Error during refetch:", error);
    }
  };

  return (
    <>
      <div className="flex h-screen bg-background">
        {/* Sidebar Navigation */}
        <div
          className={`${
            sidebarCollapsed ? "w-16" : "w-64"
          } transition-all duration-300 bg-card border-r border-border flex flex-col`}
        >
          {/* Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between">
              {!sidebarCollapsed && (
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  <span className="font-semibold">Admin Dashboard</span>
                  {getRoleBadge()}
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className={`${sidebarCollapsed ? "w-full" : ""} flex-shrink-0`}
              >
                {sidebarCollapsed ? (
                  <Menu className="h-4 w-4" />
                ) : (
                  <X className="h-4 w-4" />
                )}
              </Button>
            </div>
            {!sidebarCollapsed && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/")}
                className="w-full mt-3"
              >
                Back to Site
              </Button>
            )}
          </div>

          {/* Navigation Menu */}
          <nav className="flex-1 p-4 overflow-y-auto">
            <div className="space-y-2">
              <button
                onClick={() => setActiveTab("overview")}
                className={`w-full flex items-center ${
                  sidebarCollapsed ? "justify-center" : "gap-3"
                } px-3 py-2 rounded-lg text-left transition-colors ${
                  activeTab === "overview"
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent hover:text-accent-foreground"
                }`}
                title={sidebarCollapsed ? "Overview" : ""}
              >
                <Database className="h-4 w-4" />
                {!sidebarCollapsed && <span>Overview</span>}
              </button>

              {canManageContent() && (
                <>
                  {!sidebarCollapsed && (
                    <div className="pt-4 pb-2">
                      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Content Management
                      </h3>
                    </div>
                  )}

                  <button
                    onClick={() => setActiveTab("ai-crawler")}
                    className={`w-full flex items-center ${
                      sidebarCollapsed ? "justify-center" : "gap-3"
                    } px-3 py-2 rounded-lg text-left transition-colors ${
                      activeTab === "ai-crawler"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                    title={sidebarCollapsed ? "AI Crawler" : ""}
                  >
                    <Bot className="h-4 w-4" />
                    {!sidebarCollapsed && <span>AI Crawler</span>}
                  </button>

                  <button
                    onClick={() => setActiveTab("scraping")}
                    className={`w-full flex items-center ${
                      sidebarCollapsed ? "justify-center" : "gap-3"
                    } px-3 py-2 rounded-lg text-left transition-colors ${
                      activeTab === "scraping"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                    title={sidebarCollapsed ? "Scraping" : ""}
                  >
                    <Zap className="h-4 w-4" />
                    {!sidebarCollapsed && <span>Scraping</span>}
                  </button>

                  <button
                    onClick={() => setActiveTab("events")}
                    className={`w-full flex items-center ${
                      sidebarCollapsed ? "justify-center" : "gap-3"
                    } px-3 py-2 rounded-lg text-left transition-colors ${
                      activeTab === "events"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                    title={sidebarCollapsed ? "Events" : ""}
                  >
                    <Calendar className="h-4 w-4" />
                    {!sidebarCollapsed && <span>Events</span>}
                  </button>

                  <button
                    onClick={() => setActiveTab("restaurants")}
                    className={`w-full flex items-center ${
                      sidebarCollapsed ? "justify-center" : "gap-3"
                    } px-3 py-2 rounded-lg text-left transition-colors ${
                      activeTab === "restaurants"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                    title={sidebarCollapsed ? "Restaurants" : ""}
                  >
                    <Utensils className="h-4 w-4" />
                    {!sidebarCollapsed && <span>Restaurants</span>}
                  </button>

                  <button
                    onClick={() => setActiveTab("attractions")}
                    className={`w-full flex items-center ${
                      sidebarCollapsed ? "justify-center" : "gap-3"
                    } px-3 py-2 rounded-lg text-left transition-colors ${
                      activeTab === "attractions"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                    title={sidebarCollapsed ? "Attractions" : ""}
                  >
                    <Camera className="h-4 w-4" />
                    {!sidebarCollapsed && <span>Attractions</span>}
                  </button>

                  <button
                    onClick={() => setActiveTab("playgrounds")}
                    className={`w-full flex items-center ${
                      sidebarCollapsed ? "justify-center" : "gap-3"
                    } px-3 py-2 rounded-lg text-left transition-colors ${
                      activeTab === "playgrounds"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                    title={sidebarCollapsed ? "Playgrounds" : ""}
                  >
                    <Play className="h-4 w-4" />
                    {!sidebarCollapsed && <span>Playgrounds</span>}
                  </button>

                  <button
                    onClick={() => setActiveTab("restaurant-openings")}
                    className={`w-full flex items-center ${
                      sidebarCollapsed ? "justify-center" : "gap-3"
                    } px-3 py-2 rounded-lg text-left transition-colors ${
                      activeTab === "restaurant-openings"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                    title={sidebarCollapsed ? "Restaurant Openings" : ""}
                  >
                    <Building className="h-4 w-4" />
                    {!sidebarCollapsed && <span>Restaurant Openings</span>}
                  </button>

                  <button
                    onClick={() => setActiveTab("event-submissions")}
                    className={`w-full flex items-center ${
                      sidebarCollapsed ? "justify-center" : "gap-3"
                    } px-3 py-2 rounded-lg text-left transition-colors ${
                      activeTab === "event-submissions"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                    title={sidebarCollapsed ? "Event Submissions" : ""}
                  >
                    <UserCheck className="h-4 w-4" />
                    {!sidebarCollapsed && <span>Event Submissions</span>}
                  </button>

                  <button
                    onClick={() => setActiveTab("affiliate-manager")}
                    className={`w-full flex items-center ${
                      sidebarCollapsed ? "justify-center" : "gap-3"
                    } px-3 py-2 rounded-lg text-left transition-colors ${
                      activeTab === "affiliate-manager"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                    title={sidebarCollapsed ? "Affiliate Links" : ""}
                  >
                    <DollarSign className="h-4 w-4" />
                    {!sidebarCollapsed && <span>Affiliate Links</span>}
                  </button>

                  <button
                    onClick={() => setActiveTab("social-media")}
                    className={`w-full flex items-center ${
                      sidebarCollapsed ? "justify-center" : "gap-3"
                    } px-3 py-2 rounded-lg text-left transition-colors ${
                      activeTab === "social-media"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                    title={sidebarCollapsed ? "Social Media" : ""}
                  >
                    <Share2 className="h-4 w-4" />
                    {!sidebarCollapsed && <span>Social Media</span>}
                  </button>
                </>
              )}

              {canManageUsers() && (
                <>
                  {!sidebarCollapsed && (
                    <div className="pt-4 pb-2">
                      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        User Management
                      </h3>
                    </div>
                  )}

                  <button
                    onClick={() => setActiveTab("users")}
                    className={`w-full flex items-center ${
                      sidebarCollapsed ? "justify-center" : "gap-3"
                    } px-3 py-2 rounded-lg text-left transition-colors ${
                      activeTab === "users"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                    title={sidebarCollapsed ? "User Management" : ""}
                  >
                    <Users className="h-4 w-4" />
                    {!sidebarCollapsed && <span>User Management</span>}
                  </button>
                </>
              )}

              {canManageContent() && (
                <>
                  {!sidebarCollapsed && (
                    <div className="pt-4 pb-2">
                      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        System Tools
                      </h3>
                    </div>
                  )}

                  <button
                    onClick={() => setActiveTab("settings")}
                    className={`w-full flex items-center ${
                      sidebarCollapsed ? "justify-center" : "gap-3"
                    } px-3 py-2 rounded-lg text-left transition-colors ${
                      activeTab === "settings"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                    title={sidebarCollapsed ? "Settings" : ""}
                  >
                    <Cog className="h-4 w-4" />
                    {!sidebarCollapsed && <span>Settings</span>}
                  </button>

                  <button
                    onClick={() => setActiveTab("seo")}
                    className={`w-full flex items-center ${
                      sidebarCollapsed ? "justify-center" : "gap-3"
                    } px-3 py-2 rounded-lg text-left transition-colors ${
                      activeTab === "seo"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                    title={sidebarCollapsed ? "SEO Tools" : ""}
                  >
                    <Globe className="h-4 w-4" />
                    {!sidebarCollapsed && <span>SEO Tools</span>}
                  </button>
                </>
              )}
            </div>
          </nav>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === "overview" && (
              <div className="mobile-grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                <Card>
                  <CardHeader className="mobile-padding">
                    <CardTitle className="flex items-center gap-2 text-mobile-body md:text-lg">
                      <Shield className="h-4 w-4 md:h-5 md:w-5" />
                      Your Role
                    </CardTitle>
                    <CardDescription className="text-mobile-caption">
                      Current access level
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="mobile-padding pt-0">
                    <div className="text-xl md:text-2xl font-bold flex items-center gap-2">
                      {getRoleIcon()}
                      <span className="break-words">
                        {userRole.replace("_", " ")}
                      </span>
                    </div>
                    <div className="mt-3 md:mt-4 text-mobile-caption text-muted-foreground">
                      {isRootAdmin && "✅ Full system access"}
                      {userRole === "admin" &&
                        !isRootAdmin &&
                        "✅ Administrative access"}
                      {userRole === "moderator" &&
                        "✅ Content management access"}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="mobile-padding">
                    <CardTitle className="flex items-center gap-2 text-mobile-body md:text-lg">
                      <Settings className="h-4 w-4 md:h-5 md:w-5" />
                      Permissions
                    </CardTitle>
                    <CardDescription className="text-mobile-caption">
                      What you can do
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="mobile-padding pt-0">
                    <div className="space-y-2 text-mobile-caption">
                      {canManageContent() && (
                        <div className="text-green-600">✅ Manage content</div>
                      )}
                      {canManageUsers() && (
                        <div className="text-green-600">✅ Manage users</div>
                      )}
                      {!canManageUsers() && (
                        <div className="text-muted-foreground">
                          ❌ User management
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="mobile-padding">
                    <CardTitle className="flex items-center gap-2 text-mobile-body md:text-lg">
                      <Users className="h-4 w-4 md:h-5 md:w-5" />
                      Quick Actions
                    </CardTitle>
                    <CardDescription className="text-mobile-caption">
                      Common tasks
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="mobile-padding pt-0">
                    <div className="space-y-2">
                      {canManageContent() && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActiveTab("events")}
                          className="w-full justify-start touch-target"
                        >
                          Manage Events
                        </Button>
                      )}
                      {canManageUsers() && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setActiveTab("users")}
                          className="w-full justify-start touch-target"
                        >
                          Manage Users
                        </Button>
                      )}

                      {/* Debug: Clear Event Cache */}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          clearEventCache();
                          toast.success(
                            "Event cache cleared! Refresh the page to see fresh data."
                          );
                        }}
                        className="w-full justify-start touch-target"
                      >
                        Clear Event Cache (Debug)
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {canManageContent() && activeTab === "ai-crawler" && <AICrawler />}

            {canManageContent() && activeTab === "scraping" && (
              <div className="space-y-6">
                {/* Cron Monitor */}
                <CronMonitor />

                {/* Original Scraping Management */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-purple-600" />
                      Automated Scraping Management
                    </CardTitle>
                    <CardDescription>
                      Configure and manage automated scrapers for events,
                      restaurants, and more
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex gap-4">
                        <Button
                          onClick={() => setShowScraperWizard(true)}
                          className="flex items-center gap-2"
                        >
                          <Bot className="h-4 w-4" />
                          Create New Scraper
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setShowJobManager(true)}
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          Manage Existing
                        </Button>
                      </div>

                      {scraping.jobs.length > 0 ? (
                        <div className="grid gap-4">
                          {scraping.jobs.map((job) => (
                            <Card key={job.id} className="p-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h4 className="font-semibold">{job.name}</h4>
                                  <p className="text-sm text-muted-foreground">
                                    Last run:{" "}
                                    {job.lastRun
                                      ? new Date(job.lastRun).toLocaleString()
                                      : "Never"}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    Events found: {job.eventsFound || 0}
                                  </p>
                                </div>
                                <Badge
                                  variant={
                                    job.status === "running"
                                      ? "default"
                                      : "secondary"
                                  }
                                >
                                  {job.status}
                                </Badge>
                              </div>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No scraping jobs configured yet.</p>
                          <p className="text-sm">
                            Create your first automated scraper to get started.
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {canManageContent() && activeTab === "events" && (
              <div className="space-y-6">
                <DomainHighlightManager />
                <ContentTable
                  type="event"
                  items={events.events}
                  isLoading={events.isLoading}
                  totalCount={events.events.length}
                  searchValue={inputValues.events}
                  onEdit={(item) => handleEdit("event", item)}
                  onDelete={(id) => handleDelete("event", id)}
                  onSearch={handleEventsSearch}
                  onFilter={(filter) => console.log("Filter events:", filter)}
                  onCreate={() => handleCreate("event")}
                  onRefresh={events.refetch}
                />
              </div>
            )}

            {canManageContent() && activeTab === "restaurants" && (
              <div className="space-y-6">
                {/* Google Places Restaurant Tools */}
                <GooglePlacesRestaurantTools />

                {/* Bulk Restaurant Updater */}
                <RestaurantBulkUpdaterSimple />

                {/* Restaurant Content Table */}
                <ContentTable
                  type="restaurant"
                  items={restaurants.restaurants}
                  isLoading={restaurants.isLoading}
                  totalCount={restaurants.restaurants.length}
                  searchValue={inputValues.restaurants}
                  onEdit={(item) => handleEdit("restaurant", item)}
                  onDelete={(id) => handleDelete("restaurant", id)}
                  onSearch={handleRestaurantsSearch}
                  onFilter={(filter) =>
                    console.log("Filter restaurants:", filter)
                  }
                  onCreate={() => handleCreate("restaurant")}
                />
              </div>
            )}

            {canManageContent() && activeTab === "attractions" && (
              <ContentTable
                type="attraction"
                items={attractions.attractions}
                isLoading={attractions.isLoading}
                totalCount={attractions.attractions.length}
                searchValue={inputValues.attractions}
                onEdit={(item) => handleEdit("attraction", item)}
                onDelete={(id) => handleDelete("attraction", id)}
                onSearch={handleAttractionsSearch}
                onFilter={(filter) =>
                  console.log("Filter attractions:", filter)
                }
                onCreate={() => handleCreate("attraction")}
              />
            )}

            {canManageContent() && activeTab === "playgrounds" && (
              <ContentTable
                type="playground"
                items={playgrounds.playgrounds}
                isLoading={playgrounds.isLoading}
                totalCount={playgrounds.playgrounds.length}
                searchValue={inputValues.playgrounds}
                onEdit={(item) => handleEdit("playground", item)}
                onDelete={(id) => handleDelete("playground", id)}
                onSearch={handlePlaygroundsSearch}
                onFilter={(filter) =>
                  console.log("Filter playgrounds:", filter)
                }
                onCreate={() => handleCreate("playground")}
              />
            )}

            {canManageContent() && activeTab === "restaurant-openings" && (
              <ContentTable
                type="restaurant_opening"
                items={restaurants.restaurants.filter((r) => {
                  const matchesSearch =
                    !searchTerms.restaurantOpenings ||
                    r.name
                      ?.toLowerCase()
                      .includes(searchTerms.restaurantOpenings.toLowerCase()) ||
                    r.cuisine
                      ?.toLowerCase()
                      .includes(searchTerms.restaurantOpenings.toLowerCase()) ||
                    r.location
                      ?.toLowerCase()
                      .includes(searchTerms.restaurantOpenings.toLowerCase());

                  const isOpening =
                    r.status === "opening_soon" ||
                    r.status === "newly_opened" ||
                    r.status === "announced" ||
                    r.opening_date ||
                    r.opening_timeframe;

                  return matchesSearch && isOpening;
                })}
                isLoading={restaurants.isLoading}
                totalCount={
                  restaurants.restaurants.filter((r) => {
                    const matchesSearch =
                      !searchTerms.restaurantOpenings ||
                      r.name
                        ?.toLowerCase()
                        .includes(
                          searchTerms.restaurantOpenings.toLowerCase()
                        ) ||
                      r.cuisine
                        ?.toLowerCase()
                        .includes(
                          searchTerms.restaurantOpenings.toLowerCase()
                        ) ||
                      r.location
                        ?.toLowerCase()
                        .includes(searchTerms.restaurantOpenings.toLowerCase());

                    const isOpening =
                      r.status === "opening_soon" ||
                      r.status === "newly_opened" ||
                      r.status === "announced" ||
                      r.opening_date ||
                      r.opening_timeframe;

                    return matchesSearch && isOpening;
                  }).length
                }
                searchValue={inputValues.restaurantOpenings}
                onEdit={(item) => handleEdit("restaurant", item)} // Use "restaurant" type instead of "restaurant_opening"
                onDelete={(id) => handleDelete("restaurant", id)}
                onSearch={handleRestaurantOpeningsSearch}
                onFilter={(filter) =>
                  console.log("Filter restaurant openings:", filter)
                }
                onCreate={() => console.log("Create new restaurant opening")}
              />
            )}

            {canManageContent() && activeTab === "event-submissions" && (
              <EventReviewSystem />
            )}

            {canManageContent() && activeTab === "affiliate-manager" && (
              <AffiliateManager />
            )}

            {canManageContent() && activeTab === "social-media" && (
              <SocialMediaManager />
            )}

            {canManageUsers() && activeTab === "users" && <UserRoleManager />}

            {canManageContent() && activeTab === "settings" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Cog className="h-5 w-5" />
                    Application Settings
                  </CardTitle>
                  <CardDescription>
                    Configure system settings and preferences
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <Alert>
                      <Settings className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Coming Soon:</strong> Advanced configuration
                        options including:
                        <ul className="list-disc list-inside mt-2 space-y-1">
                          <li>Site-wide settings and preferences</li>
                          <li>Email notification templates</li>
                          <li>Content moderation settings</li>
                          <li>API rate limiting configuration</li>
                          <li>Analytics and tracking preferences</li>
                        </ul>
                      </AlertDescription>
                    </Alert>
                  </div>
                </CardContent>
              </Card>
            )}

            {canManageContent() && activeTab === "seo" && <SEOTools />}
          </div>
        </div>
      </div>

      {/* Scraper Configuration Wizard */}
      {showScraperWizard && (
        <ScraperConfigWizard
          onSave={(config) => {
            console.log("Save scraper config:", config);
            setShowScraperWizard(false);
          }}
          onClose={() => setShowScraperWizard(false)}
        />
      )}

      {/* Scraping Job Manager */}
      {showJobManager && (
        <ScrapingJobManager
          isOpen={showJobManager}
          onClose={() => setShowJobManager(false)}
        />
      )}

      {/* Content Edit Dialog */}
      {editDialog.open && editDialog.contentType && editDialog.item && (
        <ContentEditDialog
          open={editDialog.open}
          onOpenChange={(open) => setEditDialog((prev) => ({ ...prev, open }))}
          contentType={editDialog.contentType}
          item={editDialog.item}
          onSave={handleSave}
        />
      )}
    </>
  );
}

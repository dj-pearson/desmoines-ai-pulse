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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useNavigate } from "react-router-dom";
import ContentEditDialog from "@/components/ContentEditDialog";
import ContentTemplateSelector from "@/components/ContentTemplateSelector";
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
import CronMonitorSimple from "@/components/CronMonitorSimple";
import SocialMediaManager from "@/components/SocialMediaManager";
import CoordinateManager from "@/components/CoordinateManager";
import WeekendGuideManager from "@/components/WeekendGuideManager";
import AdminSecurityManager from "@/components/AdminSecurityManager";
import AdminAnalyticsDashboard from "@/components/AdminAnalyticsDashboard";
import AdminSystemControls from "@/components/AdminSystemControls";
import AdminApplicationSettings from '@/components/AdminApplicationSettings';
import { DataQualityDashboard } from "@/components/DataQualityDashboard";
import { ActivityLogViewer } from "@/components/ActivityLogViewer";
import { ContentQueue } from "@/components/ContentQueue";
import CatchDesmoinUrlExtractor from "@/components/CatchDesmoinUrlExtractor";
import FixBrokenEventUrls from "@/components/FixBrokenEventUrls";
import { CompetitorAnalysisDashboard } from "@/components/CompetitorAnalysisDashboard";
import ArticlesManager from "@/components/ArticlesManager";
import AIArticleGenerator from "@/components/AIArticleGenerator";
import AIEnhancementManager from "@/components/AIEnhancementManager";
import { AIConfigurationManager } from "@/components/AIConfigurationManager";
import QuickCreatePanel from "@/components/admin/QuickCreatePanel";
// import { SearchTrafficDashboard } from "@/components/admin/SearchTrafficDashboard"; // Temporarily disabled - requires database migrations
import { useArticles } from "@/hooks/useArticles";
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
  UtensilsCrossed,
  Camera,
  Play,
  Globe,
  Cog,
  UserCheck,
  DollarSign,
  Menu,
  X,
  Share2,
  CalendarDays,
  ShieldCheck,
  BarChart3,
  Server,
  Target,
  Plus,
  Sparkles,
  TrendingUp,
  CheckCircle,
  ScrollText,
  ClipboardCheck,
  ChevronDown,
  Layers,
  Wrench,
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

  // Collapsible sections state
  const [openSections, setOpenSections] = useState({
    aiTools: true,
    contentTypes: true,
    contentTools: false,
    security: false,
    system: false,
  });

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Search state for each content type
  const [searchTerms, setSearchTerms] = useState({
    events: "",
    restaurants: "",
    attractions: "",
    playgrounds: "",
    restaurantOpenings: "",
    articles: "",
  });

  // Separate state for input values to prevent re-renders
  const [inputValues, setInputValues] = useState({
    events: "",
    restaurants: "",
    attractions: "",
    playgrounds: "",
    restaurantOpenings: "",
    articles: "",
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
      articles: setTimeout(
        () =>
          setSearchTerms((prev) => ({
            ...prev,
            articles: inputValues.articles,
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

  const handleArticlesSearch = useCallback((search: string) => {
    setInputValues((prev) => ({ ...prev, articles: search }));
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

  // Template selector state
  const [templateSelector, setTemplateSelector] = useState<{
    open: boolean;
    contentType: 'event' | 'article' | null;
  }>({
    open: false,
    contentType: null,
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
  const articlesData = useArticles();

  // No manual auth check needed - ProtectedRoute with requireAdmin handles it

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
    // For events, show template selector first
    if (contentType === "event") {
      setTemplateSelector({
        open: true,
        contentType: 'event',
      });
      return;
    }

    // For other content types, create with default values
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
        image_url: "",
        status: "open",
        openingDate: null,
        openingTimeframe: "",
        isFeatured: false,
      };
    } else if (contentType === "attraction") {
      emptyItem = {
        name: "",
        description: "",
        location: "",
        type: "",
        website: "",
        image_url: "",
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
        image_url: "",
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

  const handleTemplateSelect = (template: any) => {
    // Get the content type from template selector
    const contentType = templateSelector.contentType;
    if (!contentType) return;

    // Close template selector
    setTemplateSelector({ open: false, contentType: null });

    // Create item with defaults
    let emptyItem: Partial<ContentItem> = {};

    if (contentType === 'event') {
      emptyItem = {
        title: "",
        original_description: "",
        date: new Date(),
        location: "",
        venue: "",
        category: "General",
        price: "",
        source_url: "",
        is_featured: false,
        is_enhanced: false,
      };

      // Apply template defaults if a template was selected
      if (template) {
        emptyItem = {
          ...emptyItem,
          ...template.defaultValues,
        };
      }
    }

    // Open edit dialog with the item
    setEditDialog({
      open: true,
      contentType: contentType as ContentType,
      item: { ...emptyItem, isNew: true } as unknown as ContentItem,
    });
  };

  const handleQuickCreate = (templateId: string, contentType: 'event' | 'article') => {
    // Import the template function
    import('@/lib/contentTemplates').then(({ getTemplateById }) => {
      const template = getTemplateById(templateId);
      if (!template) return;

      // For events, create directly with template
      if (contentType === 'event') {
        const emptyItem: Partial<ContentItem> = {
          title: "",
          original_description: "",
          date: new Date(),
          location: "",
          venue: "",
          category: "General",
          price: "",
          source_url: "",
          is_featured: false,
          is_enhanced: false,
          ...template.defaultValues,
        };

        setEditDialog({
          open: true,
          contentType: 'event',
          item: { ...emptyItem, isNew: true } as unknown as ContentItem,
        });
      }
      // Add article handling here when ArticlesManager supports it
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
        // restaurant_opening: "restaurants", // Removed
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
      // else if (contentType === "restaurant_opening") // Removed
      restaurantOpenings.refetch();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete: " + (error as Error).message);
    }
  };

  const handleSave = async () => {
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
          // queryKey: ["restaurant_openings"], // Removed
        });
      } else if (contentType === "attraction") {
        console.log("Refetching attractions...");
        await attractions.refetch();
        await queryClient.invalidateQueries({ queryKey: ["attractions"] });
      } else if (contentType === "playground") {
        console.log("Refetching playgrounds...");
        await playgrounds.refetch();
        await queryClient.invalidateQueries({ queryKey: ["playgrounds"] });
      }
      console.log("All refetches completed successfully");
    } catch (error) {
      console.error("Error during save:", error);
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

              {canManageContent() && !sidebarCollapsed && (
                <>
                  {/* AI Tools Section */}
                  <Collapsible
                    open={openSections.aiTools}
                    onOpenChange={() => toggleSection("aiTools")}
                    className="mt-4"
                  >
                    <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors">
                      <div className="flex items-center gap-2">
                        <Bot className="h-4 w-4" />
                        <span className="text-sm font-medium">AI & Automation</span>
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          openSections.aiTools ? "rotate-180" : ""
                        }`}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-1 mt-1 pl-2">
                      <button
                        onClick={() => setActiveTab("ai-crawler")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "ai-crawler"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <Bot className="h-4 w-4" />
                        <span>AI Crawler</span>
                      </button>

                      <button
                        onClick={() => setActiveTab("ai-configuration")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "ai-configuration"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <Sparkles className="h-4 w-4" />
                        <span>AI Configuration</span>
                      </button>

                      <button
                        onClick={() => setActiveTab("ai-enhancement")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "ai-enhancement"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <Sparkles className="h-4 w-4" />
                        <span>AI Event Enhancement</span>
                      </button>

                      <button
                        onClick={() => setActiveTab("ai-article-generator")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "ai-article-generator"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <Bot className="h-4 w-4" />
                        <span>AI Article Generator</span>
                      </button>

                      <button
                        onClick={() => setActiveTab("scraping")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "scraping"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <Zap className="h-4 w-4" />
                        <span>Scraping</span>
                      </button>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Content Types Section */}
                  <Collapsible
                    open={openSections.contentTypes}
                    onOpenChange={() => toggleSection("contentTypes")}
                  >
                    <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors">
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4" />
                        <span className="text-sm font-medium">Content Types</span>
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          openSections.contentTypes ? "rotate-180" : ""
                        }`}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-1 mt-1 pl-2">
                      <button
                        onClick={() => setActiveTab("events")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "events"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <Calendar className="h-4 w-4" />
                        <span>Events</span>
                      </button>

                      <button
                        onClick={() => setActiveTab("restaurants")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "restaurants"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <Utensils className="h-4 w-4" />
                        <span>Restaurants</span>
                      </button>

                      <button
                        onClick={() => setActiveTab("restaurant-openings")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "restaurant-openings"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <Building className="h-4 w-4" />
                        <span>Restaurant Openings</span>
                      </button>

                      <button
                        onClick={() => setActiveTab("attractions")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "attractions"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <Camera className="h-4 w-4" />
                        <span>Attractions</span>
                      </button>

                      <button
                        onClick={() => setActiveTab("playgrounds")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "playgrounds"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <Play className="h-4 w-4" />
                        <span>Playgrounds</span>
                      </button>

                      <button
                        onClick={() => setActiveTab("articles")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "articles"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <FileText className="h-4 w-4" />
                        <span>Articles</span>
                      </button>

                      <button
                        onClick={() => setActiveTab("article-editor")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "article-editor"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <Plus className="h-4 w-4" />
                        <span>New Article</span>
                      </button>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Content Tools Section */}
                  <Collapsible
                    open={openSections.contentTools}
                    onOpenChange={() => toggleSection("contentTools")}
                  >
                    <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors">
                      <div className="flex items-center gap-2">
                        <Wrench className="h-4 w-4" />
                        <span className="text-sm font-medium">Content Tools</span>
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          openSections.contentTools ? "rotate-180" : ""
                        }`}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-1 mt-1 pl-2">
                      <button
                        onClick={() => setActiveTab("event-submissions")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "event-submissions"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <UserCheck className="h-4 w-4" />
                        <span>Event Submissions</span>
                      </button>

                      <button
                        onClick={() => setActiveTab("seo")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "seo"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <Globe className="h-4 w-4" />
                        <span>SEO Tools</span>
                      </button>

                      <button
                        onClick={() => setActiveTab("weekend-guide")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "weekend-guide"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <CalendarDays className="h-4 w-4" />
                        <span>Weekend Guide</span>
                      </button>

                      <button
                        onClick={() => setActiveTab("affiliate-manager")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "affiliate-manager"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <DollarSign className="h-4 w-4" />
                        <span>Affiliate Links</span>
                      </button>

                      <button
                        onClick={() => setActiveTab("social-media")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "social-media"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <Share2 className="h-4 w-4" />
                        <span>Social Media</span>
                      </button>

                      <button
                        onClick={() => setActiveTab("coordinates")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "coordinates"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <Settings className="h-4 w-4" />
                        <span>Coordinates</span>
                      </button>

                      <button
                        onClick={() => setActiveTab("competitor-analysis")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "competitor-analysis"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <Target className="h-4 w-4" />
                        <span>Competitor Analysis</span>
                      </button>
                    </CollapsibleContent>
                  </Collapsible>
                </>
              )}

              {canManageUsers() && !sidebarCollapsed && (
                <>
                  {/* Security & Monitoring Section */}
                  <Collapsible
                    open={openSections.security}
                    onOpenChange={() => toggleSection("security")}
                    className="mt-4"
                  >
                    <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4" />
                        <span className="text-sm font-medium">Security & Analytics</span>
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          openSections.security ? "rotate-180" : ""
                        }`}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-1 mt-1 pl-2">
                      <button
                        onClick={() => setActiveTab("security")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "security"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <ShieldCheck className="h-4 w-4" />
                        <span>Security Manager</span>
                      </button>

                      <button
                        onClick={() => setActiveTab("activity-logs")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "activity-logs"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <ScrollText className="h-4 w-4" />
                        <span>Activity Logs</span>
                      </button>

                      <button
                        onClick={() => setActiveTab("content-queue")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "content-queue"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <ClipboardCheck className="h-4 w-4" />
                        <span>Content Queue</span>
                      </button>

                      <button
                        onClick={() => setActiveTab("analytics")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "analytics"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <BarChart3 className="h-4 w-4" />
                        <span>Advanced Analytics</span>
                      </button>

                      <button
                        onClick={() => setActiveTab("data-quality")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "data-quality"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <CheckCircle className="h-4 w-4" />
                        <span>Data Quality</span>
                      </button>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* System Administration Section */}
                  <Collapsible
                    open={openSections.system}
                    onOpenChange={() => toggleSection("system")}
                  >
                    <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors">
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4" />
                        <span className="text-sm font-medium">System Admin</span>
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          openSections.system ? "rotate-180" : ""
                        }`}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-1 mt-1 pl-2">
                      <button
                        onClick={() => setActiveTab("users")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "users"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <Users className="h-4 w-4" />
                        <span>User Management</span>
                      </button>

                      <button
                        onClick={() => setActiveTab("system")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "system"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <Server className="h-4 w-4" />
                        <span>System Controls</span>
                      </button>

                      <button
                        onClick={() => setActiveTab("settings")}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm ${
                          activeTab === "settings"
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <Cog className="h-4 w-4" />
                        <span>Settings</span>
                      </button>
                    </CollapsibleContent>
                  </Collapsible>
                </>
              )}

              {/* Collapsed Sidebar - Show Key Icon Buttons */}
              {sidebarCollapsed && canManageContent() && (
                <>
                  <div className="pt-4 border-t border-border" />
                  <button
                    onClick={() => setActiveTab("events")}
                    className={`w-full flex items-center justify-center px-3 py-2 rounded-lg text-left transition-colors ${
                      activeTab === "events"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                    title="Events"
                  >
                    <Calendar className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => setActiveTab("restaurants")}
                    className={`w-full flex items-center justify-center px-3 py-2 rounded-lg text-left transition-colors ${
                      activeTab === "restaurants"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                    title="Restaurants"
                  >
                    <Utensils className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => setActiveTab("articles")}
                    className={`w-full flex items-center justify-center px-3 py-2 rounded-lg text-left transition-colors ${
                      activeTab === "articles"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                    title="Articles"
                  >
                    <FileText className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => setActiveTab("seo")}
                    className={`w-full flex items-center justify-center px-3 py-2 rounded-lg text-left transition-colors ${
                      activeTab === "seo"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent hover:text-accent-foreground"
                    }`}
                    title="SEO Tools"
                  >
                    <Globe className="h-4 w-4" />
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

            {activeTab === "overview" && canManageContent() && (
              <div className="mt-6">
                <QuickCreatePanel onCreateFromTemplate={handleQuickCreate} />
              </div>
            )}

            {canManageContent() && activeTab === "ai-crawler" && <AICrawler />}

            {canManageContent() && activeTab === "ai-configuration" && (
              <AIConfigurationManager />
            )}

            {canManageContent() && activeTab === "scraping" && (
              <div className="space-y-6">
                {/* Cron Monitor */}
                <CronMonitorSimple />

                {/* Restaurant Opening Scraper */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UtensilsCrossed className="h-5 w-5 text-orange-600" />
                      Restaurant Opening Scraper
                    </CardTitle>
                    <CardDescription>
                      Automatically discover and add new restaurant openings to the database
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <Button
                        onClick={async () => {
                          try {
                            const { data, error } = await supabase.functions.invoke(
                              "restaurant-opening-scraper",
                              { body: {} }
                            );
                            if (error) throw error;
                            toast.success("Restaurant Scraper Complete", {
                              description: `Found ${data.totalFound} restaurants, Inserted ${data.inserted}, Updated ${data.updated}`,
                            });
                          } catch (error: any) {
                            toast.error("Scraper Error", {
                              description: error.message,
                            });
                          }
                        }}
                        className="flex items-center gap-2"
                      >
                        <UtensilsCrossed className="h-4 w-4" />
                        Run Restaurant Scraper
                      </Button>
                      <div className="text-sm text-muted-foreground">
                        <p>This will scrape the following sources:</p>
                        <ul className="list-disc list-inside mt-2 space-y-1">
                          <li>Des Moines Register - Restaurant Openings</li>
                          <li>Catch Des Moines - Restaurants</li>
                          <li>Eater Des Moines - New Restaurants</li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>

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
                <CatchDesmoinUrlExtractor />
                <FixBrokenEventUrls />
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

            {canManageContent() && activeTab === "articles" && (
              <ArticlesManager />
            )}

            {canManageContent() && activeTab === "ai-article-generator" && (
              <AIArticleGenerator />
            )}

            {canManageContent() && activeTab === "ai-enhancement" && (
              <AIEnhancementManager />
            )}

            {canManageContent() && activeTab === "article-editor" && (
              <div className="p-6">
                <iframe
                  src="/admin/articles/new"
                  className="w-full h-[800px] border rounded-lg"
                  title="Article Editor"
                />
              </div>
            )}

            {canManageContent() && activeTab === "restaurant-openings" && (
              <ContentTable
                type="restaurant"
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
                onEdit={(item) => handleEdit("restaurant", item)}
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

            {canManageContent() && activeTab === "coordinates" && (
              <CoordinateManager />
            )}

            {canManageContent() && activeTab === "competitor-analysis" && (
              <CompetitorAnalysisDashboard />
            )}

            {canManageUsers() && activeTab === "users" && <UserRoleManager />}

            {canManageUsers() && activeTab === "security" && <AdminSecurityManager />}

            {canManageUsers() && activeTab === "activity-logs" && <ActivityLogViewer />}

            {canManageUsers() && activeTab === "content-queue" && <ContentQueue />}

            {canManageUsers() && activeTab === "analytics" && <AdminAnalyticsDashboard />}

            {/* Search Traffic Dashboard temporarily disabled - requires database migrations */}
            {/* {canManageUsers() && activeTab === "search-traffic" && <SearchTrafficDashboard />} */}

            {canManageUsers() && activeTab === "data-quality" && (
              <DataQualityDashboard
                events={events.events}
                restaurants={restaurants.restaurants}
                attractions={attractions.attractions}
                playgrounds={playgrounds.playgrounds}
                onViewItem={(contentType, itemId) => {
                  // Find the item and open edit dialog
                  let item;
                  switch (contentType) {
                    case 'event':
                      item = events.events.find((e: any) => e.id === itemId);
                      setActiveTab('events');
                      break;
                    case 'restaurant':
                      item = restaurants.restaurants.find((r: any) => r.id === itemId);
                      setActiveTab('restaurants');
                      break;
                    case 'attraction':
                      item = attractions.attractions.find((a: any) => a.id === itemId);
                      setActiveTab('attractions');
                      break;
                    case 'playground':
                      item = playgrounds.playgrounds.find((p: any) => p.id === itemId);
                      setActiveTab('playgrounds');
                      break;
                  }
                  if (item) {
                    handleEdit(contentType as ContentType, item);
                  }
                }}
              />
            )}

            {canManageUsers() && activeTab === "system" && <AdminSystemControls />}

            {canManageContent() && activeTab === "settings" && <AdminApplicationSettings />}

            {canManageContent() && activeTab === "seo" && <SEOTools />}

            {canManageContent() && activeTab === "weekend-guide" && <WeekendGuideManager />}
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

      {/* Content Template Selector */}
      {templateSelector.open && templateSelector.contentType && (
        <ContentTemplateSelector
          open={templateSelector.open}
          onOpenChange={(open) => {
            if (!open) {
              setTemplateSelector({ open: false, contentType: null });
            }
          }}
          contentType={templateSelector.contentType}
          onSelectTemplate={handleTemplateSelect}
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

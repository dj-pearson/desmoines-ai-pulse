import { useState, useEffect, useCallback } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Shield, Users, FileText, Database, Crown, AlertTriangle, Settings, Bot, Zap, Calendar, Building, Utensils, Camera, Play, Globe, Cog, UserCheck } from "lucide-react";
import { useEvents } from "@/hooks/useEvents";
import { useRestaurants } from "@/hooks/useRestaurants";
import { useAttractions } from "@/hooks/useAttractions";
import { usePlaygrounds } from "@/hooks/usePlaygrounds";
import { useRestaurantOpenings } from "@/hooks/useRestaurantOpenings";
import { useScraping } from "@/hooks/useScraping";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export default function Admin() {
  const { user, userRole, isLoading, hasAdminAccess, isRootAdmin } = useAdminAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [showScraperWizard, setShowScraperWizard] = useState(false);
  const [showJobManager, setShowJobManager] = useState(false);
  
  // Search state for each content type
  const [searchTerms, setSearchTerms] = useState({
    events: "",
    restaurants: "",
    attractions: "",
    playgrounds: "",
    restaurantOpenings: ""
  });

  // Separate state for input values to prevent re-renders
  const [inputValues, setInputValues] = useState({
    events: "",
    restaurants: "",
    attractions: "",
    playgrounds: "",
    restaurantOpenings: ""
  });

  // Debounce the search term updates
  useEffect(() => {
    const timeouts = {
      events: setTimeout(() => setSearchTerms(prev => ({ ...prev, events: inputValues.events })), 300),
      restaurants: setTimeout(() => setSearchTerms(prev => ({ ...prev, restaurants: inputValues.restaurants })), 300),
      attractions: setTimeout(() => setSearchTerms(prev => ({ ...prev, attractions: inputValues.attractions })), 300),
      playgrounds: setTimeout(() => setSearchTerms(prev => ({ ...prev, playgrounds: inputValues.playgrounds })), 300),
      restaurantOpenings: setTimeout(() => setSearchTerms(prev => ({ ...prev, restaurantOpenings: inputValues.restaurantOpenings })), 300),
    };

    return () => {
      Object.values(timeouts).forEach(timeout => clearTimeout(timeout));
    };
  }, [inputValues]);
  
  // Search handlers that only update input values (not search terms)
  const handleEventsSearch = useCallback((search: string) => {
    setInputValues(prev => ({ ...prev, events: search }));
  }, []);
  
  const handleRestaurantsSearch = useCallback((search: string) => {
    setInputValues(prev => ({ ...prev, restaurants: search }));
  }, []);
  
  const handleAttractionsSearch = useCallback((search: string) => {
    setInputValues(prev => ({ ...prev, attractions: search }));
  }, []);
  
  const handlePlaygroundsSearch = useCallback((search: string) => {
    setInputValues(prev => ({ ...prev, playgrounds: search }));
  }, []);
  
  const handleRestaurantOpeningsSearch = useCallback((search: string) => {
    setInputValues(prev => ({ ...prev, restaurantOpenings: search }));
  }, []);
  
  // Edit dialog state
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    contentType: "event" | "restaurant" | "attraction" | "playground" | "restaurant_opening" | null;
    item: any;
  }>({
    open: false,
    contentType: null,
    item: null
  });

  // Data hooks with search filters
  const events = useEvents({ search: searchTerms.events });
  const restaurants = useRestaurants({ search: searchTerms.restaurants });
  const attractions = useAttractions({ search: searchTerms.attractions });
  const playgrounds = usePlaygrounds({ search: searchTerms.playgrounds });
  const restaurantOpenings = useRestaurantOpenings({ search: searchTerms.restaurantOpenings });
  const scraping = useScraping();

  useEffect(() => {
    console.log("Admin useEffect:", {
      user: user?.id || 'null',
      userRole,
      isLoading,
      hasAdminAccess,
      isRootAdmin
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
  }, [user, userRole, isLoading, hasAdminAccess, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 md:h-12 md:w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-mobile-caption text-muted-foreground">Loading admin dashboard...</p>
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
            <h2 className="text-mobile-title md:text-xl font-semibold mb-2">Access Denied</h2>
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
    if (userRole === 'admin') return <Shield className="h-5 w-5" />;
    return <Users className="h-5 w-5" />;
  };

  const getRoleBadge = () => {
    const variant = isRootAdmin ? "default" : userRole === 'admin' ? "destructive" : "secondary";
    return (
      <Badge variant={variant} className="ml-2">
        {userRole.replace('_', ' ')}
      </Badge>
    );
  };

  const canManageContent = () => ['moderator', 'admin', 'root_admin'].includes(userRole);
  const canManageUsers = () => ['admin', 'root_admin'].includes(userRole);

  // Handler functions for content management
  const handleEdit = (contentType: typeof editDialog.contentType, item: any) => {
    setEditDialog({
      open: true,
      contentType,
      item
    });
  };

  const handleDelete = async (contentType: string, id: string) => {
    try {
      const tableName = contentType === 'restaurant_opening' ? 'restaurants' : 
                       contentType === 'event' ? 'events' : 
                       contentType === 'restaurant' ? 'restaurants' : 
                       contentType === 'attraction' ? 'attractions' : 
                       contentType === 'playground' ? 'playgrounds' : contentType + 's';
      
      const { error } = await supabase
        .from(tableName as any)
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success(`${contentType.charAt(0).toUpperCase() + contentType.slice(1)} deleted successfully!`);
      
      // Refresh the appropriate data
      if (contentType === 'event') events.refetch();
      else if (contentType === 'restaurant') restaurants.refetch();
      else if (contentType === 'attraction') attractions.refetch();
      else if (contentType === 'playground') playgrounds.refetch();
      else if (contentType === 'restaurant_opening') restaurantOpenings.refetch();
      
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete: ' + (error as Error).message);
    }
  };

  const handleSave = async () => {
    // Refresh the appropriate data after save
    const { contentType } = editDialog;
    console.log('handleSave called for contentType:', contentType);
    
    try {
      if (contentType === 'event') {
        console.log('Refetching events...');
        await events.refetch();
        await queryClient.invalidateQueries({ queryKey: ['events'] });
      }
      else if (contentType === 'restaurant') {
        console.log('Refetching restaurants...');
        await restaurants.refetch();
        await queryClient.invalidateQueries({ queryKey: ['restaurants'] });
        // Also refresh restaurant openings since restaurants with opening_date show there
        console.log('Refetching restaurant openings...');
        await restaurantOpenings.refetch();
        await queryClient.invalidateQueries({ queryKey: ['restaurant_openings'] });
      }
      else if (contentType === 'attraction') {
        console.log('Refetching attractions...');
        await attractions.refetch();
        await queryClient.invalidateQueries({ queryKey: ['attractions'] });
      }
      else if (contentType === 'playground') {
        console.log('Refetching playgrounds...');
        await playgrounds.refetch();
        await queryClient.invalidateQueries({ queryKey: ['playgrounds'] });
      }
      else if (contentType === 'restaurant_opening') {
        console.log('Refetching restaurant openings...');
        await restaurantOpenings.refetch();
        await queryClient.invalidateQueries({ queryKey: ['restaurant_openings'] });
      }
      
      console.log('All refetches completed successfully');
    } catch (error) {
      console.error('Error during refetch:', error);
    }
  };

  return (
    <div className="min-h-screen bg-background safe-area-top">
      {/* Mobile-First Admin Header */}
      <div className="bg-card border-b mobile-padding py-3 md:py-4 sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-card/95">
        <div className="container mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 md:gap-3">
              {getRoleIcon()}
              <h1 className="text-mobile-title md:text-2xl font-bold">Admin Dashboard</h1>
              {getRoleBadge()}
            </div>
            <Button 
              variant="outline" 
              onClick={() => navigate("/")}
              className="touch-target self-start"
            >
              Back to Site
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto mobile-padding py-4 md:py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Mobile-Optimized Tab Navigation */}
          <div className="mb-4 md:mb-6 overflow-x-auto">
            <TabsList className="flex w-max sm:w-auto gap-1 p-1">
              <TabsTrigger value="overview" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
                <Database className="h-3 w-3 md:h-4 md:w-4" />
                <span className="hidden sm:inline">Overview</span>
                <span className="sm:hidden">Info</span>
              </TabsTrigger>
              {canManageContent() && (
                <>
                  <TabsTrigger value="scraping" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
                    <Zap className="h-3 w-3 md:h-4 md:w-4" />
                    <span className="hidden sm:inline">Scraping</span>
                    <span className="sm:hidden">Scrape</span>
                  </TabsTrigger>
                  <TabsTrigger value="ai-crawler" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
                    <Database className="h-3 w-3 md:h-4 md:w-4" />
                    <span className="hidden sm:inline">AI Crawler</span>
                    <span className="sm:hidden">AI</span>
                  </TabsTrigger>
                  <TabsTrigger value="events" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
                    <Calendar className="h-3 w-3 md:h-4 md:w-4" />
                    <span className="hidden sm:inline">Events</span>
                    <span className="sm:hidden">Events</span>
                  </TabsTrigger>
                  <TabsTrigger value="restaurants" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
                    <Utensils className="h-3 w-3 md:h-4 md:w-4" />
                    <span className="hidden sm:inline">Restaurants</span>
                    <span className="sm:hidden">Food</span>
                  </TabsTrigger>
                  <TabsTrigger value="attractions" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
                    <Camera className="h-3 w-3 md:h-4 md:w-4" />
                    <span className="hidden sm:inline">Attractions</span>
                    <span className="sm:hidden">Attract</span>
                  </TabsTrigger>
                  <TabsTrigger value="playgrounds" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
                    <Play className="h-3 w-3 md:h-4 md:w-4" />
                    <span className="hidden sm:inline">Playgrounds</span>
                    <span className="sm:hidden">Play</span>
                  </TabsTrigger>
                  <TabsTrigger value="restaurant-openings" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
                    <Building className="h-3 w-3 md:h-4 md:w-4" />
                    <span className="hidden sm:inline">Restaurant Openings</span>
                    <span className="sm:hidden">Open</span>
                  </TabsTrigger>
                </>
              )}
              {canManageContent() && (
                <TabsTrigger value="event-submissions" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
                  <UserCheck className="h-3 w-3 md:h-4 md:w-4" />
                  <span className="hidden sm:inline">Event Submissions</span>
                  <span className="sm:hidden">Submissions</span>
                </TabsTrigger>
              )}
              {canManageUsers() && (
                <TabsTrigger value="users" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
                  <Users className="h-3 w-3 md:h-4 md:w-4" />
                  <span className="hidden sm:inline">User Management</span>
                  <span className="sm:hidden">Users</span>
                </TabsTrigger>
              )}
              {canManageContent() && (
                <>
                  <TabsTrigger value="settings" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
                    <Cog className="h-3 w-3 md:h-4 md:w-4" />
                    <span className="hidden sm:inline">Settings</span>
                    <span className="sm:hidden">Settings</span>
                  </TabsTrigger>
                  <TabsTrigger value="seo" className="flex items-center gap-1 md:gap-2 text-xs md:text-sm">
                    <Globe className="h-3 w-3 md:h-4 md:w-4" />
                    <span className="hidden sm:inline">SEO Tools</span>
                    <span className="sm:hidden">SEO</span>
                  </TabsTrigger>
                </>
              )}
            </TabsList>
          </div>

          <TabsContent value="overview">
            <div className="mobile-grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              <Card>
                <CardHeader className="mobile-padding">
                  <CardTitle className="flex items-center gap-2 text-mobile-body md:text-lg">
                    <Shield className="h-4 w-4 md:h-5 md:w-5" />
                    Your Role
                  </CardTitle>
                  <CardDescription className="text-mobile-caption">Current access level</CardDescription>
                </CardHeader>
                <CardContent className="mobile-padding pt-0">
                  <div className="text-xl md:text-2xl font-bold flex items-center gap-2">
                    {getRoleIcon()}
                    <span className="break-words">{userRole.replace('_', ' ')}</span>
                  </div>
                  <div className="mt-3 md:mt-4 text-mobile-caption text-muted-foreground">
                    {isRootAdmin && "✅ Full system access"}
                    {userRole === 'admin' && !isRootAdmin && "✅ Administrative access"}
                    {userRole === 'moderator' && "✅ Content management access"}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="mobile-padding">
                  <CardTitle className="flex items-center gap-2 text-mobile-body md:text-lg">
                    <Settings className="h-4 w-4 md:h-5 md:w-5" />
                    Permissions
                  </CardTitle>
                  <CardDescription className="text-mobile-caption">What you can do</CardDescription>
                </CardHeader>
                <CardContent className="mobile-padding pt-0">
                  <div className="space-y-2 text-mobile-caption">
                    {canManageContent() && <div className="text-green-600">✅ Manage content</div>}
                    {canManageUsers() && <div className="text-green-600">✅ Manage users</div>}
                    {!canManageUsers() && <div className="text-muted-foreground">❌ User management</div>}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="mobile-padding">
                  <CardTitle className="flex items-center gap-2 text-mobile-body md:text-lg">
                    <Users className="h-4 w-4 md:h-5 md:w-5" />
                    Quick Actions
                  </CardTitle>
                  <CardDescription className="text-mobile-caption">Common tasks</CardDescription>
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
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {canManageContent() && (
            <>
              <TabsContent value="ai-crawler">
                <AICrawler />
              </TabsContent>

              <TabsContent value="scraping">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-purple-600" />
                      Automated Scraping Management
                    </CardTitle>
                    <CardDescription>
                      Configure and manage automated scrapers for events, restaurants, and more
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
                                     Last run: {job.lastRun ? new Date(job.lastRun).toLocaleString() : 'Never'}
                                   </p>
                                   <p className="text-sm text-muted-foreground">
                                     Events found: {job.eventsFound || 0}
                                   </p>
                                </div>
                                <Badge variant={job.status === 'running' ? 'default' : 'secondary'}>
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
                          <p className="text-sm">Create your first automated scraper to get started.</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="events">
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
                    onFilter={(filter) => console.log('Filter events:', filter)}
                    onCreate={() => console.log('Create new event')}
                    onRefresh={events.refetch}
                  />
                </div>
              </TabsContent>

              <TabsContent value="restaurants">
                <ContentTable
                  type="restaurant"
                  items={restaurants.restaurants}
                  isLoading={restaurants.isLoading}
                  totalCount={restaurants.restaurants.length}
                  searchValue={inputValues.restaurants}
                  onEdit={(item) => handleEdit("restaurant", item)}
                  onDelete={(id) => handleDelete("restaurant", id)}
                  onSearch={handleRestaurantsSearch}
                  onFilter={(filter) => console.log('Filter restaurants:', filter)}
                  onCreate={() => console.log('Create new restaurant')}
                />
              </TabsContent>

              <TabsContent value="attractions">
                <ContentTable
                  type="attraction"
                  items={attractions.attractions}
                  isLoading={attractions.isLoading}
                  totalCount={attractions.attractions.length}
                  searchValue={inputValues.attractions}
                  onEdit={(item) => handleEdit("attraction", item)}
                  onDelete={(id) => handleDelete("attraction", id)}
                  onSearch={handleAttractionsSearch}
                  onFilter={(filter) => console.log('Filter attractions:', filter)}
                  onCreate={() => console.log('Create new attraction')}
                />
              </TabsContent>

              <TabsContent value="playgrounds">
                <ContentTable
                  type="playground"
                  items={playgrounds.playgrounds}
                  isLoading={playgrounds.isLoading}
                  totalCount={playgrounds.playgrounds.length}
                  searchValue={inputValues.playgrounds}
                  onEdit={(item) => handleEdit("playground", item)}
                  onDelete={(id) => handleDelete("playground", id)}
                  onSearch={handlePlaygroundsSearch}
                  onFilter={(filter) => console.log('Filter playgrounds:', filter)}
                  onCreate={() => console.log('Create new playground')}
                />
              </TabsContent>

              <TabsContent value="restaurant-openings">
                <ContentTable
                  type="restaurant_opening"
                  items={restaurants.restaurants.filter(r => {
                    const matchesSearch = !searchTerms.restaurantOpenings || 
                      r.name?.toLowerCase().includes(searchTerms.restaurantOpenings.toLowerCase()) ||
                      r.cuisine?.toLowerCase().includes(searchTerms.restaurantOpenings.toLowerCase()) ||
                      r.location?.toLowerCase().includes(searchTerms.restaurantOpenings.toLowerCase());
                    
                    const isOpening = r.status === 'opening_soon' || 
                      r.status === 'newly_opened' || 
                      r.status === 'announced' ||
                      r.opening_date || 
                      r.opening_timeframe;
                    
                    return matchesSearch && isOpening;
                  })}
                  isLoading={restaurants.isLoading}
                  totalCount={restaurants.restaurants.filter(r => {
                    const matchesSearch = !searchTerms.restaurantOpenings || 
                      r.name?.toLowerCase().includes(searchTerms.restaurantOpenings.toLowerCase()) ||
                      r.cuisine?.toLowerCase().includes(searchTerms.restaurantOpenings.toLowerCase()) ||
                      r.location?.toLowerCase().includes(searchTerms.restaurantOpenings.toLowerCase());
                    
                    const isOpening = r.status === 'opening_soon' || 
                      r.status === 'newly_opened' || 
                      r.status === 'announced' ||
                      r.opening_date || 
                      r.opening_timeframe;
                    
                    return matchesSearch && isOpening;
                  }).length}
                  searchValue={inputValues.restaurantOpenings}
                  onEdit={(item) => handleEdit("restaurant", item)} // Use "restaurant" type instead of "restaurant_opening"
                  onDelete={(id) => handleDelete("restaurant", id)}
                  onSearch={handleRestaurantOpeningsSearch}
                  onFilter={(filter) => console.log('Filter restaurant openings:', filter)}
                  onCreate={() => console.log('Create new restaurant opening')}
                />
              </TabsContent>
            </>
          )}

          {canManageUsers() && (
            <TabsContent value="users">
              <UserRoleManager />
            </TabsContent>
          )}

          {canManageContent() && (
            <>
              <TabsContent value="settings">
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
                          <strong>Coming Soon:</strong> Advanced configuration options including:
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
              </TabsContent>

              <TabsContent value="event-submissions">
                <EventReviewSystem />
              </TabsContent>

              <TabsContent value="seo">
                <SEOTools />
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>

      {/* Scraper Configuration Wizard */}
      {showScraperWizard && (
        <ScraperConfigWizard
          onSave={(config) => {
            console.log('Save scraper config:', config);
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
          onOpenChange={(open) => setEditDialog(prev => ({ ...prev, open }))}
          contentType={editDialog.contentType}
          item={editDialog.item}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
import { useState, useEffect } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import UserRoleManager from "@/components/UserRoleManager";
import ContentTable from "@/components/ContentTable";
import AICrawler from "@/components/AICrawler";
import ScraperConfigWizard from "@/components/ScraperConfigWizard";
import ScrapingJobManager from "@/components/ScrapingJobManager";
import { Shield, Users, FileText, Database, Crown, AlertTriangle, Settings, Bot, Zap, Calendar, Building, Utensils, Camera, Play } from "lucide-react";
import { useEvents } from "@/hooks/useEvents";
import { useRestaurants } from "@/hooks/useRestaurants";
import { useAttractions } from "@/hooks/useAttractions";
import { usePlaygrounds } from "@/hooks/usePlaygrounds";
import { useRestaurantOpenings } from "@/hooks/useRestaurantOpenings";
import { useScraping } from "@/hooks/useScraping";

export default function Admin() {
  const { user, userRole, isLoading, hasAdminAccess, isRootAdmin } = useAdminAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [showScraperWizard, setShowScraperWizard] = useState(false);
  const [showJobManager, setShowJobManager] = useState(false);

  // Data hooks
  const events = useEvents();
  const restaurants = useRestaurants();
  const attractions = useAttractions();
  const playgrounds = usePlaygrounds();
  const restaurantOpenings = useRestaurantOpenings();
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!hasAdminAccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="p-6 max-w-md">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-4">
              You don't have permission to access the admin dashboard.
            </p>
            <Button onClick={() => navigate("/")} variant="outline">
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getRoleIcon()}
              <h1 className="text-2xl font-bold">Admin Dashboard</h1>
              {getRoleBadge()}
            </div>
            <Button variant="outline" onClick={() => navigate("/")}>
              Back to Site
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              Overview
            </TabsTrigger>
            {canManageContent() && (
              <>
                <TabsTrigger value="ai-crawler" className="flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  AI Crawler
                </TabsTrigger>
                <TabsTrigger value="scraping" className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Scraping
                </TabsTrigger>
                <TabsTrigger value="events" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Events
                </TabsTrigger>
                <TabsTrigger value="restaurants" className="flex items-center gap-2">
                  <Utensils className="h-4 w-4" />
                  Restaurants
                </TabsTrigger>
                <TabsTrigger value="attractions" className="flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  Attractions
                </TabsTrigger>
                <TabsTrigger value="playgrounds" className="flex items-center gap-2">
                  <Play className="h-4 w-4" />
                  Playgrounds
                </TabsTrigger>
                <TabsTrigger value="restaurant-openings" className="flex items-center gap-2">
                  <Building className="h-4 w-4" />
                  Restaurant Openings
                </TabsTrigger>
              </>
            )}
            {canManageUsers() && (
              <TabsTrigger value="users" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                User Management
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Your Role
                  </CardTitle>
                  <CardDescription>Current access level</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold flex items-center gap-2">
                    {getRoleIcon()}
                    {userRole.replace('_', ' ')}
                  </div>
                  <div className="mt-4 text-sm text-gray-600">
                    {isRootAdmin && "✅ Full system access"}
                    {userRole === 'admin' && !isRootAdmin && "✅ Administrative access"}
                    {userRole === 'moderator' && "✅ Content management access"}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Permissions
                  </CardTitle>
                  <CardDescription>What you can do</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    {canManageContent() && <div className="text-green-600">✅ Manage content</div>}
                    {canManageUsers() && <div className="text-green-600">✅ Manage users</div>}
                    {!canManageUsers() && <div className="text-gray-400">❌ User management</div>}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Quick Actions
                  </CardTitle>
                  <CardDescription>Common tasks</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {canManageContent() && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setActiveTab("events")}
                        className="w-full justify-start"
                      >
                        Manage Events
                      </Button>
                    )}
                    {canManageUsers() && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setActiveTab("users")}
                        className="w-full justify-start"
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
                <ContentTable
                  type="event"
                  items={events.events}
                  isLoading={events.isLoading}
                  totalCount={events.events.length}
                  onEdit={(item) => console.log('Edit event:', item)}
                  onDelete={(id) => console.log('Delete event:', id)}
                  onSearch={(search) => console.log('Search events:', search)}
                  onFilter={(filter) => console.log('Filter events:', filter)}
                  onCreate={() => console.log('Create new event')}
                />
              </TabsContent>

              <TabsContent value="restaurants">
                <ContentTable
                  type="restaurant"
                  items={restaurants.restaurants}
                  isLoading={restaurants.isLoading}
                  totalCount={restaurants.restaurants.length}
                  onEdit={(item) => console.log('Edit restaurant:', item)}
                  onDelete={(id) => console.log('Delete restaurant:', id)}
                  onSearch={(search) => console.log('Search restaurants:', search)}
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
                  onEdit={(item) => console.log('Edit attraction:', item)}
                  onDelete={(id) => console.log('Delete attraction:', id)}
                  onSearch={(search) => console.log('Search attractions:', search)}
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
                  onEdit={(item) => console.log('Edit playground:', item)}
                  onDelete={(id) => console.log('Delete playground:', id)}
                  onSearch={(search) => console.log('Search playgrounds:', search)}
                  onFilter={(filter) => console.log('Filter playgrounds:', filter)}
                  onCreate={() => console.log('Create new playground')}
                />
              </TabsContent>

              <TabsContent value="restaurant-openings">
                <ContentTable
                  type="restaurant_opening"
                  items={restaurantOpenings.restaurantOpenings}
                  isLoading={restaurantOpenings.isLoading}
                  totalCount={restaurantOpenings.restaurantOpenings.length}
                  onEdit={(item) => console.log('Edit restaurant opening:', item)}
                  onDelete={(id) => console.log('Delete restaurant opening:', id)}
                  onSearch={(search) => console.log('Search restaurant openings:', search)}
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
    </div>
  );
}
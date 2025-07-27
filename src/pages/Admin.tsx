import { useState, useEffect } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import UserRoleManager from "@/components/UserRoleManager";
import ContentTable from "@/components/ContentTable";
import { Shield, Users, FileText, Database, Crown, AlertTriangle, Settings } from "lucide-react";

export default function Admin() {
  const { user, userRole, isLoading, hasAdminAccess, isRootAdmin } = useAdminAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");

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
                <TabsTrigger value="events" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Events
                </TabsTrigger>
                <TabsTrigger value="restaurants" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Restaurants
                </TabsTrigger>
                <TabsTrigger value="attractions" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Attractions
                </TabsTrigger>
                <TabsTrigger value="playgrounds" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Playgrounds
                </TabsTrigger>
                <TabsTrigger value="restaurant-openings" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
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
              <TabsContent value="events">
                <Card>
                  <CardHeader>
                    <CardTitle>Events Management</CardTitle>
                    <CardDescription>Manage all events in the system</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">Event management interface coming soon.</p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="restaurants">
                <Card>
                  <CardHeader>
                    <CardTitle>Restaurant Management</CardTitle>
                    <CardDescription>Manage restaurant listings</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">Restaurant management interface coming soon.</p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="attractions">
                <Card>
                  <CardHeader>
                    <CardTitle>Attractions Management</CardTitle>
                    <CardDescription>Manage attraction listings</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">Attractions management interface coming soon.</p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="playgrounds">
                <Card>
                  <CardHeader>
                    <CardTitle>Playgrounds Management</CardTitle>
                    <CardDescription>Manage playground listings</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">Playgrounds management interface coming soon.</p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="restaurant-openings">
                <Card>
                  <CardHeader>
                    <CardTitle>Restaurant Openings Management</CardTitle>
                    <CardDescription>Manage restaurant opening announcements</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">Restaurant openings management interface coming soon.</p>
                  </CardContent>
                </Card>
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
    </div>
  );
}
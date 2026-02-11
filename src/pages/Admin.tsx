import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import AdminNav from "@/components/admin/AdminNav";
import QuickCreatePanel from "@/components/admin/QuickCreatePanel";
import ContentEditDialog from "@/components/ContentEditDialog";
import { useState } from "react";
import {
  Shield,
  Users,
  Settings,
  Crown,
  FileText,
  Bot,
  Wrench,
  TrendingUp,
  Server,
} from "lucide-react";
import { useEvents } from "@/hooks/useEvents";
import { useRestaurants } from "@/hooks/useRestaurants";
import { useAttractions } from "@/hooks/useAttractions";
import { usePlaygrounds } from "@/hooks/usePlaygrounds";
import { ContentItem, ContentType } from "@/lib/types";
import { toast } from "sonner";
import { useClearEventCache } from "@/hooks/useClearEventCache";

export default function Admin() {
  const { user, userRole, isLoading, hasAdminAccess, isRootAdmin } =
    useAdminAuth();
  const { clearEventCache } = useClearEventCache();
  useDocumentTitle("Admin Dashboard");

  // Edit dialog state for QuickCreatePanel
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    contentType: ContentType | null;
    item: ContentItem | null;
  }>({
    open: false,
    contentType: null,
    item: null,
  });

  // Data hooks for counts on overview
  const events = useEvents();
  const restaurants = useRestaurants();
  const attractions = useAttractions();
  const playgrounds = usePlaygrounds();

  const getRoleIcon = () => {
    if (isRootAdmin) return <Crown className="h-5 w-5" />;
    if (userRole === "admin") return <Shield className="h-5 w-5" />;
    return <Users className="h-5 w-5" />;
  };

  const canManageContent = () =>
    ["moderator", "admin", "root_admin"].includes(userRole);
  const canManageUsers = () => ["admin", "root_admin"].includes(userRole);

  const handleQuickCreate = (templateId: string, contentType: 'event' | 'article') => {
    import('@/lib/contentTemplates').then(({ getTemplateById }) => {
      const template = getTemplateById(templateId);
      if (!template) return;

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
    });
  };

  const handleSave = async () => {
    // Simple refetch after save
    try {
      await events.refetch();
    } catch (error) {
      console.error("Error during save:", error);
    }
  };

  const QUICK_LINKS = [
    { label: "Content Management", href: "/admin/content", icon: FileText, description: "Events, restaurants, attractions, articles" },
    { label: "AI Tools", href: "/admin/ai", icon: Bot, description: "AI crawler, enhancement, scraping" },
    { label: "Site Tools", href: "/admin/tools", icon: Wrench, description: "SEO, social media, coordinates" },
    { label: "Analytics", href: "/admin/analytics-dashboard", icon: TrendingUp, description: "Dashboard, activity logs, data quality" },
    { label: "Security", href: "/admin/security", icon: Shield, description: "Security manager" },
    { label: "System", href: "/admin/system", icon: Server, description: "Users, system controls, settings" },
  ];

  return (
    <>
      <div className="min-h-screen bg-background">
        <AdminNav />
        <div className="p-4 md:p-6">
          {/* Overview Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
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
                  {isRootAdmin && "Full system access"}
                  {userRole === "admin" && !isRootAdmin && "Administrative access"}
                  {userRole === "moderator" && "Content management access"}
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
                    <div className="text-green-600">Manage content</div>
                  )}
                  {canManageUsers() && (
                    <div className="text-green-600">Manage users</div>
                  )}
                  {!canManageUsers() && (
                    <div className="text-muted-foreground">
                      No user management
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
                    <Link to="/admin/content">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start touch-target"
                      >
                        Manage Events
                      </Button>
                    </Link>
                  )}
                  {canManageUsers() && (
                    <Link to="/admin/system">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start touch-target"
                      >
                        Manage Users
                      </Button>
                    </Link>
                  )}

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

          {/* Content Counts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold">{events.events.length}</div>
                <div className="text-sm text-muted-foreground">Events</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold">{restaurants.restaurants.length}</div>
                <div className="text-sm text-muted-foreground">Restaurants</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold">{attractions.attractions.length}</div>
                <div className="text-sm text-muted-foreground">Attractions</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold">{playgrounds.playgrounds.length}</div>
                <div className="text-sm text-muted-foreground">Playgrounds</div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Navigation Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
            {QUICK_LINKS.map((link) => {
              const Icon = link.icon;
              return (
                <Link key={link.href} to={link.href}>
                  <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Icon className="h-5 w-5 text-primary" />
                        {link.label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">{link.description}</p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>

          {/* Quick Create Panel */}
          {canManageContent() && (
            <div className="mt-6">
              <QuickCreatePanel onCreateFromTemplate={handleQuickCreate} />
            </div>
          )}
        </div>
      </div>

      {/* Content Edit Dialog (for QuickCreatePanel) */}
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

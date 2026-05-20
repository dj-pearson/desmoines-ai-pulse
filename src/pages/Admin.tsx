import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { createLogger } from '@/lib/logger';

const log = createLogger('Admin');
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
import { AdminKpiStrip } from "@/components/admin/AdminKpiStrip";
import { AdminActivityFeed } from "@/components/admin/AdminActivityFeed";
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
import { useAdminHomeStats } from "@/hooks/useAdminHomeStats";
import { ContentItem, ContentType } from "@/lib/types";
import { toast } from "sonner";
import { useClearEventCache } from "@/hooks/useClearEventCache";

export default function Admin() {
  const { userRole, isRootAdmin } = useAdminAuth();
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

  // Data: counts/deltas/activity come from the admin-home-stats edge fn;
  // useEvents() is still loaded so QuickCreatePanel can refetch after a save.
  const events = useEvents();
  const homeStats = useAdminHomeStats();

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
      log.error('handleSave', 'Error during save', { error });
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
        <div className="p-4 md:p-6 space-y-6">
          {/* KPI strip (story ADMIN-HOME-001) */}
          <AdminKpiStrip
            tiles={homeStats.data?.kpis}
            isLoading={homeStats.isLoading}
          />

          {/* Recent activity + role/permissions side-by-side on lg, stacked below */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            <div className="lg:col-span-2">
              <AdminActivityFeed
                entries={homeStats.data?.activity}
                isLoading={homeStats.isLoading}
              />
            </div>
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Shield className="h-4 w-4" />
                    Your role
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Current access level
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-xl font-bold flex items-center gap-2">
                    {getRoleIcon()}
                    <span className="break-words">
                      {userRole.replace("_", " ")}
                    </span>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground space-y-1">
                    {canManageContent() && (
                      <div className="text-green-600 dark:text-green-500">
                        ✓ Manage content
                      </div>
                    )}
                    {canManageUsers() && (
                      <div className="text-green-600 dark:text-green-500">
                        ✓ Manage users
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Settings className="h-4 w-4" />
                    Quick actions
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {canManageContent() && (
                    <Link to="/admin/content">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                      >
                        Manage events
                      </Button>
                    </Link>
                  )}
                  {canManageUsers() && (
                    <Link to="/admin/system">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                      >
                        Manage users
                      </Button>
                    </Link>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      clearEventCache();
                      toast.success(
                        "Event cache cleared! Refresh the page to see fresh data."
                      );
                    }}
                    className="w-full justify-start text-muted-foreground"
                  >
                    Clear event cache (debug)
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Quick Navigation Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
            <div>
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

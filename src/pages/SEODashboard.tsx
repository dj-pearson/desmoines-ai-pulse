import { useAdminAuth } from "@/hooks/useAdminAuth";
import AdminNav from "@/components/admin/AdminNav";
import { SEOManager } from "@/components/admin/SEOManager";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield } from "lucide-react";

export default function SEODashboard() {
  const { isLoading, hasAdminAccess } = useAdminAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <AdminNav />
        <div className="p-6 text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!hasAdminAccess) {
    return (
      <div className="min-h-screen bg-background">
        <AdminNav />
        <div className="p-4 md:p-6">
          <Alert variant="destructive">
            <Shield className="h-4 w-4" />
            <AlertDescription>
              Access denied. You need admin privileges to access SEO management tools.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <SEOManager />
      </div>
    </div>
  );
}

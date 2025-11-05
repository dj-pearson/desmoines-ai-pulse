import { useAdminAuth } from "@/hooks/useAdminAuth";
import { SEOManager } from "@/components/admin/SEOManager";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield } from "lucide-react";

export default function SEODashboard() {
  const { user, userRole, isLoading, hasAdminAccess } = useAdminAuth();

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <p>Loading...</p>
      </div>
    );
  }

  if (!hasAdminAccess) {
    return (
      <div className="container mx-auto py-8">
        <Alert variant="destructive">
          <Shield className="h-4 w-4" />
          <AlertDescription>
            Access denied. You need admin privileges to access SEO management tools.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <SEOManager />
    </div>
  );
}

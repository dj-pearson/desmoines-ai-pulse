import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import AdminNav from "@/components/admin/AdminNav";
import AdminSecurityManager from "@/components/AdminSecurityManager";

export default function AdminSecurity() {
  const { userRole } = useAdminAuth();
  useDocumentTitle("Security Settings");

  const canManageUsers = () => ["admin", "root_admin"].includes(userRole);

  if (!canManageUsers()) {
    return (
      <div className="min-h-screen bg-background">
        <AdminNav />
        <div className="p-6 text-center text-muted-foreground">
          You do not have permission to access security settings.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <AdminSecurityManager />
      </div>
    </div>
  );
}

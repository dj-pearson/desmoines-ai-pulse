import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import AdminNav from "@/components/admin/AdminNav";
import { RestaurantMenuManager } from "@/components/admin/RestaurantMenuManager";
import { UtensilsCrossed } from "lucide-react";

export default function AdminMenus() {
  useAdminAuth();
  useDocumentTitle("Menu Management");

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="flex items-center gap-3 mb-6">
          <UtensilsCrossed className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Menu Management</h1>
            <p className="text-sm text-muted-foreground">
              Scrape, upload, and manage restaurant menus
            </p>
          </div>
        </div>
        <RestaurantMenuManager />
      </div>
    </div>
  );
}

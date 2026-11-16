import AdminNav from "@/components/admin/AdminNav";
import { VenuePageManager } from "@/components/admin/VenuePageManager";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminVenuePages() {
  useDocumentTitle("Venue pages · Admin");
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <VenuePageManager />
      </div>
    </div>
  );
}

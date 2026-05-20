import AdminNav from "@/components/admin/AdminNav";
import PartnershipsManager from "@/components/admin/PartnershipsManager";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminPartnerships() {
  useDocumentTitle("Partnerships · Admin");
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <PartnershipsManager />
      </div>
    </div>
  );
}

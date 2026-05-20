import AdminNav from "@/components/admin/AdminNav";
import DealManager from "@/components/admin/DealManager";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminDeals() {
  useDocumentTitle("Deals · Admin");
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <DealManager />
      </div>
    </div>
  );
}

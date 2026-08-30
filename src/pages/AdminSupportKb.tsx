import AdminNav from "@/components/admin/AdminNav";
import SupportKbManager from "@/components/admin/SupportKbManager";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminSupportKb() {
  useDocumentTitle("Support KB · Admin");
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <SupportKbManager />
      </div>
    </div>
  );
}

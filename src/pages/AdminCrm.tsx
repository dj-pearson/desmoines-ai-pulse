import AdminNav from "@/components/admin/AdminNav";
import CrmBoard from "@/components/admin/CrmBoard";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminCrm() {
  useDocumentTitle("CRM · Admin");
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <CrmBoard />
      </div>
    </div>
  );
}

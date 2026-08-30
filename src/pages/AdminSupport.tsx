import AdminNav from "@/components/admin/AdminNav";
import SupportConsole from "@/components/admin/SupportConsole";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminSupport() {
  useDocumentTitle("Support console · Admin");
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <SupportConsole />
      </div>
    </div>
  );
}

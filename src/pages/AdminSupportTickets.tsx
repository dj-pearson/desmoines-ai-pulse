import AdminNav from "@/components/admin/AdminNav";
import SupportTicketsConsole from "@/components/admin/SupportTicketsConsole";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminSupportTickets() {
  useDocumentTitle("Support tickets · Admin");
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <SupportTicketsConsole />
      </div>
    </div>
  );
}

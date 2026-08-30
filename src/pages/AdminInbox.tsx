import AdminNav from "@/components/admin/AdminNav";
import AgentInbox from "@/components/admin/AgentInbox";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminInbox() {
  useDocumentTitle("Escalation inbox · Admin");
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <AgentInbox />
      </div>
    </div>
  );
}

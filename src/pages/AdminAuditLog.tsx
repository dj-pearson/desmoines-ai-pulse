import AdminNav from "@/components/admin/AdminNav";
import AgentAuditLog from "@/components/admin/AgentAuditLog";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminAuditLog() {
  useDocumentTitle("Agent audit · Admin");
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <AgentAuditLog />
      </div>
    </div>
  );
}

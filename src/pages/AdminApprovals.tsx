import AdminNav from "@/components/admin/AdminNav";
import AgentApprovals from "@/components/admin/AgentApprovals";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminApprovals() {
  useDocumentTitle("Action approvals · Admin");
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <AgentApprovals />
      </div>
    </div>
  );
}

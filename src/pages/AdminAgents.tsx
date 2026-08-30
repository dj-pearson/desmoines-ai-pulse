import AdminNav from "@/components/admin/AdminNav";
import AgentControlPlane from "@/components/admin/AgentControlPlane";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminAgents() {
  useDocumentTitle("Agents · Admin");
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <AgentControlPlane />
      </div>
    </div>
  );
}

import AdminNav from "@/components/admin/AdminNav";
import { TrailManager } from "@/components/admin/TrailManager";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminTrails() {
  useDocumentTitle("Trails · Admin");
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <TrailManager />
      </div>
    </div>
  );
}

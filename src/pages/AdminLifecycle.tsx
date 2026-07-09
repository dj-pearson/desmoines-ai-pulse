import AdminNav from "@/components/admin/AdminNav";
import LifecyclePanel from "@/components/admin/LifecyclePanel";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminLifecycle() {
  useDocumentTitle("Lifecycle · Admin");
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <LifecyclePanel />
      </div>
    </div>
  );
}

import AdminNav from "@/components/admin/AdminNav";
import AttractionManager from "@/components/admin/AttractionManager";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminAttractions() {
  useDocumentTitle("Attractions · Admin");
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <AttractionManager />
      </div>
    </div>
  );
}

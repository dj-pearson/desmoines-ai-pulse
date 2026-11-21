import AdminNav from "@/components/admin/AdminNav";
import { SeasonalGuideManager } from "@/components/admin/SeasonalGuideManager";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminGuides() {
  useDocumentTitle("Seasonal guides · Admin");
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <SeasonalGuideManager />
      </div>
    </div>
  );
}

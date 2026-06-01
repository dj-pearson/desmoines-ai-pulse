import AdminNav from "@/components/admin/AdminNav";
import TrendingTuner from "@/components/admin/TrendingTuner";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminTrending() {
  useDocumentTitle("Trending tuner · Admin");
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <TrendingTuner />
      </div>
    </div>
  );
}

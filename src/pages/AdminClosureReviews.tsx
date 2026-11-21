import AdminNav from "@/components/admin/AdminNav";
import { ClosureReviewQueue } from "@/components/admin/ClosureReviewQueue";
import { RestaurantVerificationHealthPanel } from "@/components/admin/RestaurantVerificationHealthPanel";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminClosureReviews() {
  useDocumentTitle("Closure reviews · Admin");
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="space-y-6 p-4 md:p-6">
        <RestaurantVerificationHealthPanel />
        <ClosureReviewQueue />
      </div>
    </div>
  );
}

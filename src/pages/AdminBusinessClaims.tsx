import AdminNav from "@/components/admin/AdminNav";
import BusinessClaimsManager from "@/components/admin/BusinessClaimsManager";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminBusinessClaims() {
  useDocumentTitle("Business claims · Admin");
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <BusinessClaimsManager />
      </div>
    </div>
  );
}

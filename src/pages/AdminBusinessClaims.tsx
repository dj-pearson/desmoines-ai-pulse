import AdminNav from "@/components/admin/AdminNav";
import BusinessClaimsManager from "@/components/admin/BusinessClaimsManager";
import { UnclaimedListingsPanel } from "@/components/admin/UnclaimedListingsPanel";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminBusinessClaims() {
  useDocumentTitle("Business claims · Admin");
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="space-y-6 p-4 md:p-6">
        <BusinessClaimsManager />
        <UnclaimedListingsPanel />
      </div>
    </div>
  );
}

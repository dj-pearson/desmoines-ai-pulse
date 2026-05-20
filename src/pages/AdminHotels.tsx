import AdminNav from "@/components/admin/AdminNav";
import HotelManager from "@/components/admin/HotelManager";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminHotels() {
  useDocumentTitle("Hotels · Admin");
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <HotelManager />
      </div>
    </div>
  );
}

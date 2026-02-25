import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import AdminNav from "@/components/admin/AdminNav";
import MediaLibrary from "@/components/admin/MediaLibrary";

export default function AdminMedia() {
  useAdminAuth();
  useDocumentTitle("Media Library - Admin");

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <MediaLibrary />
      </div>
    </div>
  );
}

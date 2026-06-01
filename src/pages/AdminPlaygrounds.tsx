import AdminNav from "@/components/admin/AdminNav";
import PlaygroundManager from "@/components/admin/PlaygroundManager";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminPlaygrounds() {
  useDocumentTitle("Playgrounds · Admin");
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <PlaygroundManager />
      </div>
    </div>
  );
}

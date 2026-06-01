import AdminNav from "@/components/admin/AdminNav";
import EventSubmissionsManager from "@/components/admin/EventSubmissionsManager";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminEventSubmissions() {
  useDocumentTitle("Event submissions · Admin");
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <EventSubmissionsManager />
      </div>
    </div>
  );
}

import AdminNav from "@/components/admin/AdminNav";
import FeedbackInbox from "@/components/admin/FeedbackInbox";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminFeedback() {
  useDocumentTitle("Feedback · Admin");
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <FeedbackInbox />
      </div>
    </div>
  );
}

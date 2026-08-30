import { useTabState } from "@/hooks/useTabState";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import AdminNav from "@/components/admin/AdminNav";
import MediaLibrary from "@/components/admin/MediaLibrary";
import ImageBackfill from "@/components/admin/ImageBackfill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminMedia() {
  useAdminAuth();
  useDocumentTitle("Media Library - Admin");
  const [activeTab, setActiveTab] = useTabState("library", {
    validTabs: ["library", "backfill"],
  });

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="library">Media Library</TabsTrigger>
            <TabsTrigger value="backfill">Backfill Images</TabsTrigger>
          </TabsList>
          <TabsContent value="library" className="mt-4">
            <MediaLibrary />
          </TabsContent>
          <TabsContent value="backfill" className="mt-4">
            <ImageBackfill />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

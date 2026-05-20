import AdminNav from "@/components/admin/AdminNav";
import NewsletterCampaignsManager from "@/components/admin/NewsletterCampaignsManager";
import NewsletterSubscribersManager from "@/components/admin/NewsletterSubscribersManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminEmail() {
  useDocumentTitle("Email · Admin");
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <Tabs defaultValue="subscribers" className="w-full">
          <TabsList>
            <TabsTrigger value="subscribers">Subscribers</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          </TabsList>
          <TabsContent value="subscribers" className="mt-4">
            <NewsletterSubscribersManager />
          </TabsContent>
          <TabsContent value="campaigns" className="mt-4">
            <NewsletterCampaignsManager />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

import AdminNav from "@/components/admin/AdminNav";
import NewsletterCampaignsManager from "@/components/admin/NewsletterCampaignsManager";
import NewsletterSubscribersManager from "@/components/admin/NewsletterSubscribersManager";
import WeeklyDigestControls from "@/components/admin/WeeklyDigestControls";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useTabState } from "@/hooks/useTabState";

export default function AdminEmail() {
  useDocumentTitle("Email · Admin");
  const [activeTab, setActiveTab] = useTabState("subscribers", {
    validTabs: ["subscribers", "campaigns"],
  });
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            <TabsTrigger value="subscribers">Subscribers</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          </TabsList>
          <TabsContent value="subscribers" className="mt-4">
            <NewsletterSubscribersManager />
          </TabsContent>
          <TabsContent value="campaigns" className="mt-4 space-y-4">
            <WeeklyDigestControls />
            <NewsletterCampaignsManager />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

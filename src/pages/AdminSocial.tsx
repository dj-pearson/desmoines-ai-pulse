import AdminNav from "@/components/admin/AdminNav";
import SocialAccountsManager from "@/components/admin/SocialAccountsManager";
import SocialPostQueue from "@/components/admin/SocialPostQueue";
import SocialPosterSettings from "@/components/admin/SocialPosterSettings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useTabState } from "@/hooks/useTabState";

export default function AdminSocial() {
  useDocumentTitle("Social · Admin");
  const [activeTab, setActiveTab] = useTabState("accounts", {
    validTabs: ["accounts", "queue", "automation"],
  });
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="queue">Post queue</TabsTrigger>
            <TabsTrigger value="automation">Automation</TabsTrigger>
          </TabsList>
          <TabsContent value="accounts" className="mt-4">
            <SocialAccountsManager />
          </TabsContent>
          <TabsContent value="queue" className="mt-4">
            <SocialPostQueue />
          </TabsContent>
          <TabsContent value="automation" className="mt-4">
            <SocialPosterSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

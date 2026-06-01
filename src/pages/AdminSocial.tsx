import AdminNav from "@/components/admin/AdminNav";
import SocialAccountsManager from "@/components/admin/SocialAccountsManager";
import SocialPostQueue from "@/components/admin/SocialPostQueue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminSocial() {
  useDocumentTitle("Social · Admin");
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <Tabs defaultValue="accounts" className="w-full">
          <TabsList>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="queue">Post queue</TabsTrigger>
          </TabsList>
          <TabsContent value="accounts" className="mt-4">
            <SocialAccountsManager />
          </TabsContent>
          <TabsContent value="queue" className="mt-4">
            <SocialPostQueue />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

import { Construction } from "lucide-react";
import AdminNav from "@/components/admin/AdminNav";
import SocialAccountsManager from "@/components/admin/SocialAccountsManager";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
            <Card className="max-w-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Construction className="h-4 w-4 text-amber-600" />
                  Post queue
                </CardTitle>
                <CardDescription>
                  Tracked by story{" "}
                  <code className="font-mono text-xs">ADMIN-SOCIAL-002</code>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Scheduled, sent, and failed social posts with retry,
                  reschedule, and realtime updates. Lands in the next story.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

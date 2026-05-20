import { Construction } from "lucide-react";
import AdminNav from "@/components/admin/AdminNav";
import NewsletterSubscribersManager from "@/components/admin/NewsletterSubscribersManager";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
            <Card className="max-w-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Construction className="h-4 w-4 text-amber-600" />
                  Campaign composer
                </CardTitle>
                <CardDescription>
                  Tracked by story{" "}
                  <code className="font-mono text-xs">ADMIN-EMAIL-002</code>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Compose, preview, segment, and schedule a one-off
                  newsletter via Resend. Lands in the next story.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

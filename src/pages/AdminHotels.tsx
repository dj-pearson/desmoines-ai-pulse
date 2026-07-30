import AdminNav from "@/components/admin/AdminNav";
import HotelManager from "@/components/admin/HotelManager";
import HotelAffiliateProgramsManager from "@/components/admin/HotelAffiliateProgramsManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function AdminHotels() {
  useDocumentTitle("Hotels · Admin");
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        <Tabs defaultValue="hotels">
          <TabsList className="mb-4">
            <TabsTrigger value="hotels">Hotels</TabsTrigger>
            <TabsTrigger value="affiliates">Affiliate Programs</TabsTrigger>
          </TabsList>
          <TabsContent value="hotels">
            <HotelManager />
          </TabsContent>
          <TabsContent value="affiliates">
            <HotelAffiliateProgramsManager />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

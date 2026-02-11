import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { ArrowLeft, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { CreativeUploadForm } from "@/components/advertising/CreativeUploadForm";
import { PlacementType } from "@/components/advertising/CreativeUploader";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Campaign {
  id: string;
  name: string;
  status: string;
  campaign_placements: Array<{
    placement_type: PlacementType;
  }>;
}

export default function UploadCreatives() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  useDocumentTitle("Upload Creatives");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<PlacementType | null>(null);

  useEffect(() => {
    if (campaignId) {
      fetchCampaign();
    }
  }, [campaignId]);

  const fetchCampaign = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('campaigns')
        .select(`
          *,
          campaign_placements (placement_type)
        `)
        .eq('id', campaignId)
        .single();

      if (error) throw error;

      if (!data) {
        toast({
          variant: "destructive",
          title: "Campaign not found",
          description: "The campaign you're looking for doesn't exist.",
        });
        navigate('/campaigns');
        return;
      }

      setCampaign(data as Campaign);

      // Set active tab to first placement
      if (data.campaign_placements && data.campaign_placements.length > 0) {
        setActiveTab(data.campaign_placements[0].placement_type);
      }
    } catch (error) {
      console.error('Error fetching campaign:', error);
      toast({
        variant: "destructive",
        title: "Error loading campaign",
        description: "Failed to load campaign details. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadSuccess = () => {
    toast({
      title: "Creative uploaded!",
      description: "Your creative has been submitted for review.",
    });
    navigate(`/campaigns/${campaignId}`);
  };

  const getPlacementLabel = (type: PlacementType): string => {
    const labels: Record<PlacementType, string> = {
      top_banner: "Top Banner",
      featured_spot: "Featured Spot",
      below_fold: "Below the Fold",
    };
    return labels[type];
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <Alert variant="destructive">
          <AlertDescription>
            Campaign not found or you don't have permission to access it.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const placements = campaign.campaign_placements || [];

  if (placements.length === 0) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <Alert>
          <AlertDescription>
            This campaign has no placements configured. Please contact support.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <Button
          variant="ghost"
          onClick={() => navigate(`/campaigns/${campaignId}`)}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Campaign
        </Button>

        <div className="flex items-start gap-4">
          <div className="bg-primary/10 p-3 rounded-lg">
            <Upload className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold mb-2">Upload Ad Creatives</h1>
            <p className="text-lg text-muted-foreground">
              Campaign: <span className="font-semibold text-foreground">{campaign.name}</span>
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Upload creative assets for each placement type in your campaign
            </p>
          </div>
        </div>
      </div>

      {/* Status Banner */}
      {campaign.status === 'pending_payment' && (
        <Alert className="mb-6">
          <AlertDescription>
            <strong>Payment received!</strong> You can now upload your ad creatives. They will be reviewed before going live.
          </AlertDescription>
        </Alert>
      )}

      {/* Placement Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>Select Placement Type</CardTitle>
          <CardDescription>
            Upload creatives for each placement in your campaign
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab || undefined} onValueChange={(value) => setActiveTab(value as PlacementType)}>
            <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${placements.length}, 1fr)` }}>
              {placements.map((placement) => (
                <TabsTrigger key={placement.placement_type} value={placement.placement_type}>
                  {getPlacementLabel(placement.placement_type)}
                </TabsTrigger>
              ))}
            </TabsList>

            {placements.map((placement) => (
              <TabsContent key={placement.placement_type} value={placement.placement_type} className="mt-6">
                <CreativeUploadForm
                  campaignId={campaignId!}
                  placementType={placement.placement_type}
                  onSuccess={handleUploadSuccess}
                />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Help Section */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Need Help?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <h4 className="font-semibold mb-1">Creative Best Practices</h4>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>Use high-quality, professional images</li>
              <li>Keep text minimal and easy to read</li>
              <li>Ensure your logo and important elements are in the safe zone</li>
              <li>Use contrasting colors for better visibility</li>
              <li>Test your destination URL before submitting</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-1">Review Process</h4>
            <p className="text-sm text-muted-foreground">
              Our team reviews all ad creatives within 1-2 business days to ensure they meet our{" "}
              <a href="/advertising-policies" className="text-primary hover:underline">
                advertising policies
              </a>
              . You'll receive an email notification once your creative is approved or if changes are needed.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

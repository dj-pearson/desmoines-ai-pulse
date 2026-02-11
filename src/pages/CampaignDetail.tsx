import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Calendar, DollarSign, Eye, Upload, BarChart3, ArrowLeft, AlertCircle } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PLACEMENT_SPECS } from "@/lib/placementSpecs";
import type { PlacementType } from "@/lib/placementSpecs";

const STATUS_COLORS = {
  draft: "secondary",
  pending_payment: "destructive",
  pending_creative: "outline",
  active: "default",
  completed: "secondary",
  cancelled: "destructive",
} as const;

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_payment: "Pending Payment",
  pending_creative: "Pending Creative",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function CampaignDetail() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { campaigns, isLoading } = useCampaigns();

  useEffect(() => {
    if (!user) {
      navigate("/auth?redirect=/campaigns");
    }
  }, [user, navigate]);

  if (!user) return null;

  const campaign = campaigns.find(c => c.id === campaignId);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-48 bg-muted rounded"></div>
          <div className="h-48 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="text-center py-12">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Campaign Not Found</h2>
            <p className="text-muted-foreground mb-6">
              This campaign doesn't exist or you don't have permission to view it.
            </p>
            <Button onClick={() => navigate("/campaigns")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Campaigns
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusLabel = STATUS_LABELS[campaign.status] || campaign.status;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Breadcrumbs
        className="mb-4"
        items={[
          { label: "Home", href: "/" },
          { label: "Campaigns", href: "/campaigns" },
          { label: campaign.name },
        ]}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl sm:text-3xl font-bold">{campaign.name}</h1>
            <Badge variant={STATUS_COLORS[campaign.status as keyof typeof STATUS_COLORS]}>
              {statusLabel}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            Created {format(new Date(campaign.created_at), "MMMM d, yyyy")}
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/campaigns")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          All Campaigns
        </Button>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <DollarSign className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-2xl font-bold">${campaign.total_cost || 0}</p>
            <p className="text-xs text-muted-foreground">Total Cost</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <Eye className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-2xl font-bold">{campaign.campaign_placements?.length || 0}</p>
            <p className="text-xs text-muted-foreground">Placements</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <Upload className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-2xl font-bold">{campaign.campaign_creatives?.length || 0}</p>
            <p className="text-xs text-muted-foreground">Creatives</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <Calendar className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-2xl font-bold">
              {campaign.start_date && campaign.end_date
                ? Math.ceil((new Date(campaign.end_date).getTime() - new Date(campaign.start_date).getTime()) / (1000 * 60 * 60 * 24))
                : 0}
            </p>
            <p className="text-xs text-muted-foreground">Days</p>
          </CardContent>
        </Card>
      </div>

      {/* Status-based Actions */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Next Steps</CardTitle>
          <CardDescription>Actions available for this campaign</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {campaign.status === 'draft' && (
              <Button onClick={() => navigate("/advertise")}>
                Complete Setup
              </Button>
            )}
            {campaign.status === 'pending_creative' && (
              <Button onClick={() => navigate(`/campaigns/${campaign.id}/creatives`)}>
                <Upload className="h-4 w-4 mr-2" />
                Upload Creatives
              </Button>
            )}
            {campaign.status === 'active' && (
              <Button onClick={() => navigate(`/campaigns/${campaign.id}/analytics`)}>
                <BarChart3 className="h-4 w-4 mr-2" />
                View Analytics
              </Button>
            )}
            {campaign.status === 'completed' && (
              <Button onClick={() => navigate(`/campaigns/${campaign.id}/analytics`)}>
                <BarChart3 className="h-4 w-4 mr-2" />
                View Analytics
              </Button>
            )}
            {(campaign.status === 'draft' || campaign.status === 'pending_creative') && (
              <Button variant="outline" onClick={() => navigate(`/campaigns/${campaign.id}/creatives`)}>
                <Upload className="h-4 w-4 mr-2" />
                Manage Creatives
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Campaign Dates */}
      {campaign.start_date && campaign.end_date && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Start Date</p>
                <p className="text-lg font-medium">
                  {format(new Date(campaign.start_date), "MMMM d, yyyy")}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">End Date</p>
                <p className="text-lg font-medium">
                  {format(new Date(campaign.end_date), "MMMM d, yyyy")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Placements */}
      {campaign.campaign_placements && campaign.campaign_placements.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Placements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {campaign.campaign_placements.map(placement => {
                const spec = PLACEMENT_SPECS[placement.placement_type as PlacementType];
                return (
                  <div key={placement.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">{spec?.name || placement.placement_type}</p>
                      <p className="text-sm text-muted-foreground">
                        {placement.days_count} days at ${placement.daily_cost}/day
                      </p>
                    </div>
                    <p className="text-lg font-semibold">${placement.total_cost}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Creatives */}
      {campaign.campaign_creatives && campaign.campaign_creatives.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Creative Assets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {campaign.campaign_creatives.map(creative => (
                <div key={creative.id} className="flex items-start gap-4 p-4 border rounded-lg">
                  {creative.image_url && (
                    <img
                      src={creative.image_url}
                      alt={creative.title || "Creative"}
                      className="w-24 h-16 object-cover rounded border"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{creative.title || "Untitled"}</p>
                      <Badge variant={creative.is_approved ? "default" : "outline"}>
                        {creative.is_approved ? "Approved" : "Pending Review"}
                      </Badge>
                    </div>
                    {creative.dimensions_width && creative.dimensions_height && (
                      <p className="text-sm text-muted-foreground">
                        {creative.dimensions_width}x{creative.dimensions_height}
                        {creative.file_size ? ` - ${(creative.file_size / 1024).toFixed(0)}KB` : ''}
                      </p>
                    )}
                    {creative.rejection_reason && (
                      <p className="text-sm text-destructive mt-1">
                        Rejected: {creative.rejection_reason}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Eye, DollarSign, Plus, Upload, BarChart3, Pause, Play, X, Receipt, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

const STATUS_COLORS = {
  draft: "secondary",
  pending_payment: "destructive",
  pending_creative: "outline",
  pending_review: "outline",
  active: "default",
  paused: "outline",
  completed: "secondary",
  cancelled: "destructive",
  rejected: "destructive",
  refunded: "secondary",
} as const;

export default function CampaignDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { campaigns, isLoading, cancelCampaign, setCampaignPaused, renewCampaign, requestRefund } =
    useCampaigns();
  // One id at a time, so a slow request disables only the row it belongs to.
  const [pendingId, setPendingId] = useState<string | null>(null);

  /**
   * WEB-ADS-011 AC2. Every one of these is a server call that can refuse - the
   * status rules live in the functions, not here - so the failure has to reach
   * the advertiser. The version that swallows it leaves them pressing a button
   * that appears to do nothing.
   */
  const run = async (campaignId: string, action: () => Promise<unknown>, success: string) => {
    setPendingId(campaignId);
    try {
      await action();
      toast.success(success);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That did not work. Please try again.");
    } finally {
      setPendingId(null);
    }
  };
  useDocumentTitle("Campaign Dashboard");

  useEffect(() => {
    if (!user) {
      navigate("/auth?redirect=/campaigns");
    }
  }, [user, navigate]);

  if (!user) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading campaigns...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Campaign Dashboard</h1>
          <p className="text-muted-foreground">
            Manage your advertising campaigns and creative assets
          </p>
        </div>
        <Button onClick={() => navigate("/advertise")}>
          <Plus className="mr-2 h-4 w-4" />
          New Campaign
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <h3 className="text-lg font-semibold mb-4">No campaigns yet</h3>
            <p className="text-muted-foreground mb-6">
              Create your first advertising campaign to reach thousands of Des Moines locals.
            </p>
            <Button onClick={() => navigate("/advertise")}>
              Create Your First Campaign
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {campaigns.map((campaign) => (
            <Card key={campaign.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {campaign.name}
                      <Badge variant={STATUS_COLORS[campaign.status as keyof typeof STATUS_COLORS]}>
                        {campaign.status.replace('_', ' ')}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Created {format(new Date(campaign.created_at), "MMM dd, yyyy")}
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Total Cost</p>
                    <p className="text-lg font-semibold">${campaign.total_cost}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <SpriteIcon name="calendar" className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Duration</p>
                      <p className="text-sm text-muted-foreground">
                        {campaign.start_date && campaign.end_date
                          ? `${format(new Date(campaign.start_date), "MMM dd")} - ${format(new Date(campaign.end_date), "MMM dd")}`
                          : "Dates not set"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Placements</p>
                      <p className="text-sm text-muted-foreground">
                        {campaign.campaign_placements?.length || 0} selected
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Creatives</p>
                      <p className="text-sm text-muted-foreground">
                        {campaign.campaign_creatives?.length || 0} uploaded
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/campaigns/${campaign.id}`)}
                  >
                    View Details
                  </Button>
                  {campaign.status === 'pending_payment' && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => navigate(`/campaigns/${campaign.id}`)}
                    >
                      <DollarSign className="h-3 w-3 mr-1" />
                      Complete Payment
                    </Button>
                  )}
                  {campaign.status === 'pending_creative' && (
                    <Button
                      size="sm"
                      onClick={() => navigate(`/campaigns/${campaign.id}/creatives`)}
                    >
                      <Upload className="h-3 w-3 mr-1" />
                      Upload Creatives
                    </Button>
                  )}
                  {campaign.status === 'pending_review' && (
                    <Badge variant="outline" className="text-xs">
                      Awaiting Admin Review
                    </Badge>
                  )}
                  {campaign.status === 'rejected' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/campaigns/${campaign.id}/creatives`)}
                    >
                      <Upload className="h-3 w-3 mr-1" />
                      Resubmit Creatives
                    </Button>
                  )}
                  {campaign.status === 'draft' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate("/advertise")}
                    >
                      Complete Setup
                    </Button>
                  )}
                  {(campaign.status === 'active' || campaign.status === 'completed') && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/campaigns/${campaign.id}/analytics`)}
                    >
                      <BarChart3 className="h-3 w-3 mr-1" />
                      Analytics
                    </Button>
                  )}

                  {/*
                    WEB-ADS-011 AC2. None of these existed: an advertiser who
                    changed their mind had no button at all, and a refund was
                    admin-only with no way to ask for one.
                  */}
                  {(campaign.status === 'draft' || campaign.status === 'pending_payment') && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pendingId === campaign.id}
                      onClick={() =>
                        run(campaign.id, () => cancelCampaign(campaign.id), "Campaign cancelled")
                      }
                    >
                      <X className="h-3 w-3 mr-1" />
                      Cancel
                    </Button>
                  )}
                  {campaign.status === 'active' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pendingId === campaign.id}
                      onClick={() =>
                        run(
                          campaign.id,
                          () => setCampaignPaused(campaign.id, true),
                          "Paused. The days you have left are held for you.",
                        )
                      }
                    >
                      <Pause className="h-3 w-3 mr-1" />
                      Pause
                    </Button>
                  )}
                  {campaign.status === 'paused' && (
                    <Button
                      size="sm"
                      disabled={pendingId === campaign.id}
                      onClick={() =>
                        run(
                          campaign.id,
                          () => setCampaignPaused(campaign.id, false),
                          "Resumed. Your end date has moved out by the days you had left.",
                        )
                      }
                    >
                      <Play className="h-3 w-3 mr-1" />
                      Resume
                    </Button>
                  )}
                  {/*
                    WEB-ADS-011 AC3. renewal_eligible is set by the lifecycle
                    job seven days before the end and on completion, so this
                    appears while there is still time to renew without a gap -
                    the flag used to be written on completion ONLY, by which
                    point renewing buys one.
                  */}
                  {campaign.renewal_eligible && (
                    <Button
                      size="sm"
                      disabled={pendingId === campaign.id}
                      onClick={() =>
                        run(
                          campaign.id,
                          async () => {
                            const newId = await renewCampaign(campaign.id);
                            if (newId) navigate(`/campaigns/${newId}`);
                          },
                          "Renewed as a draft. Review the dates and pay to start it.",
                        )
                      }
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Renew
                    </Button>
                  )}
                  {/*
                    A REQUEST, not a refund. process-stripe-refund stays
                    admin-only; this opens a ticket somebody has to answer,
                    which is what an advertiser did not have.
                  */}
                  {['pending_creative', 'pending_review', 'active', 'paused', 'completed'].includes(
                    campaign.status,
                  ) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pendingId === campaign.id}
                      onClick={() =>
                        run(
                          campaign.id,
                          () =>
                            requestRefund(
                              campaign.id,
                              "Requested from the campaign dashboard.",
                            ),
                          "Refund requested. We will be in touch.",
                        )
                      }
                    >
                      <Receipt className="h-3 w-3 mr-1" />
                      Request refund
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
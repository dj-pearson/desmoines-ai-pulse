import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAdminCampaigns, CampaignWithUser } from "@/hooks/useAdminCampaigns";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Check, X, DollarSign, Calendar, User, Image as ImageIcon, ExternalLink, AlertCircle } from "lucide-react";
import { CampaignCreative } from "@/hooks/useCampaigns";

export default function AdminCampaignDetail() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const {
    getCampaignById,
    approveCreative,
    rejectCreative,
    updateCampaignStatus,
    createPricingOverride,
  } = useAdminCampaigns();
  useDocumentTitle("Campaign Details");

  const [campaign, setCampaign] = useState<CampaignWithUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCreative, setSelectedCreative] = useState<CampaignCreative | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overridePrice, setOverridePrice] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  useEffect(() => {
    if (campaignId) {
      loadCampaign();
    }
  }, [campaignId]);

  const loadCampaign = async () => {
    if (!campaignId) return;

    setIsLoading(true);
    const data = await getCampaignById(campaignId);
    setCampaign(data);
    setIsLoading(false);
  };

  const handleApproveCreative = async (creative: CampaignCreative) => {
    if (!campaignId) return;

    const success = await approveCreative(creative.id, campaignId);
    if (success) {
      await loadCampaign();
    }
  };

  const handleRejectCreative = async () => {
    if (!selectedCreative || !rejectionReason.trim()) return;

    const success = await rejectCreative(selectedCreative.id, rejectionReason);
    if (success) {
      setRejectDialogOpen(false);
      setRejectionReason("");
      setSelectedCreative(null);
      await loadCampaign();
    }
  };

  const handleApplyPricingOverride = async () => {
    if (!campaignId || !overridePrice || !overrideReason) return;

    const price = parseFloat(overridePrice);
    if (isNaN(price) || price <= 0) {
      return;
    }

    const success = await createPricingOverride(
      campaignId,
      price,
      overrideReason
    );

    if (success) {
      setOverrideDialogOpen(false);
      setOverridePrice("");
      setOverrideReason("");
      await loadCampaign();
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-gray-500",
      pending_payment: "bg-yellow-500",
      pending_creative: "bg-blue-500",
      active: "bg-green-500",
      completed: "bg-gray-400",
      cancelled: "bg-red-500",
      rejected: "bg-red-600",
      refunded: "bg-purple-500",
    };
    return colors[status] || "bg-gray-500";
  };

  const getPendingCreatives = () => {
    return campaign?.campaign_creatives?.filter((c) => !c.is_approved) || [];
  };

  const getApprovedCreatives = () => {
    return campaign?.campaign_creatives?.filter((c) => c.is_approved) || [];
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
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

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate("/admin/campaigns")}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Campaigns
        </Button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">{campaign.name}</h1>
            <p className="text-muted-foreground">
              Campaign ID: {campaign.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
          <Badge className={getStatusColor(campaign.status)}>
            {campaign.status.replace('_', ' ').toUpperCase()}
          </Badge>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4" />
              Advertiser
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold">{campaign.user_name || 'N/A'}</p>
            <p className="text-sm text-muted-foreground">{campaign.user_email}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Campaign Duration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold">
              {campaign.start_date ? formatDate(campaign.start_date) : 'N/A'}
            </p>
            <p className="text-sm text-muted-foreground">
              to {campaign.end_date ? formatDate(campaign.end_date) : 'N/A'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Campaign Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(campaign.total_cost || 0)}
            </p>
            <Button
              variant="link"
              size="sm"
              className="p-0 h-auto"
              onClick={() => setOverrideDialogOpen(true)}
            >
              Apply pricing override
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Placements */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Placements</CardTitle>
          <CardDescription>Selected ad placements for this campaign</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {campaign.campaign_placements?.map((placement) => (
              <div
                key={placement.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div>
                  <p className="font-medium capitalize">
                    {placement.placement_type.replace('_', ' ')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {placement.days_count} days × {formatCurrency(placement.daily_cost)}/day
                  </p>
                </div>
                <p className="font-semibold">{formatCurrency(placement.total_cost)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Creatives Review */}
      <Card>
        <CardHeader>
          <CardTitle>Creative Review</CardTitle>
          <CardDescription>
            Review and approve ad creatives for this campaign
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pending">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="pending">
                Pending Review ({getPendingCreatives().length})
              </TabsTrigger>
              <TabsTrigger value="approved">
                Approved ({getApprovedCreatives().length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="mt-6">
              {getPendingCreatives().length === 0 ? (
                <div className="text-center py-12">
                  <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No pending creatives</h3>
                  <p className="text-muted-foreground">
                    All creatives have been reviewed
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {getPendingCreatives().map((creative) => (
                    <Card key={creative.id} className="overflow-hidden">
                      <div className="aspect-video relative bg-muted">
                        {creative.image_url ? (
                          <img
                            src={creative.image_url}
                            alt={creative.title || 'Ad creative'}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <ImageIcon className="h-12 w-12 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <CardContent className="pt-4">
                        <div className="mb-4">
                          <Badge variant="outline" className="mb-2">
                            {creative.placement_type.replace('_', ' ')}
                          </Badge>
                          <h3 className="font-semibold text-lg mb-1">{creative.title}</h3>
                          <p className="text-sm text-muted-foreground mb-2">
                            {creative.description}
                          </p>
                          {creative.link_url && (
                            <a
                              href={creative.link_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                            >
                              {creative.link_url}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          <div className="mt-2 text-xs text-muted-foreground">
                            <p>CTA: "{creative.cta_text}"</p>
                            <p>Size: {creative.dimensions_width}×{creative.dimensions_height}px</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            className="flex-1"
                            onClick={() => handleApproveCreative(creative)}
                          >
                            <Check className="h-4 w-4 mr-2" />
                            Approve
                          </Button>
                          <Button
                            variant="destructive"
                            className="flex-1"
                            onClick={() => {
                              setSelectedCreative(creative);
                              setRejectDialogOpen(true);
                            }}
                          >
                            <X className="h-4 w-4 mr-2" />
                            Reject
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="approved" className="mt-6">
              {getApprovedCreatives().length === 0 ? (
                <div className="text-center py-12">
                  <Check className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No approved creatives yet</h3>
                  <p className="text-muted-foreground">
                    Approved creatives will appear here
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {getApprovedCreatives().map((creative) => (
                    <Card key={creative.id} className="overflow-hidden border-green-200">
                      <div className="aspect-video relative bg-muted">
                        {creative.image_url ? (
                          <img
                            src={creative.image_url}
                            alt={creative.title || 'Ad creative'}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <ImageIcon className="h-12 w-12 text-muted-foreground" />
                          </div>
                        )}
                        <div className="absolute top-2 right-2">
                          <Badge className="bg-green-500">Approved</Badge>
                        </div>
                      </div>
                      <CardContent className="pt-4">
                        <Badge variant="outline" className="mb-2">
                          {creative.placement_type.replace('_', ' ')}
                        </Badge>
                        <h3 className="font-semibold text-lg mb-1">{creative.title}</h3>
                        <p className="text-sm text-muted-foreground">{creative.description}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Creative</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this creative. The advertiser will be notified and can resubmit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="rejection-reason">Rejection Reason</Label>
              <Textarea
                id="rejection-reason"
                placeholder="e.g., Image quality is too low, contains prohibited content, etc."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectCreative}
              disabled={!rejectionReason.trim()}
            >
              Reject Creative
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pricing Override Dialog */}
      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Pricing Override</DialogTitle>
            <DialogDescription>
              Set a custom price for this campaign. Original price: {formatCurrency(campaign.total_cost || 0)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="override-price">New Price</Label>
              <Input
                id="override-price"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={overridePrice}
                onChange={(e) => setOverridePrice(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="override-reason">Reason</Label>
              <Textarea
                id="override-reason"
                placeholder="e.g., Promotional discount, Non-profit rate, etc."
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleApplyPricingOverride}
              disabled={!overridePrice || !overrideReason.trim()}
            >
              Apply Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

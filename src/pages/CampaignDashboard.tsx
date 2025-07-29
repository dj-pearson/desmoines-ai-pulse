import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Eye, Calendar, DollarSign, Plus } from "lucide-react";

const STATUS_COLORS = {
  draft: "secondary",
  pending_payment: "destructive",
  pending_creative: "outline",
  active: "default",
  completed: "secondary",
  cancelled: "destructive",
} as const;

export default function CampaignDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { campaigns, isLoading } = useCampaigns();

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
                    <Calendar className="h-4 w-4 text-muted-foreground" />
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

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/campaigns/${campaign.id}`)}
                  >
                    Manage Campaign
                  </Button>
                  {campaign.status === 'pending_creative' && (
                    <Button
                      size="sm"
                      onClick={() => navigate(`/campaigns/${campaign.id}/creatives`)}
                    >
                      Upload Creatives
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
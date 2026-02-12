import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { createLogger } from "@/lib/logger";

const log = createLogger('AdvertiseSuccess');
import { CheckCircle, Upload, BarChart3, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Campaign {
  id: string;
  name: string;
  total_cost: number;
  start_date: string;
  end_date: string;
  stripe_payment_intent_id: string;
}

export default function AdvertiseSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  useDocumentTitle("Advertising Success");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    if (sessionId) {
      verifyPayment();
    } else {
      setError("No payment session found");
      setIsLoading(false);
    }
  }, [sessionId]);

  const verifyPayment = async () => {
    try {
      setIsLoading(true);

      // Call the verify-campaign-payment function to confirm payment
      const { data, error: verifyError } = await supabase.functions.invoke(
        "verify-campaign-payment",
        {
          body: { sessionId },
        }
      );

      if (verifyError) throw verifyError;

      if (!data || !data.campaign) {
        throw new Error("Payment verification failed");
      }

      setCampaign(data.campaign);

      toast({
        title: "Payment successful!",
        description: "Your campaign is ready for creative uploads.",
      });
    } catch (err) {
      log.error('Payment verification error', { action: 'verifyPayment', metadata: { error: err } });
      setError(err instanceof Error ? err.message : "Failed to verify payment");
      toast({
        variant: "destructive",
        title: "Verification failed",
        description: "We couldn't verify your payment. Please contact support.",
      });
    } finally {
      setIsLoading(false);
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

  if (isLoading) {
    return (
      <div className="container mx-auto py-12 px-4 max-w-3xl">
        <div className="text-center mb-8">
          <Skeleton className="h-12 w-12 rounded-full mx-auto mb-4" />
          <Skeleton className="h-8 w-64 mx-auto mb-2" />
          <Skeleton className="h-4 w-96 mx-auto" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="container mx-auto py-12 px-4 max-w-3xl">
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>
            {error || "Campaign not found. Please contact support if you believe this is an error."}
          </AlertDescription>
        </Alert>
        <div className="text-center">
          <Button onClick={() => navigate('/campaigns')}>
            Go to Campaigns
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-12 px-4 max-w-3xl">
      {/* Success Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        <h1 className="text-3xl font-bold mb-2">Payment Successful!</h1>
        <p className="text-lg text-muted-foreground">
          Your campaign has been created and payment processed
        </p>
      </div>

      {/* Order Details */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Order Confirmation</CardTitle>
          <CardDescription>
            Campaign: <span className="font-semibold text-foreground">{campaign.name}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Order ID</p>
              <p className="font-mono text-sm">{campaign.id.slice(0, 8).toUpperCase()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Amount Paid</p>
              <p className="font-semibold text-lg">{formatCurrency(campaign.total_cost)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Start Date</p>
              <p className="font-medium">{formatDate(campaign.start_date)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">End Date</p>
              <p className="font-medium">{formatDate(campaign.end_date)}</p>
            </div>
          </div>

          <Alert>
            <AlertDescription>
              A confirmation email has been sent to your registered email address with your receipt and campaign details.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Next Steps */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>What's Next?</CardTitle>
          <CardDescription>Complete these steps to get your campaign live</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-semibold text-primary">1</span>
              </div>
              <div className="flex-grow">
                <h3 className="font-semibold mb-1">Upload Your Ad Creatives</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Upload images and provide details for each placement in your campaign. Make sure
                  your creatives meet our size and format requirements.
                </p>
                <Button
                  onClick={() => navigate(`/campaigns/${campaign.id}/creatives`)}
                  size="sm"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Creatives Now
                </Button>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-semibold text-primary">2</span>
              </div>
              <div className="flex-grow">
                <h3 className="font-semibold mb-1">Wait for Review</h3>
                <p className="text-sm text-muted-foreground">
                  Our team will review your creatives within 1-2 business days to ensure they meet
                  our advertising policies. You'll receive an email notification once approved.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-semibold text-primary">3</span>
              </div>
              <div className="flex-grow">
                <h3 className="font-semibold mb-1">Campaign Goes Live</h3>
                <p className="text-sm text-muted-foreground">
                  Your ads will automatically start displaying on {formatDate(campaign.start_date)}.
                  Track performance in your campaign dashboard.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate(`/campaigns/${campaign.id}/creatives`)}>
          <CardHeader>
            <Upload className="h-8 w-8 text-primary mb-2" />
            <CardTitle className="text-lg">Upload Creatives</CardTitle>
            <CardDescription>Add your ad images and details</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate('/campaigns')}>
          <CardHeader>
            <BarChart3 className="h-8 w-8 text-primary mb-2" />
            <CardTitle className="text-lg">Campaign Dashboard</CardTitle>
            <CardDescription>View all your campaigns</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">
              Go to Dashboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Support */}
      <Card className="mt-6 bg-muted/50">
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-2">Need Help?</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Our support team is here to assist you with your campaign setup and any questions you
            may have.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" size="sm" onClick={() => window.location.href = 'mailto:support@desmoinesaipulse.com'}>
              Email Support
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/advertising-policies')}>
              View Ad Policies
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

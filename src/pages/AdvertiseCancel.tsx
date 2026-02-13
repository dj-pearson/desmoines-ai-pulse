import { useNavigate, useSearchParams } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { XCircle, ArrowLeft, RefreshCw, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function AdvertiseCancel() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  useDocumentTitle("Advertising Cancelled");

  const campaignId = searchParams.get('campaign_id');

  const handleRetryPayment = () => {
    if (campaignId) {
      navigate(`/campaigns`);
    } else {
      navigate('/advertise');
    }
  };

  return (
    <div className="container mx-auto py-12 px-4 max-w-3xl">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-yellow-100 mb-4">
          <XCircle className="h-8 w-8 text-yellow-600" />
        </div>
        <h1 className="text-3xl font-bold mb-2">Payment Cancelled</h1>
        <p className="text-lg text-muted-foreground">
          Your campaign payment was not completed
        </p>
      </div>

      {/* Main Info Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>What Happened?</CardTitle>
          <CardDescription>
            Your payment process was cancelled or interrupted
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription>
              Don't worry! Your campaign has been saved as a draft. You can complete your purchase
              at any time from your campaigns dashboard.
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <h3 className="font-semibold">Common Reasons for Cancellation:</h3>
            <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
              <li>You clicked the back button or closed the payment window</li>
              <li>You decided to review your campaign details before purchasing</li>
              <li>There was an issue with your payment method</li>
              <li>The payment session timed out</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Your Campaign */}
      {campaignId && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Your Draft Campaign</CardTitle>
            <CardDescription>
              Your campaign information has been preserved
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Campaign ID: <span className="font-mono">{campaignId.slice(0, 8).toUpperCase()}</span>
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              All your campaign details, including name, dates, and selected placements, have been
              saved. You can complete your purchase whenever you're ready.
            </p>
            <div className="flex gap-2">
              <Button onClick={handleRetryPayment} className="flex-1">
                <RefreshCw className="mr-2 h-4 w-4" />
                Complete Payment
              </Button>
              <Button variant="outline" onClick={() => navigate('/campaigns')} className="flex-1">
                View Campaign
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <RefreshCw className="h-8 w-8 text-primary mb-2" />
            <CardTitle className="text-lg">Try Again</CardTitle>
            <CardDescription>Complete your campaign purchase</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={handleRetryPayment}>
              Retry Payment
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <ArrowLeft className="h-8 w-8 text-primary mb-2" />
            <CardTitle className="text-lg">Start Over</CardTitle>
            <CardDescription>Create a new campaign</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => navigate('/advertise')}>
              New Campaign
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Help Section */}
      <Card className="bg-muted/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            <CardTitle>Need Assistance?</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Having Payment Issues?</h3>
            <p className="text-sm text-muted-foreground mb-3">
              If you're experiencing problems with your payment, our support team can help:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              <li>Verify your payment method is valid and has sufficient funds</li>
              <li>Check if your card issuer is blocking the transaction</li>
              <li>Try using a different payment method</li>
              <li>Ensure your billing address is correct</li>
            </ul>
          </div>

          <div className="pt-4 border-t">
            <h3 className="font-semibold mb-2">Contact Support</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Our team is available to assist you with any questions or concerns.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.href = 'mailto:support@desmoinesaipulse.com'}
              >
                Email Support
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/campaigns')}
              >
                View All Campaigns
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Navigation */}
      <div className="mt-6 flex justify-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Home
        </Button>
        <Button variant="ghost" onClick={() => navigate('/campaigns')}>
          My Campaigns
        </Button>
      </div>
    </div>
  );
}

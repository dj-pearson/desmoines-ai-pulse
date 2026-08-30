import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, LogIn } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import EventSubmissionForm from "@/components/EventSubmissionForm";
import { toast } from "sonner";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

export default function SubmitEvent() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  useDocumentTitle("Submit an Event | Des Moines Insider");

  const handleEventSubmitted = () => {
    toast.success("Event submitted successfully! We'll review it within 48 hours.");
    navigate("/dashboard?tab=events");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" role="status" aria-live="polite">
        <div className="animate-pulse space-y-4 text-center">
          <div className="h-8 bg-muted rounded w-48 mx-auto" />
          <div className="h-4 bg-muted rounded w-32 mx-auto" />
          <span className="sr-only">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <Breadcrumbs
            className="mb-6"
            items={[
              { label: "Home", href: "/" },
              { label: "Submit an Event" },
            ]}
          />
          <Card className="text-center">
            <CardHeader>
              <div className="mx-auto mb-4 p-4 rounded-full bg-primary/10">
                <SpriteIcon name="calendar" className="h-10 w-10 text-primary" />
              </div>
              <CardTitle className="text-2xl">Submit Your Event</CardTitle>
              <CardDescription className="text-base">
                Share your upcoming event with the Des Moines community. Sign in or create a free account to get started.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertDescription>
                  All event submissions are reviewed by our team within 48 hours. Once approved, your event will appear on the site for thousands of local visitors to discover.
                </AlertDescription>
              </Alert>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={() => navigate("/auth?redirect=/submit-event")} size="lg">
                  <LogIn className="h-4 w-4 mr-2" />
                  Sign In to Submit
                </Button>
                <Button variant="outline" onClick={() => navigate("/auth?redirect=/submit-event")} size="lg">
                  Create Free Account
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-card border-b px-4 py-4 sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-card/95">
        <div className="container mx-auto max-w-3xl">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              <SpriteIcon name="calendar" className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold">Submit an Event</h1>
            </div>
            <div className="w-20" />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: "Submit an Event" },
          ]}
        />
        <Card>
          <CardHeader>
            <CardTitle>Submit Your Event</CardTitle>
            <CardDescription>
              Share your event with the Des Moines community. All submissions are reviewed within 48 hours.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EventSubmissionForm onSuccess={handleEventSubmitted} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

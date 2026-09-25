import { lazy, Suspense } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import SEOHead from "@/components/SEOHead";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { useAuth } from "@/hooks/useAuth";
import { getCanonicalUrl } from "@/lib/brandConfig";
import { SUBMISSION_REVIEW_COPY } from "@/lib/businessCopy";

// Only the signed-in branch renders the form, so a signed-out visitor doesn't
// download it.
const EventSubmissionForm = lazy(() => import("@/components/EventSubmissionForm"));

const TITLE = "Submit an Event";
const DESCRIPTION =
  "Add your Des Moines event to the Des Moines Insider calendar. Sign in, fill in the details and follow its status from your dashboard.";

function SubmitEventHead() {
  // SEOHead is the one title source here (WEB-SEO-028); useDocumentTitle would
  // be a second.
  return <SEOHead title={TITLE} description={DESCRIPTION} canonicalUrl={getCanonicalUrl("/submit-event")} url="/submit-event" />;
}

function FormSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading the form">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

export default function SubmitEvent() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  // EventSubmissionForm shows its own success toast; a second one here said
  // a review deadline that nothing guarantees.
  const handleEventSubmitted = () => {
    navigate("/dashboard?tab=events");
  };

  return (
    <BusinessLayout>
      <SubmitEventHead />
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <Breadcrumbs
          className="mb-6"
          items={[
            { label: "Home", href: "/" },
            { label: "Submit an event" },
          ]}
        />

        <header className="mb-8 space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Submit an event</h1>
          <p className="max-w-prose text-muted-foreground">
            Send us an event happening in the Des Moines area. {SUBMISSION_REVIEW_COPY} You can follow where it
            stands from your dashboard.
          </p>
        </header>

        {authLoading ? (
          <FormSkeleton />
        ) : user ? (
          <section aria-labelledby="submit-form-heading">
            <h2 id="submit-form-heading" className="mb-4 text-xl font-semibold">
              Event details
            </h2>
            <Suspense fallback={<FormSkeleton />}>
              <EventSubmissionForm onSuccess={handleEventSubmitted} />
            </Suspense>
          </section>
        ) : (
          <section aria-labelledby="submit-signin-heading" className="space-y-4">
            <h2 id="submit-signin-heading" className="text-xl font-semibold">
              Sign in to submit
            </h2>
            <p className="max-w-prose text-muted-foreground">
              Your account is where you'll see whether your event was approved and when it's live.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="min-h-11">
                <Link to="/auth?redirect=/submit-event">Sign in</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="min-h-11">
                <Link to="/auth?mode=signup&redirect=/submit-event">Create free account</Link>
              </Button>
            </div>
          </section>
        )}
      </div>
    </BusinessLayout>
  );
}

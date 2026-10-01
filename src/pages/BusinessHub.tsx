import { Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import SEOHead from "@/components/SEOHead";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { BusinessDashboard } from "@/components/BusinessDashboard";
import { BusinessPartnershipApplication } from "@/components/BusinessPartnershipApplication";
import { useAuth } from "@/hooks/useAuth";
import { useTabState } from "@/hooks/useTabState";
import { getCanonicalUrl } from "@/lib/brandConfig";

const TABS = ["workspace", "partnership"] as const;

/**
 * Deliberately out of the index in BOTH branches: it's a sign-in wall for
 * visitors and a private workspace for owners (prerender-routes.mjs excludes
 * it). /business-partnership is the public page.
 */
function HubHead() {
  return (
    <SEOHead
      title="Business Workspace"
      description="Manage the Des Moines Insider listings you've claimed, the events you've submitted and the ad campaigns you've bought."
      canonicalUrl={getCanonicalUrl("/business")}
      url="/business"
      robots="noindex, follow"
    />
  );
}

function HubBreadcrumbs() {
  return (
    <Breadcrumbs
      className="mb-6"
      items={[
        { label: "Home", href: "/" },
        { label: "Business workspace" },
      ]}
    />
  );
}

export default function BusinessHub() {
  const { user, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useTabState("workspace", { validTabs: TABS });

  if (authLoading) {
    return (
      <BusinessLayout>
        <HubHead />
        <div className="container mx-auto max-w-5xl px-4 py-8" role="status" aria-label="Loading">
          <Skeleton className="mb-4 h-9 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      </BusinessLayout>
    );
  }

  if (!user) {
    return (
      <BusinessLayout>
        <HubHead />
        <div className="container mx-auto max-w-2xl px-4 py-8">
          <HubBreadcrumbs />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Business workspace</h1>
          <p className="mt-3 max-w-prose text-muted-foreground">
            Sign in to manage the listings you've claimed, the events you've submitted and your ad campaigns.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg" className="min-h-11">
              <Link to="/auth?redirect=/business">Sign in</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="min-h-11">
              <Link to="/auth?mode=signup&redirect=/business">Create a free account</Link>
            </Button>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            New here?{" "}
            <Link to="/business-partnership" className="font-medium text-primary underline-offset-4 hover:underline">
              See what a business can do on Des Moines Insider
            </Link>
            .
          </p>
        </div>
      </BusinessLayout>
    );
  }

  return (
    <BusinessLayout>
      <HubHead />
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <HubBreadcrumbs />
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Business workspace</h1>
          <p className="mt-2 max-w-prose text-muted-foreground">
            Your listings, your events and your campaigns, in one place.
          </p>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid h-auto w-full grid-cols-2 sm:w-auto sm:inline-grid">
            <TabsTrigger value="workspace" className="min-h-11 px-4">
              Workspace
            </TabsTrigger>
            <TabsTrigger value="partnership" className="min-h-11 px-4">
              Partnership
            </TabsTrigger>
          </TabsList>

          <TabsContent value="workspace" className="mt-8">
            <BusinessDashboard />
          </TabsContent>

          <TabsContent value="partnership" className="mt-8 space-y-4">
            <h2 className="text-xl font-semibold">Partnership</h2>
            <p className="max-w-prose text-sm text-muted-foreground">
              Want to work with us beyond a listing and ads? Send an application and we'll reply by email.
            </p>
            <BusinessPartnershipApplication />
          </TabsContent>
        </Tabs>

        <section aria-labelledby="hub-help-heading" className="mt-12 border-t pt-8">
          <h2 id="hub-help-heading" className="text-lg font-semibold">
            Need a hand?
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Something wrong on your listing that you can't edit here, or a question about a campaign.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/contact">Contact us</Link>
            </Button>
            <Button asChild variant="ghost" className="min-h-11">
              <Link to="/business-partnership">How it works</Link>
            </Button>
          </div>
        </section>
      </div>
    </BusinessLayout>
  );
}

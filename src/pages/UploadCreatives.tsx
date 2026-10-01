import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { CreativeUploadForm } from "@/components/advertising/CreativeUploadForm";
import { PayCampaignButton } from "@/components/campaigns/PayCampaignButton";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCampaignById } from "@/hooks/useCampaignById";
import { campaignStatusLabel, formatCampaignDate } from "@/lib/campaignDisplay";
import { BUSINESS_CONTACT_EMAIL, BUSINESS_CONTACT_HREF, CREATIVE_REVIEW_COPY } from "@/lib/businessCopy";
import { PLACEMENT_SPECS, type PlacementType } from "@/lib/placementSpecs";

/**
 * Mirrors UPLOADABLE_STATUSES in CreativeUploadForm.tsx, which isn't exported
 * (Home owns that file). The form checks the status again on submit; this
 * copy only decides whether to show the form at all.
 */
const UPLOADABLE_STATUSES = ["pending_creative", "pending_review", "active"];

export default function UploadCreatives() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const query = useCampaignById(campaignId);
  const campaign = query.data ?? null;
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const seo = (
    <SEOHead title="Upload creatives" description="Upload artwork for your Des Moines Insider campaign." robots="noindex, follow" />
  );

  if (query.isLoading) {
    return (
      <BusinessLayout>
        {seo}
        <div className="container mx-auto max-w-5xl px-4 py-8" role="status" aria-label="Loading campaign">
          <Skeleton className="mb-6 h-8 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </BusinessLayout>
    );
  }

  if (query.isError) {
    return (
      <BusinessLayout>
        {seo}
        <div className="container mx-auto max-w-5xl px-4 py-8">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} title="This campaign didn't load" />
        </div>
      </BusinessLayout>
    );
  }

  if (!campaign) {
    return (
      <BusinessLayout>
        {seo}
        <div className="container mx-auto max-w-5xl px-4 py-12">
          <h1 className="text-2xl font-semibold text-foreground">Campaign not found</h1>
          <p className="mt-2 text-muted-foreground">There's no campaign with this link on your account.</p>
          <Button asChild variant="outline" className="mt-6">
            <Link to="/campaigns">Back to your campaigns</Link>
          </Button>
        </div>
      </BusinessLayout>
    );
  }

  // Placements that take artwork. A sponsored listing uses the listing's own
  // image, and PLACEMENT_SPECS says so; offering it an uploader meant a blank
  // tab that rejected every file.
  const uploadTypes = Array.from(
    new Set(
      campaign.campaign_placements
        .map((p) => p.placement_type as PlacementType)
        .filter((type) => PLACEMENT_SPECS[type] && !PLACEMENT_SPECS[type].noCreativeRequired),
    ),
  );
  const hasListingPlacement = campaign.campaign_placements.some(
    (p) => PLACEMENT_SPECS[p.placement_type as PlacementType]?.noCreativeRequired,
  );
  const startText = campaign.start_date ? formatCampaignDate(campaign.start_date) : "the start date";
  const uploadable = UPLOADABLE_STATUSES.includes(campaign.status);
  const selected = activeTab && uploadTypes.includes(activeTab as PlacementType) ? activeTab : uploadTypes[0];

  let content;
  if (uploadTypes.length === 0) {
    content = (
      <p className="max-w-prose">
        {hasListingPlacement
          ? `Nothing to upload. Your listing gets the Sponsored label from ${startText}.`
          : "This campaign has no placements that take artwork."}
      </p>
    );
  } else if (campaign.status === "draft" || campaign.status === "pending_payment") {
    content = (
      <div className="space-y-3">
        <p className="max-w-prose">
          Artwork can be uploaded once the campaign is paid for.
        </p>
        <PayCampaignButton campaignId={campaign.id} totalCost={campaign.total_cost} onStale={() => void query.refetch()} />
      </div>
    );
  } else if (!uploadable) {
    content = (
      <div className="max-w-prose space-y-2">
        <p>
          This campaign is {campaignStatusLabel(campaign.status, campaign.start_date).toLowerCase()}, so it isn't taking
          new artwork.
        </p>
        <p className="text-muted-foreground">
          Questions? Email{" "}
          <a href={BUSINESS_CONTACT_HREF} className="underline underline-offset-4">
            {BUSINESS_CONTACT_EMAIL}
          </a>
          .
        </p>
      </div>
    );
  } else {
    content = (
      <Tabs value={selected} onValueChange={setActiveTab}>
        {uploadTypes.length > 1 && (
          <TabsList className="flex h-auto w-full flex-wrap justify-start">
            {uploadTypes.map((type) => (
              <TabsTrigger key={type} value={type}>
                {PLACEMENT_SPECS[type].name}
              </TabsTrigger>
            ))}
          </TabsList>
        )}
        {uploadTypes.map((type) => (
          <TabsContent key={type} value={type} className="mt-6">
            {uploadTypes.length === 1 && <h2 className="mb-4 text-lg font-semibold">{PLACEMENT_SPECS[type].name}</h2>}
            <CreativeUploadForm
              campaignId={campaign.id}
              placementType={type}
              // The form already shows the review verdict; a second toast
              // here used to cover it.
              onSuccess={() => navigate(`/campaigns/${campaign.id}`)}
            />
          </TabsContent>
        ))}
      </Tabs>
    );
  }

  return (
    <BusinessLayout>
      {seo}
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <Button asChild variant="ghost" className="mb-4 -ml-3">
          <Link to={`/campaigns/${campaign.id}`}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Back to the campaign
          </Link>
        </Button>

        <h1 className="text-2xl font-bold sm:text-3xl text-foreground">Upload creatives</h1>
        <p className="mt-1 text-muted-foreground">{campaign.name}</p>

        {uploadTypes.length > 0 && hasListingPlacement && uploadable && (
          <p className="mt-4 max-w-prose text-sm text-muted-foreground">
            Your sponsored listing needs no upload; it uses the listing's own image from {startText}.
          </p>
        )}

        <div className="mt-6 rounded-xl border p-5">{content}</div>

        <section aria-labelledby="review-heading" className="mt-8 max-w-prose">
          <h2 id="review-heading" className="text-lg font-semibold">
            Review
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {CREATIVE_REVIEW_COPY} The rules are in the{" "}
            <Link to="/advertising-policies" className="underline underline-offset-4">
              advertising policies
            </Link>
            .
          </p>
          <h3 className="mt-4 font-medium">Before you upload</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Text that's readable at the smallest size listed for the placement</li>
            <li>Your logo and key text away from the edges</li>
            <li>A link that opens the page the ad talks about</li>
          </ul>
        </section>
      </div>
    </BusinessLayout>
  );
}

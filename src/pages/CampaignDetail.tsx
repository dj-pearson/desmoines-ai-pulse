import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BarChart3, Upload } from "lucide-react";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { PayCampaignButton } from "@/components/campaigns/PayCampaignButton";
import SEOHead from "@/components/SEOHead";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useCampaignById, paidDays, type CampaignById } from "@/hooks/useCampaignById";
import {
  CAMPAIGN_STATUS,
  campaignDays,
  campaignStatusLabel,
  creativeStage,
  formatCampaignDate,
  formatUSD,
  CAMPAIGN_STATUS_BADGE_CLASS,
} from "@/lib/campaignDisplay";
import { BUSINESS_CONTACT_EMAIL, BUSINESS_CONTACT_HREF, CREATIVE_REVIEW_COPY } from "@/lib/businessCopy";
import { PLACEMENT_SPECS, type PlacementType } from "@/lib/placementSpecs";

function everyPlacementIsListingOnly(campaign: CampaignById): boolean {
  const types = campaign.campaign_placements.map((p) => p.placement_type as PlacementType);
  return types.length > 0 && types.every((t) => PLACEMENT_SPECS[t]?.noCreativeRequired);
}

/** The status wording for this campaign, including where its artwork stands. */
function statusText(campaign: CampaignById): string {
  if (campaign.status === "pending_creative") {
    if (everyPlacementIsListingOnly(campaign)) {
      return campaign.start_date ? `Paid, starts ${formatCampaignDate(campaign.start_date)}` : "Paid";
    }
    const stage = creativeStage(campaign.campaign_creatives);
    if (stage === "in_review") return "In review";
    if (stage === "changes_needed") return "Changes needed";
    if (stage === "none") return "Upload creatives";
  }
  return campaignStatusLabel(campaign.status, campaign.start_date);
}

function NextStep({ campaign, onStale }: { campaign: CampaignById; onStale: () => void }) {
  const { status } = campaign;

  if (status === "draft" || status === "pending_payment") {
    return (
      <div className="space-y-3">
        <p>This campaign is saved but not paid for. It won't run until it is.</p>
        <PayCampaignButton campaignId={campaign.id} totalCost={campaign.total_cost} onStale={onStale} />
      </div>
    );
  }

  if (status === "pending_creative") {
    if (everyPlacementIsListingOnly(campaign)) {
      return (
        <p>
          Nothing to upload. Your listing gets the Sponsored label from{" "}
          {campaign.start_date ? formatCampaignDate(campaign.start_date) : "the start date"}.
        </p>
      );
    }
    const stage = creativeStage(campaign.campaign_creatives);
    return (
      <div className="space-y-3">
        <p>
          {stage === "changes_needed"
            ? "One of your creatives was sent back. The reason is below; upload a replacement."
            : stage === "in_review"
              ? CREATIVE_REVIEW_COPY
              : "Upload your artwork for each placement. " + CREATIVE_REVIEW_COPY}
        </p>
        <Button asChild>
          <Link to={`/campaigns/${campaign.id}/creatives`}>
            <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
            {stage === "none" ? "Upload creatives" : "Manage creatives"}
          </Link>
        </Button>
      </div>
    );
  }

  if (status === "pending_review") {
    return (
      <p>
        Your artwork is approved. The campaign starts on{" "}
        {campaign.start_date ? formatCampaignDate(campaign.start_date) : "its start date"}.
      </p>
    );
  }

  if (status === "active" || status === "paused" || status === "completed") {
    return (
      <Button asChild>
        <Link to={`/campaigns/${campaign.id}/analytics`}>
          <BarChart3 className="mr-2 h-4 w-4" aria-hidden="true" />
          See impressions and clicks
        </Link>
      </Button>
    );
  }

  if (status === "rejected") {
    return (
      <div className="space-y-2">
        <p>
          This campaign was rejected
          {campaign.rejected_reason ? <>: {campaign.rejected_reason}</> : "."}
        </p>
        <p className="text-muted-foreground">
          Email{" "}
          <a href={BUSINESS_CONTACT_HREF} className="underline underline-offset-4">
            {BUSINESS_CONTACT_EMAIL}
          </a>{" "}
          and we'll go through it with you.
        </p>
      </div>
    );
  }

  return <p className="text-muted-foreground">Nothing to do here.</p>;
}

export default function CampaignDetail() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const query = useCampaignById(campaignId);
  const campaign = query.data ?? null;

  const seo = (
    <SEOHead title="Your campaign" description="Campaign details on Des Moines Insider." robots="noindex, follow" />
  );

  if (query.isLoading) {
    return (
      <BusinessLayout>
        {seo}
        <div className="container mx-auto max-w-4xl space-y-6 px-4 py-8" role="status" aria-label="Loading campaign">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-40" />
        </div>
      </BusinessLayout>
    );
  }

  if (query.isError) {
    return (
      <BusinessLayout>
        {seo}
        <div className="container mx-auto max-w-4xl px-4 py-8">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} title="This campaign didn't load" />
        </div>
      </BusinessLayout>
    );
  }

  if (!campaign) {
    return (
      <BusinessLayout>
        {seo}
        <div className="container mx-auto max-w-4xl px-4 py-12">
          <h1 className="text-2xl font-semibold text-foreground">Campaign not found</h1>
          <p className="mt-2 text-muted-foreground">There's no campaign with this link on your account.</p>
          <Button asChild variant="outline" className="mt-6">
            <Link to="/campaigns">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Back to your campaigns
            </Link>
          </Button>
        </div>
      </BusinessLayout>
    );
  }

  const tone = CAMPAIGN_STATUS[campaign.status]?.tone ?? "neutral";
  const days = paidDays(campaign.campaign_placements, campaignDays(campaign.start_date, campaign.end_date));

  return (
    <BusinessLayout>
      {seo}
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: "Campaigns", href: "/campaigns" },
            { label: campaign.name },
          ]}
        />

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold sm:text-3xl text-foreground">{campaign.name}</h1>
            <Badge className={CAMPAIGN_STATUS_BADGE_CLASS[tone]}>{statusText(campaign)}</Badge>
          </div>
          <p className="text-muted-foreground">
            Created {formatCampaignDate(campaign.created_at)}
          </p>
        </div>

        <section aria-labelledby="next-heading" className="mt-8 rounded-xl border p-5">
          <h2 id="next-heading" className="mb-3 text-lg font-semibold">
            What happens next
          </h2>
          <NextStep campaign={campaign} onStale={() => void query.refetch()} />
        </section>

        <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-y py-4 sm:grid-cols-4">
          <div>
            <dt className="text-sm text-muted-foreground">Total</dt>
            <dd className="text-xl font-semibold tabular-nums">{formatUSD(campaign.total_cost)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Days</dt>
            <dd className="text-xl font-semibold tabular-nums">{days ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Starts</dt>
            <dd className="font-medium">{campaign.start_date ? formatCampaignDate(campaign.start_date) : "-"}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Ends</dt>
            <dd className="font-medium">{campaign.end_date ? formatCampaignDate(campaign.end_date) : "-"}</dd>
          </div>
        </dl>

        {campaign.campaign_placements.length > 0 && (
          <section aria-labelledby="placements-heading" className="mt-8">
            <h2 id="placements-heading" className="text-lg font-semibold">
              Placements
            </h2>
            <ul className="mt-3 divide-y rounded-xl border">
              {campaign.campaign_placements.map((placement) => {
                const spec = PLACEMENT_SPECS[placement.placement_type as PlacementType];
                return (
                  <li key={placement.id} className="flex items-center justify-between gap-4 p-4">
                    <div>
                      <p className="font-medium">{spec?.name ?? placement.placement_type.replace(/_/g, " ")}</p>
                      {placement.days_count ? (
                        <p className="text-sm text-muted-foreground">{placement.days_count} days</p>
                      ) : null}
                    </div>
                    <p className="font-semibold tabular-nums">{formatUSD(placement.total_cost)}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {campaign.campaign_creatives.length > 0 && (
          <section aria-labelledby="creatives-heading" className="mt-8">
            <h2 id="creatives-heading" className="text-lg font-semibold">
              Creatives
            </h2>
            <ul className="mt-3 divide-y rounded-xl border">
              {campaign.campaign_creatives.map((creative) => {
                const verdict = creative.is_approved
                  ? "Approved"
                  : creative.rejection_reason
                    ? "Changes needed"
                    : "In review";
                return (
                  <li key={creative.id} className="flex items-start gap-4 p-4">
                    {creative.image_url && (
                      <img
                        src={creative.image_url}
                        alt=""
                        loading="lazy"
                        className="h-16 w-24 rounded border object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{creative.title || "Untitled"}</p>
                        <Badge variant={creative.is_approved ? "default" : "outline"}>{verdict}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {PLACEMENT_SPECS[creative.placement_type as PlacementType]?.name ?? creative.placement_type}
                        {creative.dimensions_width && creative.dimensions_height
                          ? `, ${creative.dimensions_width}x${creative.dimensions_height}`
                          : ""}
                        {creative.file_size ? `, ${Math.round(creative.file_size / 1024)}KB` : ""}
                      </p>
                      {creative.rejection_reason && !creative.is_approved && (
                        <p className="mt-1 text-sm text-destructive">{creative.rejection_reason}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div className="mt-8">
          <Button asChild variant="outline">
            <Link to="/campaigns">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              All campaigns
            </Link>
          </Button>
        </div>
      </div>
    </BusinessLayout>
  );
}

import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, CheckCircle, Upload } from "lucide-react";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { handleError, ErrorSeverity } from "@/lib/errorHandler";
import { formatCampaignDate, formatUSD } from "@/lib/campaignDisplay";
import { BUSINESS_CONTACT_EMAIL, BUSINESS_CONTACT_HREF, CREATIVE_REVIEW_COPY } from "@/lib/businessCopy";
import { PLACEMENT_SPECS, type PlacementType } from "@/lib/placementSpecs";

interface PaidCampaign {
  id: string;
  name: string;
  total_cost: number | null;
  start_date: string | null;
  end_date: string | null;
  campaign_placements?: Array<{ placement_type: string }> | null;
}

interface SponsoredLink {
  listing_type: string;
  listing_id: string;
}

type Receipt =
  | { state: "paid"; campaign: PaidCampaign; link: SponsoredLink | null; amountPaid: number | null }
  | { state: "unconfirmed" };

const LISTING_PATHS: Record<string, string> = {
  event: "/events/",
  restaurant: "/restaurants/",
};

async function loadReceipt(campaignId: string): Promise<Receipt> {
  const { data, error } = await supabase.functions.invoke("verify-campaign-payment", { body: { campaignId } });
  if (error || !data?.paid) {
    if (error) {
      handleError(error, { component: "AdvertiseSuccess", action: "verify-payment" }, ErrorSeverity.WARNING);
    }
    return { state: "unconfirmed" };
  }

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, name, total_cost, start_date, end_date, campaign_placements (placement_type)")
    .eq("id", campaignId)
    .single();
  if (campaignError || !campaign) {
    handleError(campaignError ?? new Error("campaign missing after payment"), {
      component: "AdvertiseSuccess",
      action: "read-campaign",
    });
    return { state: "unconfirmed" };
  }

  // Best effort: the link only exists for a sponsored listing, and a failed
  // read costs the advertiser a shortcut, not information.
  let link: SponsoredLink | null = null;
  const { data: links, error: linkError } = await supabase
    .from("sponsored_listing_links")
    .select("listing_type, listing_id")
    .eq("campaign_id", campaignId)
    .limit(1);
  if (!linkError && Array.isArray(links) && links.length > 0) link = links[0] as SponsoredLink;

  // What Stripe charged, after any promotion code. Absent from an older
  // verify-campaign-payment, in which case the page shows the campaign total
  // under that name rather than calling it the amount paid.
  const amountPaid = typeof data.amountPaid === "number" && Number.isFinite(data.amountPaid) ? data.amountPaid : null;

  return { state: "paid", campaign: campaign as unknown as PaidCampaign, link, amountPaid };
}

const SEO = (
  <SEOHead
    title="Payment received"
    description="Your Des Moines Insider ad campaign payment."
    robots="noindex, follow"
  />
);

export default function AdvertiseSuccess() {
  const [searchParams] = useSearchParams();
  const campaignId = searchParams.get("campaign_id");

  const receipt = useQuery({
    queryKey: ["advertise-success", campaignId],
    queryFn: () => loadReceipt(campaignId as string),
    enabled: !!campaignId,
    retry: false,
    staleTime: Infinity,
  });

  if (!campaignId) {
    return (
      <BusinessLayout>
        {SEO}
        <div className="container mx-auto max-w-2xl px-4 py-12">
          <h1 className="text-2xl font-bold text-foreground">We couldn't tell which campaign this is</h1>
          <p className="mt-2 text-muted-foreground">
            This link is missing its campaign. Your campaigns page shows every campaign and whether it's paid.
          </p>
          <Button asChild className="mt-6">
            <Link to="/campaigns">Go to your campaigns</Link>
          </Button>
        </div>
      </BusinessLayout>
    );
  }

  if (receipt.isLoading) {
    return (
      <BusinessLayout>
        {SEO}
        <div className="container mx-auto max-w-2xl px-4 py-12" role="status" aria-label="Checking your payment">
          <Skeleton className="mb-4 h-8 w-64" />
          <Skeleton className="h-48 w-full" />
        </div>
      </BusinessLayout>
    );
  }

  const result = receipt.data;
  if (!result || result.state === "unconfirmed") {
    return (
      <BusinessLayout>
        {SEO}
        <div className="container mx-auto max-w-2xl px-4 py-12">
          <h1 className="text-2xl font-bold text-foreground">We haven't seen the payment yet</h1>
          <p className="mt-2 max-w-prose">
            Nothing is lost. Some payments take a few minutes to confirm. The campaign page shows whether it went
            through, and lets you pay if it didn't.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link to={`/campaigns/${campaignId}`}>Open the campaign</Link>
            </Button>
            <Button variant="outline" onClick={() => void receipt.refetch()}>
              Check again
            </Button>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Charged but still seeing this? Email{" "}
            <a href={BUSINESS_CONTACT_HREF} className="underline underline-offset-4">
              {BUSINESS_CONTACT_EMAIL}
            </a>
            .
          </p>
        </div>
      </BusinessLayout>
    );
  }

  const { campaign, link, amountPaid } = result;
  const placements = campaign.campaign_placements ?? [];
  const listingOnly =
    placements.length > 0 &&
    placements.every((p) => PLACEMENT_SPECS[p.placement_type as PlacementType]?.noCreativeRequired);
  const startText = campaign.start_date ? formatCampaignDate(campaign.start_date) : "the start date";
  const listingHref = link && LISTING_PATHS[link.listing_type] ? `${LISTING_PATHS[link.listing_type]}${link.listing_id}` : null;

  return (
    <BusinessLayout>
      {SEO}
      <div className="container mx-auto max-w-2xl px-4 py-12">
        <div className="flex items-center gap-3">
          <CheckCircle className="h-8 w-8 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-bold sm:text-3xl text-foreground">Payment received</h1>
        </div>
        <p className="mt-2 text-lg">{campaign.name}</p>

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-y py-4">
          <div>
            <dt className="text-sm text-muted-foreground">{amountPaid !== null ? "Amount paid" : "Campaign total"}</dt>
            <dd className="text-lg font-semibold tabular-nums">{formatUSD(amountPaid ?? campaign.total_cost)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Reference</dt>
            <dd className="font-mono text-sm">{campaign.id.slice(0, 8).toUpperCase()}</dd>
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

        <p className="mt-4 max-w-prose text-sm text-muted-foreground">
          Stripe emails the payment receipt to the address on your account. Campaign details stay on this page and in{" "}
          <Link to="/campaigns" className="underline underline-offset-4">
            your campaigns
          </Link>
          .
        </p>

        <section aria-labelledby="next-heading" className="mt-10">
          <h2 id="next-heading" className="text-lg font-semibold">
            What happens next
          </h2>
          {listingOnly ? (
            <p className="mt-2 max-w-prose">
              Nothing to upload. Your listing gets the Sponsored label from {startText} until the campaign ends.
              {listingHref && (
                <>
                  {" "}
                  <Link to={listingHref} className="underline underline-offset-4">
                    See your listing
                  </Link>
                  .
                </>
              )}
            </p>
          ) : (
            <ol className="mt-2 max-w-prose list-decimal space-y-2 pl-5">
              <li>Upload your artwork for each placement.</li>
              <li>{CREATIVE_REVIEW_COPY}</li>
              <li>Approved ads start showing on {startText}.</li>
            </ol>
          )}
        </section>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {!listingOnly && (
            <Button asChild className="min-h-11">
              <Link to={`/campaigns/${campaign.id}/creatives`}>
                <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                Upload creatives
              </Link>
            </Button>
          )}
          <Button asChild variant="outline" className="min-h-11">
            <Link to={`/campaigns/${campaign.id}`}>
              <BarChart3 className="mr-2 h-4 w-4" aria-hidden="true" />
              Open the campaign
            </Link>
          </Button>
        </div>

        <p className="mt-10 text-sm text-muted-foreground">
          Questions about this campaign? Email{" "}
          <a href={BUSINESS_CONTACT_HREF} className="underline underline-offset-4">
            {BUSINESS_CONTACT_EMAIL}
          </a>{" "}
          or read the{" "}
          <Link to="/advertising-policies" className="underline underline-offset-4">
            advertising policies
          </Link>
          .
        </p>
      </div>
    </BusinessLayout>
  );
}

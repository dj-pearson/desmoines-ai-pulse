import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { BarChart3, Pause, Play, Plus, Receipt, RefreshCw, Upload, X } from "lucide-react";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { ConfirmCampaignAction } from "@/components/campaigns/ConfirmCampaignAction";
import SEOHead from "@/components/SEOHead";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useCampaigns, type Campaign } from "@/hooks/useCampaigns";
import { handleError, ErrorSeverity } from "@/lib/errorHandler";
import {
  CAMPAIGN_STATUS,
  campaignStatusLabel,
  creativeStage,
  formatCampaignDate,
  formatUSD,
  CAMPAIGN_STATUS_BADGE_CLASS,
} from "@/lib/campaignDisplay";
import { campaignRpcMessage } from "@/lib/campaignCheckout";
import { BUSINESS_CONTACT_EMAIL, BUSINESS_CONTACT_HREF } from "@/lib/businessCopy";
import { PLACEMENT_SPECS, type PlacementType } from "@/lib/placementSpecs";

const REFUNDABLE = ["pending_creative", "pending_review", "active", "paused", "completed"];
const REFUND_REASON_MIN = 10;

function listingOnly(campaign: Campaign): boolean {
  const placements = campaign.campaign_placements ?? [];
  return (
    placements.length > 0 &&
    placements.every((p) => PLACEMENT_SPECS[p.placement_type as PlacementType]?.noCreativeRequired)
  );
}

function statusText(campaign: Campaign): string {
  if (campaign.status === "pending_creative") {
    if (listingOnly(campaign)) {
      return campaign.start_date ? `Paid, starts ${formatCampaignDate(campaign.start_date)}` : "Paid";
    }
    const stage = creativeStage(
      (campaign.campaign_creatives ?? []).map((c) => ({
        is_approved: c.is_approved,
        rejection_reason: c.rejection_reason ?? null,
      })),
    );
    if (stage === "in_review") return "In review";
    if (stage === "changes_needed") return "Changes needed";
    if (stage === "none") return "Upload creatives";
  }
  return campaignStatusLabel(campaign.status, campaign.start_date);
}

export default function CampaignDashboard() {
  const navigate = useNavigate();
  const { campaigns, isLoading, error, refetch, cancelCampaign, setCampaignPaused, renewCampaign, requestRefund } =
    useCampaigns();
  // One id at a time, so a slow request disables only the row it belongs to.
  const [pendingId, setPendingId] = useState<string | null>(null);

  /**
   * WEB-ADS-011 AC2. Every one of these is a server call that can refuse - the
   * status rules live in the functions, not here - so the failure has to reach
   * the advertiser. campaignRpcMessage turns a PGRST202 (RPC not applied yet)
   * into a sentence and passes the RPC's own refusal text through.
   */
  const run = async (campaignId: string, action: () => Promise<unknown>, success: string) => {
    setPendingId(campaignId);
    try {
      await action();
      toast.success(success);
    } catch (err) {
      handleError(err, { component: "CampaignDashboard", action: "campaign-rpc" }, ErrorSeverity.WARNING);
      toast.error(campaignRpcMessage(err));
    } finally {
      setPendingId(null);
    }
  };

  const seo = (
    <SEOHead title="Your campaigns" description="Your ad campaigns on Des Moines Insider." robots="noindex, follow" />
  );

  let body;
  if (isLoading) {
    body = (
      <div role="status" aria-label="Loading your campaigns" className="space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  } else if (error && campaigns.length === 0) {
    // A failed read is not "No campaigns yet": telling an advertiser with
    // three paid campaigns that they have none is the worse answer.
    body = <ErrorState error={error} onRetry={() => void refetch()} title="Your campaigns didn't load" />;
  } else if (campaigns.length === 0) {
    body = (
      <div className="rounded-xl border px-6 py-12 text-center">
        <h2 className="text-lg font-semibold">No campaigns yet</h2>
        <p className="mx-auto mt-2 max-w-prose text-muted-foreground">
          Pick your dates and placements on the advertise page to start one.
        </p>
        <Button asChild className="mt-6">
          <Link to="/advertise">Start a campaign</Link>
        </Button>
      </div>
    );
  } else {
    body = (
      <ul className="space-y-4">
        {campaigns.map((campaign) => {
          const tone = CAMPAIGN_STATUS[campaign.status]?.tone ?? "neutral";
          const busy = pendingId === campaign.id;
          const placementCount = campaign.campaign_placements?.length ?? 0;
          const creativeCount = campaign.campaign_creatives?.length ?? 0;
          return (
            <li key={campaign.id} className="rounded-xl border p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">
                    <Link to={`/campaigns/${campaign.id}`} className="hover:underline underline-offset-4">
                      {campaign.name}
                    </Link>
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {campaign.start_date && campaign.end_date
                      ? `${formatCampaignDate(campaign.start_date)} to ${formatCampaignDate(campaign.end_date)}`
                      : "Dates not set"}
                    {`, ${placementCount} placement${placementCount === 1 ? "" : "s"}`}
                    {creativeCount > 0 ? `, ${creativeCount} creative${creativeCount === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <Badge className={CAMPAIGN_STATUS_BADGE_CLASS[tone]}>{statusText(campaign)}</Badge>
                  <p className="mt-2 text-lg font-semibold tabular-nums">{formatUSD(campaign.total_cost)}</p>
                </div>
              </div>

              {campaign.status === "rejected" && (
                <div className="mt-3 max-w-prose text-sm">
                  <p>{campaign.rejected_reason ? `Rejected: ${campaign.rejected_reason}` : "This campaign was rejected."}</p>
                  <p className="mt-1 text-muted-foreground">
                    Email{" "}
                    <a href={BUSINESS_CONTACT_HREF} className="underline underline-offset-4">
                      {BUSINESS_CONTACT_EMAIL}
                    </a>{" "}
                    and we'll go through it with you.
                  </p>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {(campaign.status === "draft" || campaign.status === "pending_payment") && (
                  <Button size="sm" asChild className="min-h-11 sm:min-h-9">
                    <Link to={`/campaigns/${campaign.id}`}>
                      {campaign.total_cost ? `Pay ${formatUSD(campaign.total_cost)}` : "Pay"}
                    </Link>
                  </Button>
                )}
                {campaign.status !== "draft" && campaign.status !== "pending_payment" && (
                  <Button variant="outline" size="sm" asChild className="min-h-11 sm:min-h-9">
                    <Link to={`/campaigns/${campaign.id}`}>View details</Link>
                  </Button>
                )}
                {campaign.status === "pending_creative" && !listingOnly(campaign) && (
                  <Button size="sm" asChild className="min-h-11 sm:min-h-9">
                    <Link to={`/campaigns/${campaign.id}/creatives`}>
                      <Upload className="mr-1 h-3 w-3" aria-hidden="true" />
                      {creativeCount === 0 ? "Upload creatives" : "Manage creatives"}
                    </Link>
                  </Button>
                )}
                {["active", "paused", "completed"].includes(campaign.status) && (
                  <Button size="sm" variant="outline" asChild className="min-h-11 sm:min-h-9">
                    <Link to={`/campaigns/${campaign.id}/analytics`}>
                      <BarChart3 className="mr-1 h-3 w-3" aria-hidden="true" />
                      Analytics
                    </Link>
                  </Button>
                )}

                {(campaign.status === "draft" || campaign.status === "pending_payment") && (
                  <ConfirmCampaignAction
                    triggerLabel="Cancel"
                    triggerIcon={<X className="mr-1 h-3 w-3" aria-hidden="true" />}
                    title={`Cancel "${campaign.name}"?`}
                    description={<p>It hasn't been paid for, so nothing is charged.</p>}
                    confirmLabel="Cancel campaign"
                    disabled={busy}
                    onConfirm={() => run(campaign.id, () => cancelCampaign(campaign.id), "Campaign cancelled")}
                  />
                )}
                {campaign.status === "active" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11 sm:min-h-9"
                    disabled={busy}
                    onClick={() =>
                      run(
                        campaign.id,
                        () => setCampaignPaused(campaign.id, true),
                        "Paused. The days you have left are held for you.",
                      )
                    }
                  >
                    <Pause className="mr-1 h-3 w-3" aria-hidden="true" />
                    Pause
                  </Button>
                )}
                {campaign.status === "paused" && (
                  <Button
                    size="sm"
                    className="min-h-11 sm:min-h-9"
                    disabled={busy}
                    onClick={() =>
                      run(
                        campaign.id,
                        () => setCampaignPaused(campaign.id, false),
                        "Resumed. Your end date has moved out by the days you had left.",
                      )
                    }
                  >
                    <Play className="mr-1 h-3 w-3" aria-hidden="true" />
                    Resume
                  </Button>
                )}
                {/*
                  WEB-ADS-011 AC3. renewal_eligible is set by the lifecycle job
                  seven days before the end and on completion. The renewal is an
                  unpaid draft, so it opens on its own page, where the Pay
                  button is.
                */}
                {campaign.renewal_eligible && (
                  <Button
                    size="sm"
                    className="min-h-11 sm:min-h-9"
                    disabled={busy}
                    onClick={() =>
                      run(
                        campaign.id,
                        async () => {
                          const newId = await renewCampaign(campaign.id);
                          if (newId) navigate(`/campaigns/${newId}`);
                        },
                        "Renewed as a draft at today's rates. Check the dates, then pay to start it.",
                      )
                    }
                  >
                    <RefreshCw className="mr-1 h-3 w-3" aria-hidden="true" />
                    Renew
                  </Button>
                )}
                {/* A REQUEST, not a refund. process-stripe-refund stays admin-only. */}
                {REFUNDABLE.includes(campaign.status) && (
                  <ConfirmCampaignAction
                    triggerLabel="Request refund"
                    triggerIcon={<Receipt className="mr-1 h-3 w-3" aria-hidden="true" />}
                    title="Ask for a refund"
                    description={
                      <>
                        <p>
                          This sends your request to us. It doesn't refund anything by itself; a person reads it and
                          replies by email.
                        </p>
                        <p>Tell us what went wrong so we can sort it out.</p>
                      </>
                    }
                    reason={{ label: "Why you'd like a refund", minLength: REFUND_REASON_MIN }}
                    confirmLabel="Send request"
                    dismissLabel="Don't send"
                    disabled={busy}
                    onConfirm={(reason) =>
                      run(
                        campaign.id,
                        () => requestRefund(campaign.id, reason),
                        "Request sent. We'll reply by email.",
                      )
                    }
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <BusinessLayout>
      {seo}
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl text-foreground">Your campaigns</h1>
            <p className="mt-1 text-muted-foreground">Pay, upload artwork and see how each campaign is doing.</p>
          </div>
          <Button asChild>
            <Link to="/advertise">
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              New campaign
            </Link>
          </Button>
        </div>
        {body}
      </div>
    </BusinessLayout>
  );
}

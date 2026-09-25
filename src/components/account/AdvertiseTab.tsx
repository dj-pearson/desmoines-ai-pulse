import { Link } from "react-router-dom";
import { format, isValid } from "date-fns";
import { BarChart3, ChevronRight, CreditCard, Plus, Upload } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { lowestDailyRate, useCampaigns, useRateCard, type Campaign } from "@/hooks/useCampaigns";
import { parseDateOnly } from "@/lib/dateOnly";

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
/** Whole dollars when the rate is whole ("$5"), cents when it isn't ("$7.50"). */
const USD_RATE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const SHOWN = 5;

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_payment: "Payment not finished",
  pending_creative: "Needs your ad",
  pending_review: "In review",
  active: "Running",
  completed: "Finished",
  cancelled: "Cancelled",
  rejected: "Declined",
  refunded: "Refunded",
  suspended: "Paused by us",
};

function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status.replace(/_/g, " ");
}

/** Campaign dates are calendar days; `new Date("2026-10-01")` is Sep 30 in Central. */
function dayLabel(value: string): string | null {
  const day = parseDateOnly(value);
  return isValid(day) ? format(day, "MMM d") : null;
}

function dateRange(campaign: Campaign): string | null {
  if (!campaign.start_date || !campaign.end_date) return null;
  const from = dayLabel(campaign.start_date);
  const to = dayLabel(campaign.end_date);
  return from && to ? `${from} - ${to}` : null;
}

function CampaignRow({ campaign }: { campaign: Campaign }) {
  const range = dateRange(campaign);
  const placements = campaign.campaign_placements?.length ?? 0;
  // total_cost is the amount the server stored. It is formatted, never
  // computed here (CLAUDE.md: money is decided on the server).
  const cost = typeof campaign.total_cost === "number" ? USD.format(campaign.total_cost) : null;
  const facts = [range, cost, `${placements} ${placements === 1 ? "placement" : "placements"}`].filter(Boolean);

  return (
    <li className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="campaign-row">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold leading-snug">{campaign.name}</h3>
          <Badge variant={campaign.status === "active" ? "default" : "secondary"}>{statusLabel(campaign.status)}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{facts.join(" \u00b7 ")}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {campaign.status === "pending_payment" && (
          <Button asChild className="min-h-[44px]">
            <Link to={`/campaigns/${campaign.id}`}>
              <CreditCard className="h-4 w-4" aria-hidden="true" />
              Complete payment
            </Link>
          </Button>
        )}
        {campaign.status === "pending_creative" && (
          <Button asChild className="min-h-[44px]">
            <Link to={`/campaigns/${campaign.id}/creatives`}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              Upload your ad
            </Link>
          </Button>
        )}
        {(campaign.status === "active" || campaign.status === "completed") && (
          <Button asChild variant="outline" className="min-h-[44px]">
            <Link to={`/campaigns/${campaign.id}/analytics`}>
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
              Stats
            </Link>
          </Button>
        )}
        <Button asChild variant="ghost" size="icon">
          <Link to={`/campaigns/${campaign.id}`} aria-label={`Open ${campaign.name}`}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </li>
  );
}

/**
 * The advertiser's side of the Account page (account plan WP4): their own
 * campaigns and what each is waiting on, and where to start a new one. No
 * audience figures, because nothing here measures one; the only price shown is
 * the rate card's lowest daily rate, and only when the card could be read.
 */
export function AdvertiseTab() {
  const { campaigns, isLoading, error, refetch } = useCampaigns();
  const { data: rateCard } = useRateCard();
  const fromRate = lowestDailyRate(rateCard ?? []);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Advertise on Des Moines Insider</h2>
            <p className="max-w-prose text-sm text-muted-foreground">
              Banner, featured and sponsored placements on the pages people use to plan their week.
              {fromRate !== null && (
                <>
                  {" "}
                  <span data-testid="rate-from" className="font-medium text-foreground">
                    From {USD_RATE.format(fromRate)}/day.
                  </span>
                </>
              )}
            </p>
          </div>
          <Button asChild className="min-h-[44px] shrink-0">
            <Link to="/advertise">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create campaign
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>My campaigns</CardTitle>
            <CardDescription>What each campaign is waiting on, newest first.</CardDescription>
          </div>
          {campaigns.length > SHOWN && (
            <Button asChild variant="outline" className="min-h-[44px] shrink-0">
              <Link to="/campaigns">All {campaigns.length}</Link>
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3" aria-busy="true" aria-label="Loading your campaigns">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          ) : error ? (
            // An advertiser whose list failed to load must not be told they
            // have never run a campaign.
            <ErrorState
              error={error}
              compact
              title="Your campaigns didn't load"
              description="Nothing has changed with them. Try again in a moment."
              onRetry={() => void refetch()}
            />
          ) : campaigns.length > 0 ? (
            <ul className="space-y-3">
              {campaigns.slice(0, SHOWN).map((campaign) => (
                <CampaignRow key={campaign.id} campaign={campaign} />
              ))}
            </ul>
          ) : (
            <div className="py-8 text-center">
              <h3 className="mb-1 text-lg font-semibold">No campaigns yet</h3>
              <p className="mx-auto mb-4 max-w-prose text-sm text-muted-foreground">
                Pick a placement and dates on the next page; you'll see the price before you pay.
              </p>
              <Button asChild className="min-h-[44px]">
                <Link to="/advertise">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Start a campaign
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

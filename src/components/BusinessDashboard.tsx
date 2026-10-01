import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { YourListings } from "@/components/business/YourListings";
import { YourEvents } from "@/components/business/YourEvents";
import { useCampaigns } from "@/hooks/useCampaigns";
import { CAMPAIGN_STATUS } from "@/lib/campaignDisplay";

/** Display order for the status counts: what needs you first, history last. */
const STATUS_ORDER = [
  "pending_payment",
  "draft",
  "pending_creative",
  "pending_review",
  "active",
  "paused",
  "rejected",
  "completed",
  "cancelled",
];

function YourCampaigns() {
  const { campaigns, isLoading, error, refetch } = useCampaigns();

  const counts = new Map<string, number>();
  for (const c of campaigns) counts.set(c.status, (counts.get(c.status) ?? 0) + 1);
  const ordered = [
    ...STATUS_ORDER.filter((s) => counts.has(s)),
    ...[...counts.keys()].filter((s) => !STATUS_ORDER.includes(s)),
  ];

  return (
    <section aria-labelledby="your-campaigns-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="your-campaigns-heading" className="text-xl font-semibold">
            Your campaigns
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Paid placements on the site, with impression and click reporting for each one.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="min-h-11">
            <Link to="/advertise">Start a campaign</Link>
          </Button>
          {campaigns.length > 0 && (
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/campaigns">Manage campaigns</Link>
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div role="status" aria-label="Loading your campaigns">
          <Skeleton className="h-6 w-1/3" />
        </div>
      ) : error ? (
        <ErrorState
          compact
          error={error}
          title="Your campaigns didn't load"
          description="This is on our side. Try again in a moment."
          onRetry={() => void refetch()}
        />
      ) : campaigns.length === 0 ? (
        <p className="text-sm text-muted-foreground">You haven't started a campaign yet.</p>
      ) : (
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          {ordered.map((status) => (
            <div key={status}>
              <dt className="text-sm text-muted-foreground">
                {CAMPAIGN_STATUS[status]?.label ?? status.replace(/_/g, " ")}
              </dt>
              <dd className="text-2xl font-semibold tabular-nums">{counts.get(status)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/**
 * The signed-in /business workspace (business plan WP3 item 3): listings you
 * hold, events you've submitted, campaigns you've bought. Everything here
 * reads a table something actually writes; the old business_profiles and
 * business_analytics tiles are gone because nothing did.
 */
export function BusinessDashboard() {
  return (
    <div className="space-y-10">
      <YourListings />
      <hr className="border-border" />
      <YourEvents />
      <hr className="border-border" />
      <YourCampaigns />
    </div>
  );
}

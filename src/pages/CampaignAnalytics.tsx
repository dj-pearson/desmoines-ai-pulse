import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeft, Download } from "lucide-react";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import { WhatWeCount } from "@/components/campaigns/WhatWeCount";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCampaignById, paidDays } from "@/hooks/useCampaignById";
import {
  clickThroughRate,
  downloadDeliveryCsv,
  MAX_SERIES_ROWS,
  useCampaignAnalytics,
  type AnalyticsRange,
  type DailyDelivery,
} from "@/hooks/useCampaignAnalytics";
import { campaignDays, formatCampaignDate, formatUSD } from "@/lib/campaignDisplay";
import { PLACEMENT_SPECS, type PlacementType } from "@/lib/placementSpecs";

const RANGE_LABELS: Record<AnalyticsRange, string> = {
  all: "Whole campaign",
  "7days": "Last 7 days",
  "30days": "Last 30 days",
  "90days": "Last 90 days",
};

const NUMBER = new Intl.NumberFormat("en-US");

function formatCount(n: number): string {
  return NUMBER.format(n);
}

function formatCtr(ctr: number | null): string {
  return ctr === null ? "-" : `${ctr.toFixed(2)}%`;
}

function shortDate(value: string): string {
  return formatCampaignDate(value, "MMM d");
}

interface StatProps {
  label: string;
  value: string;
  note?: string;
}

function Stat({ label, value, note }: StatProps) {
  return (
    <div className="py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
      {note && <dd className="mt-1 text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
}

interface SeriesChartProps {
  data: DailyDelivery[];
  dataKey: "impressions" | "clicks";
  title: string;
}

/** One measure per chart: impressions and clicks differ by orders of magnitude, so they don't share an axis. */
function SeriesChart({ data, dataKey, title }: SeriesChartProps) {
  return (
    <figure>
      <figcaption className="mb-2 text-sm font-medium">{title} per day</figcaption>
      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
              stroke="hsl(var(--border))"
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              width={48}
              tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
              stroke="hsl(var(--border))"
            />
            <Tooltip
              labelFormatter={(value: string) => formatCampaignDate(value)}
              formatter={(value: number) => [formatCount(value), title]}
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                color: "hsl(var(--popover-foreground))",
                borderRadius: 8,
              }}
            />
            <Line
              type="linear"
              dataKey={dataKey}
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={data.length <= 31 ? { r: 3 } : false}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export default function CampaignAnalytics() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [range, setRange] = useState<AnalyticsRange>("all");

  const campaignQuery = useCampaignById(campaignId);
  const campaign = campaignQuery.data ?? null;
  const delivery = useCampaignAnalytics(campaign, range);

  const seo = (
    <SEOHead
      title="Campaign analytics"
      description="Impressions and clicks for your Des Moines Insider ad campaign."
      robots="noindex, follow"
    />
  );

  if (campaignQuery.isLoading) {
    return (
      <BusinessLayout>
        {seo}
        <div className="container mx-auto max-w-5xl px-4 py-8" role="status" aria-label="Loading campaign analytics">
          <Skeleton className="mb-6 h-10 w-64" />
          <Skeleton className="h-64" />
        </div>
      </BusinessLayout>
    );
  }

  if (campaignQuery.isError) {
    return (
      <BusinessLayout>
        {seo}
        <div className="container mx-auto max-w-5xl px-4 py-8">
          <ErrorState
            error={campaignQuery.error}
            onRetry={() => void campaignQuery.refetch()}
            title="This campaign didn't load"
          />
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
          <p className="mt-2 text-muted-foreground">
            There's no campaign with this link on your account.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link to="/campaigns">Back to your campaigns</Link>
          </Button>
        </div>
      </BusinessLayout>
    );
  }

  const data = delivery.data;
  const days = paidDays(campaign.campaign_placements, campaignDays(campaign.start_date, campaign.end_date));
  const ctr = data ? clickThroughRate(data.impressions, data.clicks) : null;
  const cpm =
    range === "all" && data && data.impressions > 0 && typeof campaign.total_cost === "number"
      ? (campaign.total_cost / data.impressions) * 1000
      : null;

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

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl text-foreground">{campaign.name}</h1>
            <p className="mt-1 text-muted-foreground">
              {campaign.start_date && campaign.end_date
                ? `Runs ${formatCampaignDate(campaign.start_date)} to ${formatCampaignDate(campaign.end_date)}`
                : "Dates not set"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={range} onValueChange={(value) => setRange(value as AnalyticsRange)}>
              <SelectTrigger className="w-[200px]" aria-label="Date range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(RANGE_LABELS) as AnalyticsRange[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {RANGE_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={!data || !data.from}
              onClick={() => data && downloadDeliveryCsv(campaign.id, data, campaign.total_cost)}
            >
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              Download CSV
            </Button>
          </div>
        </div>

        {delivery.isError ? (
          <ErrorState
            className="mt-8"
            error={delivery.error}
            onRetry={() => void delivery.refetch()}
            title="The numbers didn't load"
            description="Nothing is lost; the counts are stored. Try again."
          />
        ) : delivery.isLoading || !data ? (
          <div role="status" aria-label="Counting impressions and clicks" className="mt-8 space-y-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-64" />
          </div>
        ) : (
          <>
            <section aria-labelledby="delivery-heading" className="mt-8">
              <h2 id="delivery-heading" className="sr-only">
                Delivery
              </h2>
              <p className="text-sm text-muted-foreground">
                {data.from && data.to
                  ? `${RANGE_LABELS[range]}: ${formatCampaignDate(data.from)} to ${formatCampaignDate(data.to)}`
                  : "This campaign hasn't started yet, so there's nothing to count."}
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-x-6 border-y sm:grid-cols-3 lg:grid-cols-4">
                <Stat label="Impressions" value={formatCount(data.impressions)} />
                <Stat label="Clicks" value={formatCount(data.clicks)} />
                <Stat label="Click-through rate" value={formatCtr(ctr)} />
                <Stat label="Days served" value={formatCount(data.daysServed)} note="Days with at least one impression" />
                <Stat label="Amount paid" value={formatUSD(campaign.total_cost)} />
                <Stat label="Days paid for" value={days === null ? "-" : formatCount(days)} />
                {cpm !== null && (
                  <Stat
                    label="Effective CPM"
                    value={formatUSD(cpm)}
                    note="Worked out: amount paid / impressions x 1,000. Not a rate you were charged."
                  />
                )}
              </dl>
            </section>

            {data.from && (
              <section aria-labelledby="daily-heading" className="mt-10">
                <h2 id="daily-heading" className="text-lg font-semibold">
                  Day by day
                </h2>
                {!data.seriesComplete && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    The daily lines cover the first {formatCount(MAX_SERIES_ROWS)} events. The totals above are exact.
                  </p>
                )}
                <div className="mt-4 grid gap-8 lg:grid-cols-2">
                  <SeriesChart data={data.daily} dataKey="impressions" title="Impressions" />
                  <SeriesChart data={data.daily} dataKey="clicks" title="Clicks" />
                </div>
                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer text-muted-foreground underline underline-offset-4">
                    Show the numbers as a table
                  </summary>
                  <Table className="mt-2">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Impressions</TableHead>
                        <TableHead className="text-right">Clicks</TableHead>
                        <TableHead className="text-right">CTR</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.daily.map((d) => (
                        <TableRow key={d.date}>
                          <TableCell>{formatCampaignDate(d.date)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCount(d.impressions)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCount(d.clicks)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCtr(clickThroughRate(d.impressions, d.clicks))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </details>
              </section>
            )}

            {data.creatives.length > 0 && (
              <section aria-labelledby="creatives-heading" className="mt-10">
                <h2 id="creatives-heading" className="text-lg font-semibold">
                  By creative
                </h2>
                <Table className="mt-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Creative</TableHead>
                      <TableHead>Placement</TableHead>
                      <TableHead className="text-right">Impressions</TableHead>
                      <TableHead className="text-right">Clicks</TableHead>
                      <TableHead className="text-right">CTR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.creatives.map((c) => (
                      <TableRow key={c.creativeId}>
                        <TableCell className="font-medium">{c.title}</TableCell>
                        <TableCell>
                          {PLACEMENT_SPECS[c.placementType as PlacementType]?.name ?? c.placementType.replace(/_/g, " ")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatCount(c.impressions)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCount(c.clicks)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCtr(clickThroughRate(c.impressions, c.clicks))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            )}
          </>
        )}

        <WhatWeCount className="mt-12 border-t pt-8" />
      </div>
    </BusinessLayout>
  );
}

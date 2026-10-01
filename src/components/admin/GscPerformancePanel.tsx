import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, KeyRound, TrendingUp } from "lucide-react";
import {
  useGscPerformance,
  type GscFreshness,
  type GscPageRow,
  type GscQueryRow,
} from "@/hooks/useGscPerformance";

const integer = new Intl.NumberFormat("en-US");

function formatDate(value: string | null): string {
  if (!value) return "never";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "unknown";
  return new Date(parsed).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * "Oct 1, 2026, 5:15 AM (today)". The last-sync tile needs the time as well as
 * the date: a daily job that ran this morning and one that last ran yesterday
 * are the difference between working and broken.
 */
export function formatSyncTime(value: string | null, now: Date = new Date()): string {
  if (!value) return "never";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "unknown";
  const stamp = new Date(parsed).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const days = Math.floor((now.getTime() - parsed) / (24 * 60 * 60 * 1000));
  const relative = days <= 0 ? "today" : days === 1 ? "yesterday" : `${integer.format(days)} days ago`;
  return `${stamp} (${relative})`;
}

/**
 * Said before any number, because a disconnected property still has a year of
 * rows and they render exactly like live ones.
 */
function ConnectionAlert({ freshness }: { freshness: GscFreshness }) {
  if (freshness.connection === "connected") return null;

  if (freshness.connection === "not_connected") {
    return (
      <Alert variant="destructive">
        <KeyRound className="h-4 w-4" />
        <AlertTitle>Search Console is not connected</AlertTitle>
        <AlertDescription>
          The daily sync has no working credential, so nothing below will update. Reconnect from
          Admin, Search Traffic, Connect Google Search Console; the steps are in
          docs/seo/gsc-sync-setup.md. Do not use Disconnect all first: it deletes the property row,
          and every synced row is deleted with it.
          {freshness.errorMessage ? ` Last error: ${freshness.errorMessage}` : ""}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>The last sync failed</AlertTitle>
      <AlertDescription>
        {freshness.errorMessage ?? "gsc-sync-data recorded an error without a message."} The next
        scheduled run retries on its own.
      </AlertDescription>
    </Alert>
  );
}

/**
 * The freshness header, and it leads the panel on purpose. Before SEO-023 the
 * sync had run once, on 2026-03-31, and the metrics underneath described that
 * month while looking current. It is on a daily pg_cron schedule now, but a
 * schedule can stop too, so the age of the data stays the first thing shown.
 */
function FreshnessBanner({ freshness }: { freshness: GscFreshness }) {
  const { daysStale, refreshTokenDaysRemaining, nextSyncAt, syncEnabled } = freshness;
  const stale = daysStale !== null && daysStale > 7;
  const tokenLapsed = refreshTokenDaysRemaining !== null && refreshTokenDaysRemaining <= 0;
  const tokenExpiring = refreshTokenDaysRemaining !== null && refreshTokenDaysRemaining <= 45;

  return (
    <div className="space-y-3">
      <ConnectionAlert freshness={freshness} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FreshnessTile
          label="Data window"
          value={
            freshness.windowStart
              ? `${formatDate(freshness.windowStart)} - ${formatDate(freshness.windowEnd)}`
              : "no rows"
          }
        />
        <FreshnessTile
          label="Age of newest row"
          value={daysStale === null ? "unknown" : `${integer.format(daysStale)} days`}
          tone={stale ? "warn" : "ok"}
        />
        <FreshnessTile
          label="Last sync"
          value={formatSyncTime(freshness.lastSyncAt)}
          tone={freshness.connection === "connected" ? "ok" : "warn"}
        />
        <FreshnessTile
          label="Next scheduled sync"
          value={nextSyncAt ? formatDate(nextSyncAt) : syncEnabled ? "not scheduled" : "disabled"}
          tone={nextSyncAt ? "ok" : "warn"}
        />
      </div>

      {stale && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Every figure below was measured{" "}
            {daysStale === null ? "" : `${integer.format(daysStale)} days ago`} and describes{" "}
            {formatDate(freshness.windowStart)} to {formatDate(freshness.windowEnd)}. Treat it as
            history, not as current performance.
          </AlertDescription>
        </Alert>
      )}

      {tokenExpiring && (
        <Alert variant={tokenLapsed ? "destructive" : "default"}>
          <KeyRound className="h-4 w-4" />
          <AlertDescription>
            {tokenLapsed
              ? "The Search Console refresh token has been unused past Google's six-month limit, so the grant has almost certainly lapsed. Reconnecting needs someone at the Google consent screen."
              : `The Search Console refresh token lapses in ${integer.format(
                  refreshTokenDaysRemaining ?? 0,
                )} days. Google revokes a refresh token unused for six months, and running a sync is what resets that clock.`}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function FreshnessTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "ok" | "warn";
}) {
  const toneClass =
    tone === "warn" ? "text-destructive" : tone === "ok" ? "text-foreground" : "text-foreground";
  return (
    <div className="rounded-xl bg-muted/50 px-4 py-3">
      <div className="text-xs uppercase text-muted-foreground/80">{label}</div>
      <div className={`mt-1 text-base font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function MetricTable({
  rows,
  labelHeader,
  labelOf,
  emptyText,
}: {
  rows: Array<GscQueryRow | GscPageRow>;
  labelHeader: string;
  labelOf: (row: GscQueryRow | GscPageRow) => string;
  emptyText: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase text-muted-foreground/80">
            <th className="py-2 pr-4 font-medium">{labelHeader}</th>
            <th className="py-2 pr-4 text-right font-medium">Impr.</th>
            <th className="py-2 pr-4 text-right font-medium">Clicks</th>
            <th className="py-2 pr-4 text-right font-medium">CTR</th>
            <th className="py-2 text-right font-medium">Position</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={labelOf(row)} className="border-b last:border-0">
              <td className="max-w-md truncate py-2 pr-4" title={labelOf(row)}>
                {labelOf(row)}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {integer.format(row.impressions)}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">{integer.format(row.clicks)}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{row.ctr.toFixed(2)}%</td>
              <td className="py-2 text-right tabular-nums">{row.position.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const queryLabel = (row: GscQueryRow | GscPageRow) => (row as GscQueryRow).query;
const pageLabel = (row: GscQueryRow | GscPageRow) => (row as GscPageRow).pageUrl;

/**
 * Google Search Console performance, rendered inside the existing SEO admin
 * surface rather than as a separate view (WEB-SEO-014 AC6). The two ranked
 * tables answer AC5's first two questions directly: what is close enough to
 * page one to be worth a push, and what already ranks and earns nothing.
 */
export function GscPerformancePanel() {
  const { data, isLoading, error } = useGscPerformance();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Search Console Performance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Search Console Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Could not read the Search Console tables: {(error as Error).message}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Search Console Performance</CardTitle>
          <CardDescription>Not connected</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <KeyRound className="h-4 w-4" />
            <AlertTitle>No Search Console property is connected</AlertTitle>
            <AlertDescription>
              Connect one from Admin, Search Traffic, Connect Google Search Console. The daily sync
              picks it up on its next run. Until then keyword strategy is running on SERP
              observation rather than on our own impression data.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const { freshness, totals } = data;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Search Console Performance</CardTitle>
              <CardDescription>{freshness.propertyUrl}</CardDescription>
            </div>
            <Badge variant="secondary">
              {integer.format(totals.queries)} queries / {integer.format(totals.impressions)}{" "}
              impressions / {integer.format(totals.clicks)} clicks / {totals.ctr.toFixed(2)}% CTR
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <FreshnessBanner freshness={freshness} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Page 2-3 opportunities
          </CardTitle>
          <CardDescription>
            Queries ranking 11-30, where the gap to page one is small enough that a title, an
            internal link or a content addition can close it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MetricTable
            rows={data.pageTwoOpportunities}
            labelHeader="Query"
            labelOf={queryLabel}
            emptyText="No query in the synced window ranks between 11 and 30."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ranking on page one, earning nothing</CardTitle>
          <CardDescription>
            Pages at position 10 or better with zero clicks in the window. The ranking works; the
            title and description are what people are declining to click.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MetricTable
            rows={data.impressionsWithoutClicks}
            labelHeader="Page"
            labelOf={pageLabel}
            emptyText="No page-one URL went clickless in the synced window."
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top queries</CardTitle>
            <CardDescription>By impressions across the synced window.</CardDescription>
          </CardHeader>
          <CardContent>
            <MetricTable
              rows={data.topQueries}
              labelHeader="Query"
              labelOf={queryLabel}
              emptyText="No keyword rows in the synced window."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top pages</CardTitle>
            <CardDescription>By impressions across the synced window.</CardDescription>
          </CardHeader>
          <CardContent>
            <MetricTable
              rows={data.topPages}
              labelHeader="Page"
              labelOf={pageLabel}
              emptyText="No page rows in the synced window."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

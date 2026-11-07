import { useId, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useListingOwnerStats, type StatsListingType } from "@/hooks/useListingOwnerStats";
import { changeLabel, peerSentence, type StatDay } from "@/lib/listingStats";
import { cn } from "@/lib/utils";

const RANGES = [7, 30, 90] as const;

interface ListingStatsPanelProps {
  listingType: StatsListingType;
  listingId: string;
}

/**
 * Daily views as bars. Plain SVG rather than Recharts: thirty rectangles do
 * not need a chart library in the /business bundle. The bars are
 * presentation; the totals above them carry the numbers, and the figure has a
 * text summary for screen readers.
 */
function ViewsBars({ series, label }: { series: StatDay[]; label: string }) {
  const max = Math.max(1, ...series.map((d) => d.views));
  const w = 100 / series.length;
  return (
    <svg
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      className="h-16 w-full text-primary"
      role="img"
      aria-label={label}
    >
      {series.map((d, i) => {
        const h = (d.views / max) * 30;
        return (
          <rect
            key={d.date}
            x={i * w + w * 0.15}
            y={32 - Math.max(h, d.views > 0 ? 1 : 0.4)}
            width={w * 0.7}
            height={Math.max(h, d.views > 0 ? 1 : 0.4)}
            className={d.views > 0 ? "fill-current" : "fill-muted"}
          >
            <title>{`${d.date}: ${d.views} views`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/**
 * The owner's numbers for one verified listing (growth roadmap #3): page
 * views, shares and contact clicks with the change on the previous period,
 * daily views, and where the listing sits among similar places.
 *
 * Every figure comes from get_listing_owner_stats. The footnote says the
 * counts only include visitors who allowed analytics cookies, because that is
 * true and an owner comparing this to their own foot traffic should know it.
 */
export function ListingStatsPanel({ listingType, listingId }: ListingStatsPanelProps) {
  const [days, setDays] = useState<number>(30);
  const headingId = useId();
  const { data, isLoading, error, refetch } = useListingOwnerStats(listingType, listingId, days, true);

  // Function not deployed yet: say nothing rather than show a broken panel.
  if (!isLoading && !error && data === null) return null;
  if (data?.status === "no_data") {
    return (
      <p className="text-sm text-muted-foreground">
        We don't track page visits for venue listings yet, so there are no numbers to show here.
      </p>
    );
  }

  const statType = listingType === "venue" ? "restaurant" : listingType;

  return (
    <section aria-labelledby={headingId} className="space-y-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 id={headingId} className="text-sm font-semibold">
          {/* No listing name here: the claim row's own heading already names it,
              and repeating it made two headings match the same name. */}
          Visitor numbers
        </h4>
        <div role="group" aria-label="Date range" className="inline-flex rounded-lg border p-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={days === r}
              onClick={() => setDays(r)}
              className={cn(
                "min-h-9 rounded-md px-3 text-sm font-medium",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                days === r ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
              )}
            >
              {r} days
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div role="status" aria-label="Loading listing stats" className="space-y-2">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : error ? (
        <ErrorState
          compact
          error={error}
          title="Your stats didn't load"
          description="This is on our side. Try again in a moment."
          onRetry={() => void refetch()}
        />
      ) : data?.status === "ok" ? (
        <>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {(
              [
                ["views", "Page views"],
                ["clicks", "Contact and website clicks"],
                ["shares", "Shares"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="text-2xl font-semibold tabular-nums">{data.totals[key].toLocaleString()}</dd>
                <dd className="text-xs text-muted-foreground">
                  {changeLabel(data.totals[key], data.previous[key], data.days)}
                </dd>
              </div>
            ))}
          </dl>

          <ViewsBars
            series={data.series}
            label={`Daily page views from ${data.from} to ${data.to}, ${data.totals.views} in total.`}
          />

          {data.peers ? (
            <p className="text-sm">{peerSentence(data.peers, statType)}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              We don't list enough similar places yet to compare this one fairly.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Counts include only visitors who allowed analytics cookies, so your real traffic is higher. Days are in
            Central time.
          </p>
        </>
      ) : null}
    </section>
  );
}

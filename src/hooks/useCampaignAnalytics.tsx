import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { handleError } from "@/lib/errorHandler";
import { addCentralDays, centralDateOf } from "@/lib/timezone";
import { STALE_TIME } from "@/lib/queryConfig";

/**
 * Delivery for one campaign, counted by the database.
 *
 * TOTALS ARE HEAD COUNTS. The old hook downloaded every ad_impressions row and
 * took `.length`, so a campaign past PostgREST's row cap (1000) reported 1000
 * impressions however many it had served: an under-count of the one thing the
 * advertiser paid for. `count: 'exact', head: true` returns the number in the
 * Content-Range header and no rows at all.
 *
 * THE DAILY SERIES pages `date, creative_id` in 1000-row pages up to the exact
 * count (capped, see MAX_SERIES_ROWS), and says so when it stopped early.
 * session_id no longer leaves the database. When get_campaign_analytics_summary
 * (business plan D7) is applied, the series should move to that owner-checked
 * RPC.
 *
 * Nothing here is money. The page shows the stored amount paid; there is no
 * per-day or per-click cost, because nothing charges per day or per click.
 */

export type AnalyticsRange = "all" | "7days" | "30days" | "90days";

const RANGE_DAYS: Record<Exclude<AnalyticsRange, "all">, number> = {
  "7days": 7,
  "30days": 30,
  "90days": 90,
};

const PAGE_SIZE = 1000;
/** Stop paging the series here; the totals stay exact regardless. */
export const MAX_SERIES_ROWS = 50_000;

export interface AnalyticsCampaign {
  id: string;
  start_date: string | null;
  end_date: string | null;
}

export interface DailyDelivery {
  date: string;
  impressions: number;
  clicks: number;
}

export interface CreativeDelivery {
  creativeId: string;
  title: string;
  placementType: string;
  impressions: number;
  clicks: number;
}

export interface CampaignDelivery {
  /** yyyy-MM-dd bounds actually counted, or null when the range is empty. */
  from: string | null;
  to: string | null;
  impressions: number;
  clicks: number;
  /** Distinct dates with at least one impression, from the series. */
  daysServed: number;
  daily: DailyDelivery[];
  creatives: CreativeDelivery[];
  /** False when the series stopped at MAX_SERIES_ROWS before the exact count. */
  seriesComplete: boolean;
}

/** The yyyy-MM-dd window for a range: inside the campaign's dates and never past today. */
export function deliveryWindow(
  campaign: AnalyticsCampaign,
  range: AnalyticsRange,
  today: string = centralDateOf(),
): { from: string; to: string } | null {
  const start = campaign.start_date?.slice(0, 10) ?? null;
  const end = campaign.end_date?.slice(0, 10) ?? null;
  if (!start) return null;
  let to = end && end < today ? end : today;
  let from = start;
  if (range !== "all") {
    const floor = addCentralDays(today, -(RANGE_DAYS[range] - 1));
    if (floor > from) from = floor;
  }
  if (to < from) return null;
  if (end && to > end) to = end;
  return { from, to };
}

/** Every yyyy-MM-dd from `from` to `to`, inclusive. */
export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  let day = from;
  // 400 is a guard against a malformed pair, not a real campaign length.
  for (let i = 0; day <= to && i < 400; i += 1) {
    out.push(day);
    day = addCentralDays(day, 1);
  }
  return out;
}

type EventTable = "ad_impressions" | "ad_clicks";

async function exactCount(
  table: EventTable,
  campaignId: string,
  from: string,
  to: string,
  creativeId?: string,
): Promise<number> {
  let query = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .gte("date", from)
    .lte("date", to);
  if (creativeId) query = query.eq("creative_id", creativeId);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function seriesRows(
  table: EventTable,
  campaignId: string,
  from: string,
  to: string,
  total: number,
): Promise<{ rows: Array<{ date: string | null }>; complete: boolean }> {
  const rows: Array<{ date: string | null }> = [];
  const limit = Math.min(total, MAX_SERIES_ROWS);
  for (let offset = 0; offset < limit; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select("date")
      .eq("campaign_id", campaignId)
      .gte("date", from)
      .lte("date", to)
      .order("id", { ascending: true })
      .range(offset, Math.min(offset + PAGE_SIZE, limit) - 1);
    if (error) throw error;
    const page = (data ?? []) as Array<{ date: string | null }>;
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return { rows, complete: total <= MAX_SERIES_ROWS };
}

async function fetchDelivery(campaign: AnalyticsCampaign, range: AnalyticsRange): Promise<CampaignDelivery> {
  const span = deliveryWindow(campaign, range);
  if (!span) {
    return { from: null, to: null, impressions: 0, clicks: 0, daysServed: 0, daily: [], creatives: [], seriesComplete: true };
  }
  const { from, to } = span;

  const [impressions, clicks, creativesResult] = await Promise.all([
    exactCount("ad_impressions", campaign.id, from, to),
    exactCount("ad_clicks", campaign.id, from, to),
    supabase
      .from("campaign_creatives")
      .select("id, title, placement_type")
      .eq("campaign_id", campaign.id),
  ]);
  if (creativesResult.error) throw creativesResult.error;

  const [impressionSeries, clickSeries] = await Promise.all([
    seriesRows("ad_impressions", campaign.id, from, to, impressions),
    seriesRows("ad_clicks", campaign.id, from, to, clicks),
  ]);

  const perDay = new Map<string, DailyDelivery>(
    eachDate(from, to).map((date) => [date, { date, impressions: 0, clicks: 0 }]),
  );
  for (const row of impressionSeries.rows) {
    const day = row.date ? perDay.get(row.date.slice(0, 10)) : undefined;
    if (day) day.impressions += 1;
  }
  for (const row of clickSeries.rows) {
    const day = row.date ? perDay.get(row.date.slice(0, 10)) : undefined;
    if (day) day.clicks += 1;
  }
  const daily = Array.from(perDay.values());

  // Per-creative totals are HEAD counts too, so they're exact even when the
  // series stopped early. A campaign has a handful of creatives at most.
  const creativeRows = (creativesResult.data ?? []) as Array<{ id: string; title: string | null; placement_type: string | null }>;
  const creatives = await Promise.all(
    creativeRows.map(async (c) => ({
      creativeId: c.id,
      title: c.title || "Untitled",
      placementType: c.placement_type ?? "",
      impressions: await exactCount("ad_impressions", campaign.id, from, to, c.id),
      clicks: await exactCount("ad_clicks", campaign.id, from, to, c.id),
    })),
  );
  creatives.sort((a, b) => b.impressions - a.impressions);

  return {
    from,
    to,
    impressions,
    clicks,
    daysServed: daily.filter((d) => d.impressions > 0).length,
    daily,
    creatives,
    seriesComplete: impressionSeries.complete && clickSeries.complete,
  };
}

export function useCampaignAnalytics(campaign: AnalyticsCampaign | null | undefined, range: AnalyticsRange) {
  return useQuery({
    queryKey: ["campaign-analytics", campaign?.id, campaign?.start_date, campaign?.end_date, range],
    queryFn: async () => {
      try {
        return await fetchDelivery(campaign as AnalyticsCampaign, range);
      } catch (err) {
        handleError(err, { component: "useCampaignAnalytics", action: "fetch", metadata: { campaignId: campaign?.id, range } });
        throw err;
      }
    },
    enabled: !!campaign?.id,
    staleTime: STALE_TIME.SHORT,
  });
}

/** CTR as a percentage, or null when nothing was served (0/0 isn't 0%). */
export function clickThroughRate(impressions: number, clicks: number): number | null {
  return impressions > 0 ? (clicks / impressions) * 100 : null;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The delivery as CSV text: one row per day, then the totals. */
export function deliveryCsv(delivery: CampaignDelivery, amountPaid: number | null | undefined): string {
  const lines = [
    ["Date", "Impressions", "Clicks", "CTR (%)"].join(","),
    ...delivery.daily.map((d) => {
      const ctr = clickThroughRate(d.impressions, d.clicks);
      return [d.date, d.impressions, d.clicks, ctr === null ? "" : ctr.toFixed(2)].map(csvCell).join(",");
    }),
    "",
    `Total impressions,${delivery.impressions}`,
    `Total clicks,${delivery.clicks}`,
    `Days served,${delivery.daysServed}`,
    `Amount paid (USD),${typeof amountPaid === "number" ? amountPaid.toFixed(2) : ""}`,
  ];
  if (!delivery.seriesComplete) {
    lines.push(`Note,Daily rows cover the first ${MAX_SERIES_ROWS} events; totals are exact`);
  }
  return lines.join("\n");
}

/** Save the delivery as a CSV file in the browser. */
export function downloadDeliveryCsv(campaignId: string, delivery: CampaignDelivery, amountPaid: number | null | undefined) {
  const blob = new Blob([deliveryCsv(delivery, amountPaid)], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `campaign-${campaignId.slice(0, 8)}-${delivery.from ?? "none"}-to-${delivery.to ?? "none"}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

import { describe, expect, it } from "vitest";
import {
  aggregateGscPerformance,
  type GscPropertyRecord,
  type KeywordRecord,
  type PageRecord,
} from "@/hooks/useGscPerformance";

/**
 * The aggregation, not the fetch. Weighted toward the two things that would
 * produce a plausible-looking wrong number rather than a visible failure:
 * BIGINT arriving as a JSON string, and the freshness arithmetic that is the
 * whole reason this panel leads with a staleness banner.
 */

const NOW = new Date("2026-08-27T12:00:00Z");

const property: GscPropertyRecord = {
  property_url: "sc-domain:desmoinesinsider.com",
  last_sync_at: "2026-03-31T00:00:00Z",
  next_sync_at: null,
  sync_enabled: true,
};

function keyword(over: Partial<KeywordRecord> = {}): KeywordRecord {
  return {
    query: "des moines events",
    date: "2026-03-28",
    impressions: 10,
    clicks: 1,
    position: 5,
    ...over,
  };
}

function page(over: Partial<PageRecord> = {}): PageRecord {
  return {
    page_url: "https://desmoinesinsider.com/events",
    date: "2026-03-28",
    impressions: 10,
    clicks: 1,
    position: 5,
    ...over,
  };
}

describe("aggregateGscPerformance", () => {
  it("adds BIGINT impressions that PostgREST returned as strings", () => {
    // The failure this guards against is not an exception. "900" + "700" is
    // "900700", which sorts and renders like a real impression count.
    const result = aggregateGscPerformance(
      property,
      [
        keyword({ impressions: "900", clicks: "3" }),
        keyword({ impressions: "700", clicks: "2", date: "2026-03-27" }),
      ],
      [],
      NOW,
    );

    expect(result.totals.impressions).toBe(1600);
    expect(result.totals.clicks).toBe(5);
    expect(result.topQueries[0].impressions).toBe(1600);
  });

  it("weights position by impressions rather than averaging the rows", () => {
    // One impression at position 3 must not drag a query seen 900 times at 12
    // onto page one. A plain mean of the two rows reports 7.5, which would both
    // misstate the position and drop the query out of the page-2 bucket.
    const result = aggregateGscPerformance(
      property,
      [
        keyword({ impressions: 900, position: 12, clicks: 0 }),
        keyword({ impressions: 1, position: 3, clicks: 0, date: "2026-03-27" }),
      ],
      [],
      NOW,
    );

    expect(result.topQueries[0].position).toBeCloseTo(11.99, 2);
    expect(result.pageTwoOpportunities).toHaveLength(1);
  });

  it("reports how stale the data is and how long the refresh token has left", () => {
    const result = aggregateGscPerformance(
      property,
      [keyword({ date: "2026-03-28" }), keyword({ date: "2026-02-28", query: "other" })],
      [],
      NOW,
    );

    expect(result.freshness.windowStart).toBe("2026-02-28");
    expect(result.freshness.windowEnd).toBe("2026-03-28");
    // 2026-03-28 to 2026-08-27.
    expect(result.freshness.daysStale).toBe(152);
    // Last used 2026-03-31, 149 days ago, against Google's 180-day idle limit.
    expect(result.freshness.refreshTokenDaysRemaining).toBe(31);
  });

  it("reports a lapsed refresh token as a negative remainder, not as zero", () => {
    const result = aggregateGscPerformance(
      { ...property, last_sync_at: "2025-08-27T00:00:00Z" },
      [keyword()],
      [],
      NOW,
    );

    expect(result.freshness.refreshTokenDaysRemaining).toBeLessThan(0);
  });

  it("leaves freshness null rather than guessing when the property never synced", () => {
    const result = aggregateGscPerformance(
      { ...property, last_sync_at: null },
      [],
      [],
      NOW,
    );

    expect(result.freshness.refreshTokenDaysRemaining).toBeNull();
    expect(result.freshness.daysStale).toBeNull();
    expect(result.freshness.windowEnd).toBeNull();
  });

  it("selects page 2-3 queries and excludes page one and page four", () => {
    const result = aggregateGscPerformance(
      property,
      [
        keyword({ query: "page one", position: 4 }),
        keyword({ query: "page two", position: 14 }),
        keyword({ query: "page three", position: 28 }),
        keyword({ query: "page four", position: 41 }),
      ],
      [],
      NOW,
    );

    expect(result.pageTwoOpportunities.map((q) => q.query)).toEqual(["page two", "page three"]);
  });

  it("flags page-one pages with no clicks and ignores ones that never rank", () => {
    const result = aggregateGscPerformance(
      property,
      [],
      [
        page({ page_url: "/ranks-no-clicks", position: 6, clicks: 0, impressions: 800 }),
        page({ page_url: "/ranks-and-clicks", position: 6, clicks: 40, impressions: 800 }),
        // Position 42 with no clicks is a ranking problem, not a snippet
        // problem. Rewriting its title would change nothing.
        page({ page_url: "/never-ranks", position: 42, clicks: 0, impressions: 800 }),
      ],
      NOW,
    );

    expect(result.impressionsWithoutClicks.map((p) => p.pageUrl)).toEqual(["/ranks-no-clicks"]);
  });

  it("computes CTR as a percentage of impressions", () => {
    const result = aggregateGscPerformance(
      property,
      [keyword({ impressions: 200, clicks: 5 })],
      [],
      NOW,
    );

    expect(result.totals.ctr).toBeCloseTo(2.5, 5);
  });

  it("does not divide by zero when a query has impressions of zero", () => {
    const result = aggregateGscPerformance(
      property,
      [keyword({ impressions: 0, clicks: 0, position: 0 })],
      [],
      NOW,
    );

    expect(result.totals.ctr).toBe(0);
    expect(result.topQueries[0].position).toBe(0);
    expect(result.pageTwoOpportunities).toHaveLength(0);
  });
});

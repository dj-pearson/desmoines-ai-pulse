import { describe, it, expect } from "vitest";
import { changeLabel, parseListingStats, peerGroupPhrase, peerSentence } from "../listingStats";

const OK = {
  status: "ok",
  days: 30,
  from: "2026-10-09",
  to: "2026-11-07",
  series: [{ date: "2026-11-07", views: 30, shares: 0, clicks: 0 }],
  totals: { views: 50, shares: 3, clicks: 7 },
  previous: { views: 20, shares: 0, clicks: 0 },
  peers: { group: "cuisine", label: "Mexican", size: 6, median_views: 20, percentile: 67 },
};

describe("parseListingStats", () => {
  it("reads the shape get_listing_owner_stats returns", () => {
    const s = parseListingStats(OK);
    expect(s?.status).toBe("ok");
    if (s?.status !== "ok") return;
    expect(s.totals).toEqual({ views: 50, shares: 3, clicks: 7 });
    expect(s.series).toHaveLength(1);
    expect(s.peers?.percentile).toBe(67);
  });

  it("keeps no_data distinct from an error", () => {
    expect(parseListingStats({ status: "no_data", days: 30 })).toEqual({ status: "no_data", days: 30 });
  });

  it("treats a missing comparison as none, not as malformed", () => {
    const s = parseListingStats({ ...OK, peers: null });
    expect(s?.status === "ok" && s.peers).toBeNull();
  });

  it("rejects anything that would render as NaN", () => {
    expect(parseListingStats(null)).toBeNull();
    expect(parseListingStats({ ...OK, totals: { views: "50", shares: 0, clicks: 0 } })).toBeNull();
    expect(parseListingStats({ ...OK, series: [{ views: 1, shares: 0, clicks: 0 }] })).toBeNull();
    expect(parseListingStats({ ...OK, status: "weird" })).toBeNull();
  });
});

describe("changeLabel", () => {
  it("says up and down in whole percents", () => {
    expect(changeLabel(50, 20, 30)).toBe("Up 150% on the previous 30 days");
    expect(changeLabel(16, 20, 30)).toBe("Down 20% on the previous 30 days");
    expect(changeLabel(20, 20, 7)).toBe("Same as the previous 7 days");
  });

  it("never divides by zero", () => {
    expect(changeLabel(12, 0, 30)).toBe("None in the previous 30 days");
    expect(changeLabel(0, 0, 30)).toBe("None in the previous 30 days either");
  });
});

describe("peer wording", () => {
  const peers = { group: "cuisine" as const, label: "Mexican", size: 6, median_views: 20, percentile: 67 };

  it("names the group, never another business", () => {
    expect(peerSentence(peers, "restaurant")).toBe(
      "More page views than 67% of the 6 other Mexican restaurants we list. The typical one got 20.",
    );
  });

  it("flips to 'fewer' below the middle", () => {
    expect(peerSentence({ ...peers, percentile: 10 }, "restaurant")).toMatch(/^Fewer page views than 90% of/);
  });

  it("words each group type", () => {
    expect(peerGroupPhrase({ ...peers, group: "neighborhood", label: "east-village" }, "restaurant")).toBe(
      "restaurants in East village",
    );
    expect(peerGroupPhrase({ ...peers, group: "type", label: "Museum" }, "attraction")).toBe("museum listings");
    expect(peerGroupPhrase({ ...peers, group: "all", label: "attractions" }, "attraction")).toBe(
      "attractions on Des Moines Insider",
    );
  });
});

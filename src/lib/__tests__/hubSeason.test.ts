import { describe, it, expect } from "vitest";
import {
  currentSeason,
  isGuideCurrent,
  isInLeadWindow,
  nextSeason,
  seasonHref,
  SEASON_FALLBACK_HREF,
} from "@/lib/hubSeason";

describe("currentSeason", () => {
  it.each([
    ["2026-03-01", "spring"],
    ["2026-05-31", "spring"],
    ["2026-06-01", "summer"],
    ["2026-08-31", "summer"],
    ["2026-09-24", "fall"],
    ["2026-11-30", "fall"],
    ["2026-12-01", "winter"],
    ["2027-01-15", "winter"],
    ["2027-02-28", "winter"],
  ])("%s is %s", (day, season) => {
    expect(currentSeason(day)).toBe(season);
  });
});

describe("nextSeason", () => {
  it("cycles spring, summer, fall, winter and wraps", () => {
    expect(nextSeason("spring")).toBe("summer");
    expect(nextSeason("summer")).toBe("fall");
    expect(nextSeason("fall")).toBe("winter");
    expect(nextSeason("winter")).toBe("spring");
  });

  it("gives Fall then Winter in September", () => {
    const now = currentSeason("2026-09-15");
    expect([now, nextSeason(now)]).toEqual(["fall", "winter"]);
  });
});

describe("seasonHref", () => {
  it("uses the newest published guide for the season", () => {
    const guides = [
      { season: "summer", slug: "summer-2027" },
      { season: "fall", slug: "fall-2026" },
      { season: "fall", slug: "fall-2025" },
    ];
    expect(seasonHref("fall", guides)).toBe("/guides/fall-2026");
  });

  it("lets a holiday guide answer for winter", () => {
    expect(seasonHref("winter", [{ season: "holiday", slug: "holiday-lights-2026" }])).toBe(
      "/guides/holiday-lights-2026",
    );
  });

  it("falls back to the static href while guides are loading or absent", () => {
    expect(seasonHref("fall", undefined)).toBe(SEASON_FALLBACK_HREF.fall);
    expect(seasonHref("spring", [])).toBe("/guides");
  });

  it("never falls back to a dated literal", () => {
    for (const href of Object.values(SEASON_FALLBACK_HREF)) expect(href).not.toMatch(/\d{4}/);
  });
});

describe("seasonHref staleness (explore pass 2 WP1 item 10)", () => {
  const guides = [
    { season: "summer", slug: "summer-2026", publish_date: "2026-05-20" },
    { season: "fall", slug: "fall-festivals", publish_date: "2025-08-01" },
  ];

  it("on 2027-06-15 skips last year's summer guide and falls back", () => {
    expect(seasonHref("summer", guides, "2027-06-15")).toBe(SEASON_FALLBACK_HREF.summer);
  });

  it("still links the same guide while it is current", () => {
    expect(seasonHref("summer", guides, "2026-07-01")).toBe("/guides/summer-2026");
  });

  it("skips an undated-slug guide published more than ten months ago", () => {
    expect(seasonHref("fall", guides, "2026-09-25")).toBe(SEASON_FALLBACK_HREF.fall);
    expect(seasonHref("fall", guides, "2026-05-31")).toBe("/guides/fall-festivals");
  });

  it("falls through to an older current guide rather than the fallback", () => {
    const two = [
      { season: "fall", slug: "fall-2025", publish_date: "2025-09-01" },
      { season: "fall", slug: "fall-colors", publish_date: "2026-09-01" },
    ];
    expect(seasonHref("fall", two, "2026-09-25")).toBe("/guides/fall-colors");
  });

  it("treats a missing date and no today as current", () => {
    expect(isGuideCurrent({ season: "fall", slug: "fall-2020" })).toBe(true);
    expect(isGuideCurrent({ season: "fall", slug: "fall-guide", publish_date: null }, "2030-01-01")).toBe(true);
  });
});

describe("isInLeadWindow", () => {
  const fair = { startISO: "2027-08-12", endISO: "2027-08-22" };
  it("is false in September before the fair", () => {
    expect(isInLeadWindow(fair, "2026-09-24")).toBe(false);
  });
  it("opens leadDays before the start and closes after the last day", () => {
    expect(isInLeadWindow(fair, "2027-06-27")).toBe(false);
    expect(isInLeadWindow(fair, "2027-06-28")).toBe(true);
    expect(isInLeadWindow(fair, "2027-08-22")).toBe(true);
    expect(isInLeadWindow(fair, "2027-08-23")).toBe(false);
  });
});

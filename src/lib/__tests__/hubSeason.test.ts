import { describe, it, expect } from "vitest";
import {
  currentSeason,
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

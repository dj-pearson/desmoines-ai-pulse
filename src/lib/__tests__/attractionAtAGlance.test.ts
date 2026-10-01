import { describe, it, expect } from "vitest";
import {
  activeHoursSeason,
  attractionOpenStatus,
  attractionOpeningHoursSpec,
  hoursSeasons,
  weeklyHoursRows,
} from "@/lib/attractionHours";
import {
  attractionHoursSentence,
  calendarDateLabel,
  factSourceSites,
  hubFactsSummary,
  isVerifiedFree,
  parseFactSources,
  seasonLabel,
} from "@/lib/attractionAtAGlance";

// 2026-10-01 is a Thursday. 15:00Z is 10:00 AM in Des Moines (CDT).
const THU_10AM = new Date("2026-10-01T15:00:00Z");
// 2026-10-05 is a Monday.
const MON_10AM = new Date("2026-10-05T15:00:00Z");
// 2026-11-20 is a Friday.
const FRI_NOV_20 = new Date("2026-11-20T16:00:00Z");
// 2027-02-01: no season below covers it.
const FEB_2027 = new Date("2027-02-01T16:00:00Z");

const ten = (close: string) => ({ open: "10:00", close });

// The Botanical Garden as stored by SEO-046: two dated seasons.
const GARDEN = [
  {
    valid_from: "2026-09-30",
    valid_through: "2026-11-12",
    mon: "closed",
    tue: ten("17:00"),
    wed: ten("17:00"),
    thu: ten("17:00"),
    fri: ten("17:00"),
    sat: { open: "09:00", close: "16:00" },
    sun: { open: "09:00", close: "16:00" },
  },
  {
    valid_from: "2026-11-13",
    valid_through: "2027-01-03",
    mon: "closed",
    tue: ten("16:00"),
    wed: ten("16:00"),
    thu: ten("16:00"),
    fri: ten("16:00"),
    sat: { open: "09:00", close: "16:00" },
    sun: { open: "09:00", close: "16:00" },
  },
];

describe("hoursSeasons / activeHoursSeason", () => {
  it("reads a plain week as one open-ended season", () => {
    const seasons = hoursSeasons({ mon: ten("16:00") });
    expect(seasons).toHaveLength(1);
    expect(seasons[0]).toMatchObject({ validFrom: null, validThrough: null });
  });

  it("drops a season whose dates can't be read", () => {
    expect(hoursSeasons([{ valid_from: "Labor Day", mon: ten("16:00") }])).toEqual([]);
    expect(hoursSeasons("10-4 daily")).toEqual([]);
  });

  it("picks the season covering the Des Moines date, inclusive at both ends", () => {
    expect(activeHoursSeason(GARDEN, THU_10AM)?.validFrom).toBe("2026-09-30");
    expect(activeHoursSeason(GARDEN, FRI_NOV_20)?.validFrom).toBe("2026-11-13");
    // 03:00Z on Nov 13 is still Nov 12 in Des Moines.
    expect(activeHoursSeason(GARDEN, new Date("2026-11-13T03:00:00Z"))?.validThrough).toBe("2026-11-12");
    expect(activeHoursSeason(GARDEN, FEB_2027)).toBeNull();
  });
});

describe("seasonal hours in status, table and schema", () => {
  it("uses the season's own hours", () => {
    expect(attractionOpenStatus(GARDEN, null, THU_10AM).isOpen).toBe(true);
    expect(weeklyHoursRows(GARDEN, FRI_NOV_20)[1].text).toBe("10 AM - 4 PM");
  });

  it("knows nothing outside every season rather than carrying the last one forward", () => {
    expect(attractionOpenStatus(GARDEN, null, FEB_2027).status).toBe("unknown");
    expect(weeklyHoursRows(GARDEN, FEB_2027)).toEqual([]);
  });

  it("does not name a next opening past the end of a season ending this week", () => {
    const endsSunday = [{ valid_from: "2026-09-01", valid_through: "2026-10-04", thu: ten("12:00") }];
    // Thursday 3 PM: closed; the next Thursday is after the season.
    const r = attractionOpenStatus(endsSunday, null, new Date("2026-10-01T20:00:00Z"));
    expect(r.status).toBe("closed");
    expect(r.nextOpensAt).toBeNull();
  });

  it("puts validFrom/validThrough on every entry and leaves out an ended season", () => {
    const spec = attractionOpeningHoursSpec(GARDEN, FRI_NOV_20);
    expect(spec).toHaveLength(7);
    expect(spec.every((s) => s.validFrom === "2026-11-13" && s.validThrough === "2027-01-03")).toBe(true);
    expect(spec[0]).toMatchObject({ dayOfWeek: "https://schema.org/Monday", opens: "00:00", closes: "00:00" });
    expect(attractionOpeningHoursSpec(GARDEN, THU_10AM)).toHaveLength(14);
  });

  it("emits no validity for a plain week", () => {
    const [first] = attractionOpeningHoursSpec({ mon: ten("16:00") }, THU_10AM);
    expect(first).toEqual({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: "https://schema.org/Monday",
      opens: "10:00",
      closes: "16:00",
    });
  });
});

describe("attractionHoursSentence", () => {
  it("phrases today by schedule", () => {
    expect(attractionHoursSentence(GARDEN, THU_10AM)).toBe("Open 10 AM to 5 PM on Thursdays");
    expect(attractionHoursSentence(GARDEN, MON_10AM)).toBe("Closed on Mondays");
  });

  it("says 24 hours for an all-day entry", () => {
    expect(attractionHoursSentence({ thu: { open: "00:00", close: "24:00" } }, THU_10AM)).toBe(
      "Open 24 hours on Thursdays",
    );
  });

  it("is null for a day the row leaves out, or a date no season covers", () => {
    expect(attractionHoursSentence({ mon: ten("16:00") }, THU_10AM)).toBeNull();
    expect(attractionHoursSentence(GARDEN, FEB_2027)).toBeNull();
    expect(attractionHoursSentence(null, THU_10AM)).toBeNull();
  });
});

describe("labels", () => {
  it("formats a stored date without a time zone moving it", () => {
    expect(calendarDateLabel("2026-10-01")).toBe("October 1, 2026");
    expect(calendarDateLabel("soon")).toBeNull();
    expect(calendarDateLabel(null)).toBeNull();
  });

  it("names a season's dates, the year once when both share it", () => {
    expect(seasonLabel(activeHoursSeason(GARDEN, THU_10AM))).toBe("September 30 to November 12, 2026");
    expect(seasonLabel(activeHoursSeason(GARDEN, FRI_NOV_20))).toBe("November 13, 2026 to January 3, 2027");
    expect(seasonLabel(activeHoursSeason({ mon: ten("16:00") }, THU_10AM))).toBeNull();
  });
});

describe("fact sources", () => {
  const sources = [
    { url: "https://www.sciowa.org/visit/planning-your-visit/hours-and-admission/", fields: ["hours", "admission", "is_free"] },
    { url: "https://www.sciowa.org/visit/planning-your-visit/directions-and-parking/", fields: ["parking", "price"] },
    { url: "javascript:alert(1)", fields: ["hours"] },
  ];

  it("keeps http(s) entries and known fields only", () => {
    const parsed = parseFactSources(sources);
    expect(parsed).toHaveLength(2);
    expect(parsed[1].fields).toEqual(["parking"]);
    expect(parseFactSources("https://x.test")).toEqual([]);
  });

  it("prints one site per host, without www.", () => {
    expect(factSourceSites(parseFactSources(sources))).toEqual([
      { host: "sciowa.org", url: "https://www.sciowa.org/visit/planning-your-visit/hours-and-admission/" },
    ]);
  });

  it("calls a row free only when a source page said so", () => {
    const verified = { is_free: true, facts_verified_at: "2026-10-01", fact_sources: [{ url: "https://a.test/", fields: ["is_free"] }] };
    expect(isVerifiedFree(verified)).toBe(true);
    expect(isVerifiedFree({ ...verified, fact_sources: [{ url: "https://a.test/", fields: ["hours"] }] })).toBe(false);
    expect(isVerifiedFree({ ...verified, facts_verified_at: null })).toBe(false);
    expect(isVerifiedFree({ is_free: true })).toBe(false);
  });

  it("summarises the hub from verified rows and names a duplicated place once", () => {
    const park = [{ url: "https://desmoinesartcenter.org/visit/pappajohn-sculpture-park/", fields: ["is_free"] }];
    const summary = hubFactsSummary([
      { name: "Pappajohn Sculpture Park", is_free: true, facts_verified_at: "2026-10-01", fact_sources: park },
      { name: "John and Mary Pappajohn Sculpture Park", is_free: true, facts_verified_at: "2026-10-01", fact_sources: park },
      { name: "Blank Park Zoo", is_free: false, facts_verified_at: "2026-09-30", fact_sources: [{ url: "https://www.blankparkzoo.com/faq", fields: ["hours"] }] },
      { name: "East Village", is_free: true, facts_verified_at: null, fact_sources: null },
    ]);
    expect(summary.checkedCount).toBe(3);
    expect(summary.free.map((r) => r.name)).toEqual(["John and Mary Pappajohn Sculpture Park"]);
    expect(summary.checkedLabel).toBe("October 1, 2026");
  });
});

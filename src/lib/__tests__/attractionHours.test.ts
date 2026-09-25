import { describe, it, expect } from "vitest";
import {
  attractionHoursToPeriods,
  attractionOpenStatus,
  attractionOpeningHoursSpec,
  attractionFactParts,
  parseClock,
  weeklyHoursRows,
} from "@/lib/attractionHours";

// 2026-09-23 is a Wednesday. 15:00Z is 10:00 AM in Des Moines (CDT, UTC-5).
const WED_10AM = new Date("2026-09-23T15:00:00Z");
// 23:30Z is 6:30 PM Central.
const WED_630PM = new Date("2026-09-23T23:30:00Z");
// 2026-09-26 is a Saturday, 10:00 AM Central.
const SAT_10AM = new Date("2026-09-26T15:00:00Z");

const NINE_TO_FIVE = { open: "09:00", close: "17:00" };
const FULL_WEEK = {
  mon: NINE_TO_FIVE,
  tue: NINE_TO_FIVE,
  wed: NINE_TO_FIVE,
  thu: NINE_TO_FIVE,
  fri: NINE_TO_FIVE,
  sat: { open: "10:00", close: "16:00" },
  sun: null,
};

describe("parseClock", () => {
  it.each([
    ["09:00", 540],
    ["9:30", 570],
    ["17:00", 1020],
    ["24:00", 1440],
    ["9am", 540],
    ["9:30 PM", 1290],
    ["12 pm", 720],
    ["12am", 0],
  ])("%s -> %i", (input, minutes) => {
    expect(parseClock(input)).toBe(minutes);
  });

  it.each([["9"], ["25:00"], ["9:75"], [""], ["noonish"]])("rejects %s", (input) => {
    expect(parseClock(input)).toBeNull();
  });

  it("rejects non-strings", () => {
    expect(parseClock(900)).toBeNull();
    expect(parseClock(null)).toBeNull();
  });
});

describe("attractionOpenStatus", () => {
  it("is open inside today's hours", () => {
    const r = attractionOpenStatus(FULL_WEEK, null, WED_10AM);
    expect(r.status).toBe("open");
    expect(r.closesAt).toBe("5 PM");
  });

  it("is closed after close and names the next opening", () => {
    const r = attractionOpenStatus(FULL_WEEK, null, WED_630PM);
    expect(r.status).toBe("closed");
    expect(r.nextOpensAt).toBe("tomorrow 9 AM");
  });

  it("uses Saturday's own hours", () => {
    const r = attractionOpenStatus(FULL_WEEK, null, SAT_10AM);
    expect(r.status).toBe("open");
    expect(r.closesAt).toBe("4 PM");
  });

  it("falls back to hours_summary when today's key is missing", () => {
    const hours = { mon: NINE_TO_FIVE, tue: NINE_TO_FIVE };
    const withText = attractionOpenStatus(hours, "Daily 8am-8pm", WED_10AM);
    expect(withText.status).toBe("open");
    const withoutText = attractionOpenStatus(hours, null, WED_10AM);
    expect(withoutText.status).toBe("unknown");
  });

  it("does not name a next opening past a day nobody entered", () => {
    // Thursday is missing: after Wednesday's close, the next opening is unknown.
    const { thu: _thu, ...noThursday } = FULL_WEEK;
    void _thu;
    const r = attractionOpenStatus(noThursday, null, WED_630PM);
    expect(r.status).toBe("closed");
    expect(r.nextOpensAt).toBeNull();
  });

  it("treats explicit closed markers as closed", () => {
    for (const closed of [null, false, "closed", { closed: true }]) {
      const r = attractionOpenStatus({ ...FULL_WEEK, wed: closed }, null, WED_10AM);
      expect(r.status).toBe("closed");
    }
  });

  it("uses only the text when hours is not an object", () => {
    expect(attractionOpenStatus(null, "Mon-Sun 9am-5pm", WED_10AM).status).toBe("open");
    expect(attractionOpenStatus("09:00-17:00", null, WED_10AM).status).toBe("unknown");
  });

  it("accepts full day names and any case", () => {
    const r = attractionOpenStatus({ Wednesday: NINE_TO_FIVE }, null, WED_10AM);
    expect(r.status).toBe("open");
  });
});

describe("attractionHoursToPeriods", () => {
  it("rolls an overnight close into the next day", () => {
    const periods = attractionHoursToPeriods({ sat: { open: "20:00", close: "02:00" } });
    expect(periods).toEqual([
      { open: { day: 6, hour: 20, minute: 0 }, close: { day: 0, hour: 2, minute: 0 } },
    ]);
  });
});

describe("weeklyHoursRows", () => {
  it("gives seven rows Monday first with today marked", () => {
    const rows = weeklyHoursRows(FULL_WEEK, WED_10AM);
    expect(rows.map((r) => r.label)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
    expect(rows.find((r) => r.isToday)?.label).toBe("Wednesday");
    expect(rows[0].text).toBe("9 AM - 5 PM");
    expect(rows[6].text).toBe("Closed");
  });

  it("leaves a missing day blank rather than closed", () => {
    const rows = weeklyHoursRows({ mon: NINE_TO_FIVE }, WED_10AM);
    expect(rows[0].text).toBe("9 AM - 5 PM");
    expect(rows[2].text).toBeNull();
  });

  it("is empty when nothing is readable", () => {
    expect(weeklyHoursRows(null, WED_10AM)).toEqual([]);
    expect(weeklyHoursRows({ mon: { open: "soon" } }, WED_10AM)).toEqual([]);
  });
});

describe("attractionOpeningHoursSpec", () => {
  it("emits six entries when Sunday was never entered", () => {
    const { sun: _sun, ...noSunday } = FULL_WEEK;
    void _sun;
    const spec = attractionOpeningHoursSpec(noSunday);
    expect(spec).toHaveLength(6);
    expect(spec.map((s) => s.dayOfWeek)).not.toContain("https://schema.org/Sunday");
    expect(spec[0]).toEqual({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: "https://schema.org/Monday",
      opens: "09:00",
      closes: "17:00",
    });
    expect(spec[5]).toMatchObject({ dayOfWeek: "https://schema.org/Saturday", opens: "10:00", closes: "16:00" });
  });

  it("states an entered closed day as 00:00-00:00", () => {
    const spec = attractionOpeningHoursSpec(FULL_WEEK);
    expect(spec).toHaveLength(7);
    expect(spec[6]).toMatchObject({ dayOfWeek: "https://schema.org/Sunday", opens: "00:00", closes: "00:00" });
  });

  it("writes a 24:00 close as 23:59 and keeps an overnight close as stored", () => {
    const spec = attractionOpeningHoursSpec({ fri: { open: "00:00", close: "24:00" }, sat: { open: "20:00", close: "02:00" } });
    expect(spec).toEqual([
      { "@type": "OpeningHoursSpecification", dayOfWeek: "https://schema.org/Friday", opens: "00:00", closes: "23:59" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: "https://schema.org/Saturday", opens: "20:00", closes: "02:00" },
    ]);
  });

  it("is empty for no readable day", () => {
    expect(attractionOpeningHoursSpec(null)).toEqual([]);
    expect(attractionOpeningHoursSpec({ mon: { open: "soon" } })).toEqual([]);
  });
});

describe("attractionFactParts", () => {
  const row = { hours: FULL_WEEK, hours_summary: null, is_free: true, is_indoor: false, is_kid_friendly: true };

  it("lists the set columns and today's status", () => {
    expect(attractionFactParts(row, WED_10AM)).toEqual(["Free", "Outdoor", "Kids", "Open until 5 PM"]);
  });

  it("leaves the status out when there is no clock", () => {
    expect(attractionFactParts(row, null)).toEqual(["Free", "Outdoor", "Kids"]);
  });

  it("says nothing for unset columns", () => {
    expect(attractionFactParts({}, WED_10AM)).toEqual([]);
  });
});

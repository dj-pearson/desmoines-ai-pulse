import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import {
  desMoinesNow,
  formatClockLabel,
  formatOpenStatusLine,
  getOpeningCoverage,
  getOpeningHoursSpecification,
  getRestaurantOpenStatus,
  isVisitableStatus,
  resolveOpenStatus,
} from "@/lib/restaurantHours";

/**
 * The hours evaluator reads Central wall time whatever zone the reader is in
 * (eat-drink plan WP3). Every case runs twice, with the process zone set to
 * UTC and then to Los Angeles, so a regression to getHours() on a raw Date
 * fails here: Sat 01:00 in Des Moines is Sat 06:00 in UTC, which is after a
 * 2am close.
 *
 * Fixed week: Thu 2026-09-24 through Wed 2026-09-30.
 */
function central(local: string): Date {
  return fromZonedTime(local, "America/Chicago");
}

const FRI_0100 = central("2026-09-25T01:00:00");
const SAT_0100 = central("2026-09-26T01:00:00");
const SUN_0100 = central("2026-09-27T01:00:00");
const MON_0700 = central("2026-09-28T07:00:00");
const MON_1200 = central("2026-09-28T12:00:00");
const TUE_1200 = central("2026-09-29T12:00:00");
const WED_1800 = central("2026-09-30T18:00:00");
const WED_1530 = central("2026-09-30T15:30:00");

const ZONES = ["UTC", "America/Los_Angeles"] as const;

describe.each(ZONES)("restaurant hours with the process in %s", (zone) => {
  const previous = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = zone;
  });
  afterAll(() => {
    process.env.TZ = previous;
  });

  it("really runs in that zone", () => {
    // Guards the guard: if the runtime ignored the TZ change, every case
    // below would pass for the wrong reason.
    const offset = new Date("2026-09-26T06:00:00Z").getTimezoneOffset();
    expect(offset).toBe(zone === "UTC" ? 0 : 420);
  });

  it("desMoinesNow reads Central wall fields", () => {
    const wall = desMoinesNow(SAT_0100);
    expect(wall.getDay()).toBe(6);
    expect(wall.getHours()).toBe(1);
  });

  describe("header-comment formats", () => {
    const cases: Array<[string, Date, boolean]> = [
      ["Mon-Sat 11am-10pm, Sun 12-9pm", TUE_1200, true],
      ["Mon-Sat 11am-10pm, Sun 12-9pm", MON_0700, false],
      ["Daily 11am-10pm", WED_1800, true],
      ["24 hours", MON_0700, true],
      ["11:00 AM - 10:00 PM", TUE_1200, true],
      ["11:00 AM - 10:00 PM", MON_0700, false],
      ["11:00-22:00", WED_1800, true],
    ];
    it.each(cases)("%s at %s is open: %s", (opening, at, open) => {
      expect(getRestaurantOpenStatus(opening, at).isOpen).toBe(open);
    });

    it("Closed Mondays settles Monday even with no readable hours", () => {
      expect(getRestaurantOpenStatus("Closed Mondays", MON_1200).status).toBe("closed");
      expect(getRestaurantOpenStatus("Closed Mondays", TUE_1200).status).toBe("unknown");
    });
  });

  describe("a close after midnight belongs to the previous day", () => {
    const hours = "Fri-Sat 6pm-2am";
    it("is closed at 01:00 Friday (Thursday is not in the range)", () => {
      expect(getRestaurantOpenStatus(hours, FRI_0100).isOpen).toBe(false);
    });
    it("is open at 01:00 Saturday (Friday night)", () => {
      const r = getRestaurantOpenStatus(hours, SAT_0100);
      expect(r.isOpen).toBe(true);
      expect(r.closesAt).toBe("2 AM");
    });
    it("is open at 01:00 Sunday (Saturday night, across the week end)", () => {
      expect(getRestaurantOpenStatus(hours, SUN_0100).isOpen).toBe(true);
    });
  });

  describe("closing soon", () => {
    it("is closing soon 59 minutes before close", () => {
      const r = getRestaurantOpenStatus("Daily 11am-10pm", central("2026-09-30T21:01:00"));
      expect(r.status).toBe("closing-soon");
      expect(r.isOpen).toBe(true);
    });
    it("is plain open 61 minutes before close", () => {
      const r = getRestaurantOpenStatus("Daily 11am-10pm", central("2026-09-30T20:59:00"));
      expect(r.status).toBe("open");
      expect(r.closesAt).toBe("10 PM");
    });
  });

  describe("fails closed", () => {
    it("reads 'Mon-Fri 5-10pm' as an evening, so 07:00 Monday is closed", () => {
      const r = getRestaurantOpenStatus("Mon-Fri 5-10pm", MON_0700);
      expect(r.isOpen).toBe(false);
      expect(r.nextOpensAt).toBe("5 PM");
    });
    it("drops an unreadable day prefix instead of meaning every day", () => {
      const r = getRestaurantOpenStatus("Brunch Sat-Sun 10am-2pm", TUE_1200);
      expect(r.isOpen).toBe(false);
      expect(r.status).toBe("unknown");
    });
    it("honours 'Closed Mon' after a daily range", () => {
      const r = getRestaurantOpenStatus("Daily 11-9, Closed Mon", MON_1200);
      expect(r.isOpen).toBe(false);
      expect(r.status).toBe("closed");
      expect(r.nextOpensAt).toBe("tomorrow 11 AM");
      expect(getRestaurantOpenStatus("Daily 11-9, Closed Mon", TUE_1200).isOpen).toBe(true);
    });
    it("accepts abbreviated and dotted closed days", () => {
      expect(getRestaurantOpenStatus("Daily 11am-9pm, Closed Mon.", MON_1200).isOpen).toBe(false);
    });
    it("treats bare hours with two readings as unknown", () => {
      expect(getRestaurantOpenStatus("Daily 5-10", MON_1200).status).toBe("unknown");
    });
    it("does not read a phone number as hours", () => {
      expect(getRestaurantOpenStatus("Call 515-555-1234", MON_1200).status).toBe("unknown");
    });
    it("is unknown for null, empty and unparseable text", () => {
      expect(getRestaurantOpenStatus(null, MON_1200).status).toBe("unknown");
      expect(getRestaurantOpenStatus("", MON_1200).status).toBe("unknown");
      expect(getRestaurantOpenStatus("call ahead", MON_1200).status).toBe("unknown");
    });
    it("is closed with no next opening for a permanently closed place", () => {
      const r = getRestaurantOpenStatus("Permanently closed", MON_1200);
      expect(r.status).toBe("closed");
      expect(r.nextOpensAt).toBeNull();
    });
  });

  describe("split shifts", () => {
    const hours = "Tue-Sat 11am-2pm, 5-9pm";
    it("is open in the second shift at 18:00 Wednesday", () => {
      const r = getRestaurantOpenStatus(hours, WED_1800);
      expect(r.isOpen).toBe(true);
      expect(r.closesAt).toBe("9 PM");
    });
    it("is closed between shifts and names the evening opening", () => {
      const r = getRestaurantOpenStatus(hours, WED_1530);
      expect(r.isOpen).toBe(false);
      expect(r.nextOpensAt).toBe("5 PM");
    });
    it("keeps the second shift on the first shift's days", () => {
      expect(getRestaurantOpenStatus(hours, central("2026-09-28T18:00:00")).isOpen).toBe(false);
    });
  });

  describe("next opening", () => {
    it("names the weekday when it is more than a day away", () => {
      const r = getRestaurantOpenStatus("Thu-Sat 5pm-10pm", MON_1200);
      expect(r.nextOpensAt).toBe("Thu 5 PM");
      expect(r.nextOpensInMinutes).toBe(3 * 24 * 60 + 5 * 60);
    });
  });

  describe("wallClock option", () => {
    it("does not convert a zoned Date twice", () => {
      const wall = toZonedTime(SAT_0100, "America/Chicago");
      expect(getRestaurantOpenStatus("Fri-Sat 6pm-2am", wall, { wallClock: true }).isOpen).toBe(true);
    });
  });

  describe("resolveOpenStatus", () => {
    const json = {
      periods: [
        { open: { day: 5, hour: 18, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } },
        { open: { day: 6, hour: 18, minute: 0 }, close: { day: 0, hour: 2, minute: 0 } },
      ],
    };
    it("prefers hours_json periods, across midnight and the week end", () => {
      expect(resolveOpenStatus(json, "Mon-Fri 9am-5pm", SAT_0100).isOpen).toBe(true);
      expect(resolveOpenStatus(json, "Mon-Fri 9am-5pm", SUN_0100).isOpen).toBe(true);
      expect(resolveOpenStatus(json, "Mon-Fri 9am-5pm", FRI_0100).isOpen).toBe(false);
    });
    it("falls back to the text when the row has no usable periods", () => {
      expect(resolveOpenStatus(undefined, "Daily 11am-10pm", TUE_1200).isOpen).toBe(true);
      expect(resolveOpenStatus({ periods: [{ open: { day: 0, hour: 0 } }] }, "Daily 11am-10pm", TUE_1200).isOpen).toBe(true);
    });
  });
});

describe("formatting", () => {
  it("formats clock labels", () => {
    expect(formatClockLabel(22 * 60)).toBe("10 PM");
    expect(formatClockLabel(22 * 60 + 30)).toBe("10:30 PM");
    expect(formatClockLabel(0)).toBe("midnight");
    expect(formatClockLabel(24 * 60)).toBe("midnight");
    expect(formatClockLabel(12 * 60)).toBe("noon");
  });

  it("builds the card decision line", () => {
    const base = { isOpen: false, closingSoon: false, closesAt: null, nextOpensAt: null, nextOpensInMinutes: null };
    expect(formatOpenStatusLine({ ...base, status: "open", isOpen: true, closesAt: "10 PM" })).toBe("Open until 10 PM");
    expect(formatOpenStatusLine({ ...base, status: "open", isOpen: true })).toBe("Open 24 hours");
    expect(formatOpenStatusLine({ ...base, status: "closed", nextOpensAt: "11 AM" })).toBe("Closed, opens 11 AM");
    expect(formatOpenStatusLine({ ...base, status: "unknown" })).toBeNull();
  });

  it("keeps schema output in step with the closed-day rule", () => {
    const specs = getOpeningHoursSpecification("Daily 11-9, Closed Mon");
    expect(specs?.[0].dayOfWeek).not.toContain("Monday");
    expect(specs?.[0].opens).toBe("11:00");
    expect(specs?.[0].closes).toBe("21:00");
  });
});

/**
 * Eat & Drink pass 2, WP2 items 1-4: the evaluator says "unknown" where it
 * used to guess.
 */
describe("fails closed on text it cannot place (pass 2)", () => {
  const SAT_1000 = central("2026-09-26T10:00:00");
  const SAT_2300 = central("2026-09-26T23:00:00");
  const SUN_1100 = central("2026-09-27T11:00:00");
  const SUN_1500 = central("2026-09-27T15:00:00");

  describe("bare bar hours", () => {
    it.each(["Fri-Sat 4-2", "Daily 5-2", "Mon-Sun 4-2", "Daily 10-2"])(
      "%s is unknown at 10:00 Saturday, not open",
      (text) => {
        expect(getRestaurantOpenStatus(text, SAT_1000).status).toBe("unknown");
      },
    );

    it("does not publish 4 AM-2 PM as schema hours", () => {
      expect(getOpeningHoursSpecification("Fri-Sat 4-2")).toBeNull();
    });

    it.each([
      ["11-9", MON_1200, true],
      ["Daily 7-3", MON_1200, true],
      ["Daily 12-8", MON_1200, true],
      ["Daily 7-3", MON_0700, true],
    ] as const)("%s still reads as a daytime range", (text, at, open) => {
      expect(getRestaurantOpenStatus(text, at).isOpen).toBe(open);
    });

    it("11-9 is still open at noon", () => {
      expect(getRestaurantOpenStatus("11-9", central("2026-09-26T12:00:00")).status).toBe("open");
    });

    it("keeps an explicit bar close: Fri-Sat 4pm-2am is open at 11 PM Saturday", () => {
      expect(getRestaurantOpenStatus("Fri-Sat 4pm-2am", SAT_2300).isOpen).toBe(true);
      expect(getRestaurantOpenStatus("Fri-Sat 4pm-2am", SAT_1000).isOpen).toBe(false);
    });
  });

  describe("a dropped segment", () => {
    const BRUNCH = "Mon-Sat 11am-10pm; Sun Brunch 10am-2pm";

    it("is unknown on Sunday, not closed", () => {
      expect(getRestaurantOpenStatus(BRUNCH, SUN_1100).status).toBe("unknown");
      expect(getRestaurantOpenStatus(BRUNCH, SUN_1500).status).toBe("unknown");
    });

    it("still says open on a day it can read", () => {
      expect(getRestaurantOpenStatus(BRUNCH, TUE_1200).isOpen).toBe(true);
    });

    it("publishes no schema hours", () => {
      expect(getOpeningHoursSpecification(BRUNCH)).toBeNull();
    });

    it("counts an ambiguous range as dropped too", () => {
      expect(getRestaurantOpenStatus("Mon-Sat 11am-10pm; Sun 5-10", SUN_1100).status).toBe("unknown");
    });

    it("keeps a day the text names as closed", () => {
      const r = getRestaurantOpenStatus("Mon-Sat 11am-10pm; Sun Brunch 10am-2pm; Closed Mon", MON_1200);
      expect(r.status).toBe("closed");
      expect(r.nextOpensAt).toBeNull();
    });
  });

  describe("24 hours", () => {
    const MIXED = "Tuesday: Open 24 hours; Wednesday: Closed";

    it("is open all of Tuesday and only Tuesday", () => {
      expect(getRestaurantOpenStatus(MIXED, TUE_1200).isOpen).toBe(true);
      expect(getRestaurantOpenStatus(MIXED, central("2026-09-29T03:00:00")).isOpen).toBe(true);
      expect(getRestaurantOpenStatus(MIXED, WED_1800).isOpen).toBe(false);
      expect(getRestaurantOpenStatus(MIXED, MON_1200).isOpen).toBe(false);
      expect(getOpeningHoursSpecification(MIXED)).toEqual([
        { "@type": "OpeningHoursSpecification", dayOfWeek: ["Tuesday"], opens: "00:00", closes: "23:59" },
      ]);
    });

    it("does not read a drive-thru note as a 24/7 week", () => {
      const text = "Drive-thru 24 hours; dining room 10am-11pm";
      expect(getRestaurantOpenStatus(text, SUN_1100).status).toBe("unknown");
      expect(getOpeningHoursSpecification(text)).toBeNull();
    });

    it.each(["24 hours", "Open 24 hours", "24/7", "Daily: Open 24 hours", "Open 24 hours a day, 7 days a week"])(
      "still reads %s as around the clock",
      (text) => {
        const r = getRestaurantOpenStatus(text, SUN_1100);
        expect(r.isOpen).toBe(true);
        expect(r.closesAt).toBeNull();
      },
    );
  });

  describe("getOpeningCoverage", () => {
    it("tells listed, closed and not-listed days apart", () => {
      const c = getOpeningCoverage("Tuesday: Open 24 hours; Wednesday: Closed");
      expect(c?.listedDays).toEqual([2]);
      expect(c?.closedDays).toEqual([3]);
      expect(c?.days[1].state).toBe("not-listed");
      expect(c?.days[2].ranges).toEqual([{ openMinutes: 0, closeMinutes: 24 * 60 }]);
    });

    it("marks an unread segment and leaves its day not listed", () => {
      const c = getOpeningCoverage("Mon-Sat 11am-10pm; Sun Brunch 10am-2pm");
      expect(c?.hasUnreadSegment).toBe(true);
      expect(c?.days[0].state).toBe("not-listed");
      expect(c?.listedDays).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it("reads Closed Mon as closed", () => {
      const c = getOpeningCoverage("Daily 11-9, Closed Mon");
      expect(c?.closedDays).toEqual([1]);
      expect(c?.listedDays).toEqual([0, 2, 3, 4, 5, 6]);
    });

    it("is null for empty or unreadable text", () => {
      expect(getOpeningCoverage(null)).toBeNull();
      expect(getOpeningCoverage("call ahead")).toBeNull();
    });
  });
});

describe("isVisitableStatus", () => {
  it.each([
    ["open", true],
    ["newly_opened", true],
    ["opening_soon", false],
    ["announced", false],
    ["closed", false],
  ] as const)("reads the CHECK value %s as %s", (status, expected) => {
    expect(isVisitableStatus(status)).toBe(expected);
  });

  it("treats a missing status as open, the column default", () => {
    expect(isVisitableStatus(null)).toBe(true);
    expect(isVisitableStatus(undefined)).toBe(true);
  });

  it("still catches legacy spellings", () => {
    expect(isVisitableStatus("permanently_closed")).toBe(false);
    expect(isVisitableStatus("temporarily_closed")).toBe(false);
  });
});

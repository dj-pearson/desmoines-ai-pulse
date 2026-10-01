import { describe, it, expect } from "vitest";
import { hoursTextOf } from "@/lib/hoursText";
import {
  getOpeningCoverage,
  getOpeningHoursSpecification,
  getRestaurantOpenStatus,
  resolveOpenStatus,
  resolveOpeningHoursSpecification,
  type StoredOpeningHours,
} from "@/lib/restaurantHours";
import { restaurantTemplateTitle } from "@/lib/restaurantMeta";
import { isOpenForDinner } from "@/lib/tonightPairings";
import { deriveOpenNow, isListableRow, type OpenNowRestaurantRow } from "@/hooks/useOpenNowRestaurants";

// SEO-054. restaurants.opening is a `date` column in production. PostgREST
// returns it as "2026-03-15", which the text parser used to read as 03:00 to
// 15:00 every day.
const OPENING_DATE = "2026-03-15";

// Wed 2026-09-30 12:00 CDT.
const NOON_WEDNESDAY = new Date("2026-09-30T17:00:00Z");

/** Google's shape (WEB-BE-045): Mon-Sat 07:00-14:00, as Atlas Cafe returned it. */
const HOURS_JSON: StoredOpeningHours = {
  version: 1,
  timeZone: "America/Chicago",
  periods: [1, 2, 3, 4, 5, 6].map((day) => ({
    open: { day, hour: 7, minute: 0 },
    close: { day, hour: 14, minute: 0 },
  })),
  weekdayDescriptions: [],
};

describe("hoursTextOf", () => {
  it("rejects dates and timestamps", () => {
    for (const v of ["2026-03-15", " 2026-03-15 ", "2026-03-15T00:00:00", "2026-03-15T00:00:00Z", "2026-03-15 00:00:00+00", "2026-03-15T05:00:00.000-05:00"]) {
      expect(hoursTextOf(v)).toBeNull();
    }
  });

  it("rejects non-strings and blanks", () => {
    for (const v of [null, undefined, "", "   ", 42, {}, new Date()]) expect(hoursTextOf(v)).toBeNull();
  });

  it("keeps real hours text, trimmed", () => {
    expect(hoursTextOf(" Mon-Sat 11am-10pm ")).toBe("Mon-Sat 11am-10pm");
    expect(hoursTextOf("11:00-22:00")).toBe("11:00-22:00");
    expect(hoursTextOf("24 hours")).toBe("24 hours");
  });
});

describe("a date in `opening` never renders as hours", () => {
  it("is unknown to the evaluator, not 'open until 3 PM'", () => {
    const status = getRestaurantOpenStatus(OPENING_DATE, NOON_WEDNESDAY);
    expect(status.status).toBe("unknown");
    expect(status.isOpen).toBe(false);
  });

  it("publishes no OpeningHoursSpecification and no coverage", () => {
    expect(getOpeningHoursSpecification(OPENING_DATE)).toBeNull();
    expect(resolveOpeningHoursSpecification(null, OPENING_DATE)).toBeNull();
    expect(getOpeningCoverage(OPENING_DATE)).toBeNull();
  });

  it("does not put Hours in the title", () => {
    const title = restaurantTemplateTitle({ name: "Atlas Cafe", city: "Des Moines", opening: OPENING_DATE });
    expect(title).not.toMatch(/hours/i);
  });

  it("does not make a Tonight dinner pick", () => {
    expect(isOpenForDinner({ id: "a", name: "A", opening: OPENING_DATE }, NOON_WEDNESDAY, NOON_WEDNESDAY)).toBeNull();
  });
});

describe("hours_json is what answers now", () => {
  it("evaluates Google's periods even when `opening` holds a date", () => {
    const status = resolveOpenStatus(HOURS_JSON, OPENING_DATE, NOON_WEDNESDAY);
    expect(status.status).toBe("open");
    expect(status.closesAt).toBe("2 PM");
  });

  it("puts Hours in the title from hours_json", () => {
    const title = restaurantTemplateTitle({ name: "Atlas Cafe", city: "Des Moines", opening: OPENING_DATE, hours_json: HOURS_JSON });
    expect(title).toMatch(/Hours/);
  });

  it("feeds a Tonight dinner pick from hours_json", () => {
    const at = new Date("2026-09-30T16:00:00Z"); // 11:00 CDT, three hours before close
    expect(isOpenForDinner({ id: "a", name: "A", opening: OPENING_DATE, hours_json: HOURS_JSON }, at, at)?.status).toBe("open");
  });

  it("lists hours_json rows on /restaurants/open-now and drops date-only rows", () => {
    const withJson: OpenNowRestaurantRow = { id: "j", name: "Json", opening: OPENING_DATE, hours_json: HOURS_JSON };
    const dateOnly: OpenNowRestaurantRow = { id: "d", name: "Date", opening: OPENING_DATE };
    expect(isListableRow(withJson)).toBe(true);
    expect(isListableRow(dateOnly)).toBe(false);
    const view = deriveOpenNow([withJson, dateOnly], NOON_WEDNESDAY);
    expect(view.withListedHours).toBe(1);
    expect(view.open.map((e) => e.restaurant.id)).toEqual(["j"]);
  });
});

import { describe, expect, it } from "vitest";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { pickedDayToSubmissionDate } from "../submissionDate";

/** What publish_submission does: `(s.date AT TIME ZONE 'America/Chicago')::date`. */
const centralDay = (iso: string) => formatInTimeZone(new Date(iso), "America/Chicago", "yyyy-MM-dd");

/** The picked day as a browser in `zone` holds it: local midnight there. */
const pickedIn = (day: string, zone: string) => fromZonedTime(`${day}T00:00:00`, zone);

/** A Date whose local fields are `day`, whatever zone the test runs in. */
const localDay = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const ZONES = [
  "Pacific/Honolulu",
  "America/Los_Angeles",
  "America/Chicago",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
];

describe("pickedDayToSubmissionDate", () => {
  it("sends noon UTC of the picked calendar day", () => {
    expect(pickedDayToSubmissionDate(localDay("2026-11-20"))).toBe("2026-11-20T12:00:00.000Z");
    expect(pickedDayToSubmissionDate(localDay("2027-01-01"))).toBe("2027-01-01T12:00:00.000Z");
  });

  it("publishes on the picked Central day in summer and winter", () => {
    for (const day of ["2026-07-04", "2026-11-20", "2027-03-14"]) {
      expect(centralDay(pickedDayToSubmissionDate(localDay(day)))).toBe(day);
    }
  });

  it("reads back as the picked day in every zone an organizer edits from", () => {
    const sent = pickedDayToSubmissionDate(localDay("2026-11-20"));
    for (const zone of ZONES) {
      expect(formatInTimeZone(new Date(sent), zone, "yyyy-MM-dd"), zone).toBe("2026-11-20");
    }
  });

  it("documents the old toISOString value: east of Central it published a day early", () => {
    // The form sent the picked day's browser-local midnight. Read in Central
    // that is the day before for every zone east of Central.
    expect(centralDay(pickedIn("2026-11-20", "America/Chicago").toISOString())).toBe("2026-11-20");
    expect(centralDay(pickedIn("2026-11-20", "America/New_York").toISOString())).toBe("2026-11-19");
    expect(centralDay(pickedIn("2026-11-20", "Europe/Berlin").toISOString())).toBe("2026-11-19");
  });
});

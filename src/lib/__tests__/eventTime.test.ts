/**
 * SEO-055: the one definition of an event's day, start time and run.
 */
import { describe, expect, it } from "vitest";
import {
  eventCentralDate,
  eventCentralEndDate,
  eventOverlapsDays,
  hasStatedStartTime,
  isMultiDay,
} from "@/lib/eventTime";
import { createEventSlugWithCentralTime, formatEventDateShort, hasSpecificTime } from "@/lib/timezone";

describe("eventCentralDate", () => {
  it("is the Central date, so 00:00 UTC in October is 7 pm the day before", () => {
    // The production rows behind SEO-055: Ringling Bros. at SeatGeek "2026-10-01-7-pm".
    expect(eventCentralDate({ event_start_utc: "2026-10-02T00:00:00+00:00" })).toBe("2026-10-01");
  });

  it("is 6 pm the day before in winter (CST)", () => {
    expect(eventCentralDate({ event_start_utc: "2026-11-07T00:00:00+00:00" })).toBe("2026-11-06");
  });

  it("agrees with the slug, which is a public URL and must not move", () => {
    const e = { title: "The Slaughterhouse Haunted House", event_start_utc: "2026-10-03T00:00:00+00:00" };
    expect(createEventSlugWithCentralTime(e.title, e)).toBe(
      `the-slaughterhouse-haunted-house-${eventCentralDate(e)}`,
    );
  });

  it("falls back to date and refuses garbage", () => {
    expect(eventCentralDate({ date: "2026-10-03T17:00:00Z" })).toBe("2026-10-03");
    expect(eventCentralDate({ date: "not a date" })).toBeNull();
    expect(eventCentralDate({})).toBeNull();
  });
});

describe("hasStatedStartTime", () => {
  it("prints a 7 pm start unless the row says the time is unknown", () => {
    expect(hasStatedStartTime({ event_start_utc: "2026-10-02T00:00:00Z" })).toBe(true);
    expect(hasStatedStartTime({ event_start_utc: "2026-10-02T00:00:00Z", time_tbd: true })).toBe(false);
  });

  it("treats the 19:31:58 Central marker as no time, in both DST states", () => {
    expect(hasStatedStartTime({ event_start_utc: "2026-10-03T00:31:58Z" })).toBe(false); // CDT
    expect(hasStatedStartTime({ event_start_utc: "2026-12-04T01:31:58Z" })).toBe(false); // CST
  });

  it("is what the site's display helpers use", () => {
    const tbd = { event_start_utc: "2026-10-02T00:00:00Z", time_tbd: true };
    expect(hasSpecificTime(tbd)).toBe(false);
    expect(formatEventDateShort(tbd)).toBe("Thu, Oct 1");
    expect(formatEventDateShort({ event_start_utc: "2026-10-02T00:00:00Z" })).toBe("Thu, Oct 1 @ 7:00 PM");
  });
});

describe("runs", () => {
  const ringling = { event_start_utc: "2026-10-02T00:00:00Z", end_date: "2026-10-04T22:00:00Z" };

  it("reads end_date in Central time", () => {
    expect(eventCentralEndDate(ringling)).toBe("2026-10-04");
    expect(isMultiDay(ringling)).toBe(true);
  });

  it("is not a run when end_date is missing or on the start day", () => {
    expect(isMultiDay({ event_start_utc: "2026-10-02T00:00:00Z" })).toBe(false);
    expect(isMultiDay({ event_start_utc: "2026-10-02T00:00:00Z", end_date: "2026-10-02T03:00:00Z" })).toBe(false);
  });

  it("overlaps every day from start through end, inclusive", () => {
    expect(eventOverlapsDays(ringling, "2026-10-02", "2026-10-04")).toBe(true);
    expect(eventOverlapsDays(ringling, "2026-10-04", "2026-10-04")).toBe(true);
    expect(eventOverlapsDays(ringling, "2026-10-05", "2026-10-07")).toBe(false);
    expect(eventOverlapsDays({ event_start_utc: "2026-10-02T00:00:00Z" }, "2026-10-02", "2026-10-04")).toBe(false);
  });
});

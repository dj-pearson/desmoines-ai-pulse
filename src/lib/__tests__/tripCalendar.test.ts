import { describe, it, expect } from "vitest";
import { buildEventsICS } from "@/lib/tripCalendar";

// plan-stay-pass2 WP1 item 6: the events builder the free trip calendar uses.

const STAMP = new Date("2026-09-25T12:00:00Z");

describe("buildEventsICS", () => {
  it("wraps entries in one calendar with CRLF lines", () => {
    const ics = buildEventsICS([], STAMP);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR")).toBe(true);
  });

  it("writes timed entries in UTC and escapes text", () => {
    const ics = buildEventsICS(
      [
        {
          kind: "timed",
          uid: "abc",
          title: "Jazz, Blues; and more",
          start: new Date("2026-10-09T23:00:00Z"),
          end: new Date("2026-10-10T01:00:00Z"),
          location: "Hoyt Sherman Place",
          url: "https://example.test/events/jazz",
        },
      ],
      STAMP,
    );
    expect(ics).toContain("DTSTART:20261009T230000Z");
    expect(ics).toContain("DTEND:20261010T010000Z");
    expect(ics).toContain("DTSTAMP:20260925T120000Z");
    expect(ics).toContain(String.raw`SUMMARY:Jazz\, Blues\; and more`);
    expect(ics).toContain("URL:https://example.test/events/jazz");
  });

  it("writes all-day entries with an exclusive end across a month boundary", () => {
    const ics = buildEventsICS([{ kind: "all-day", uid: "x", title: "Fair", firstDay: "2026-10-30", lastDay: "2026-10-31" }], STAMP);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261030");
    expect(ics).toContain("DTEND;VALUE=DATE:20261101");
  });
});

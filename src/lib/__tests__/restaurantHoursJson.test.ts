import { describe, it, expect } from "vitest";
import {
  getOpeningHoursSpecificationFromJson,
  resolveOpeningHoursSpecification,
} from "@/lib/restaurantHours";

/**
 * restaurants.hours_json is written by the edge functions and read here
 * (WEB-BE-045 AC4). These pin the two decisions the reader makes that a
 * crawler would act on.
 */
describe("getOpeningHoursSpecificationFromJson", () => {
  it("emits one entry per period, against the opening day", () => {
    const specs = getOpeningHoursSpecificationFromJson({
      periods: [
        { open: { day: 1, hour: 11, minute: 0 }, close: { day: 1, hour: 21, minute: 30 } },
        { open: { day: 2, hour: 11, minute: 0 }, close: { day: 2, hour: 21, minute: 0 } },
      ],
    });
    expect(specs).toEqual([
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday"], opens: "11:00", closes: "21:30" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Tuesday"], opens: "11:00", closes: "21:00" },
    ]);
  });

  it("keeps a midnight-crossing period on its OPENING day", () => {
    // Splitting "Friday 20:00 to Saturday 02:00" into two entries would
    // advertise Saturday 00:00-02:00 as a separate opening, which reads as
    // open on Saturday morning. schema.org has no cross-day form.
    const specs = getOpeningHoursSpecificationFromJson({
      periods: [{ open: { day: 5, hour: 20, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } }],
    });
    expect(specs).toEqual([
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Friday"], opens: "20:00", closes: "02:00" },
    ]);
  });

  it("drops a period with no close rather than publishing it open-ended", () => {
    // Places omits close for a 24-hour venue. Writing 00:00-23:59 would be a
    // claim about the venue rather than a transcription.
    expect(
      getOpeningHoursSpecificationFromJson({ periods: [{ open: { day: 0, hour: 0, minute: 0 } }] }),
    ).toBeNull();
  });

  it("returns null for anything unusable, so the caller omits the node", () => {
    expect(getOpeningHoursSpecificationFromJson(null)).toBeNull();
    expect(getOpeningHoursSpecificationFromJson(undefined)).toBeNull();
    expect(getOpeningHoursSpecificationFromJson({})).toBeNull();
    expect(getOpeningHoursSpecificationFromJson({ periods: [] })).toBeNull();
    expect(getOpeningHoursSpecificationFromJson({ periods: [{ close: { day: 1, hour: 9 } }] })).toBeNull();
    expect(getOpeningHoursSpecificationFromJson({ periods: [{ open: { day: 9, hour: 9 }, close: { day: 9, hour: 17 } }] })).toBeNull();
  });

  it("treats a zero hour as midnight, not as missing", () => {
    const specs = getOpeningHoursSpecificationFromJson({
      periods: [{ open: { day: 3, hour: 0, minute: 0 }, close: { day: 3, hour: 6, minute: 0 } }],
    });
    expect(specs?.[0].opens).toBe("00:00");
  });
});

describe("resolveOpeningHoursSpecification", () => {
  const hours = {
    periods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }],
  };

  it("prefers the structured column over the free text", () => {
    // The text says one thing and the column says another. The column is what
    // Google returned; the text is a best effort over a string nobody writes.
    const specs = resolveOpeningHoursSpecification(hours, "Mon-Fri 11am-10pm");
    expect(specs).toEqual([
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday"], opens: "09:00", closes: "17:00" },
    ]);
  });

  it("falls back to the free text while the column is absent", () => {
    // Every row is in this state until migration 20260919000009 is applied and
    // one nightly enrich run has been.
    const specs = resolveOpeningHoursSpecification(undefined, "Mon-Fri 11am-10pm");
    expect(specs).not.toBeNull();
    expect(specs?.[0].opens).toBe("11:00");
  });

  it("is null when neither source yields anything", () => {
    expect(resolveOpeningHoursSpecification(null, null)).toBeNull();
    expect(resolveOpeningHoursSpecification({ periods: [] }, "")).toBeNull();
    expect(resolveOpeningHoursSpecification(null, "call ahead")).toBeNull();
  });
});

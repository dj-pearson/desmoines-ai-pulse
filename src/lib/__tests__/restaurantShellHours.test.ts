import { describe, it, expect } from "vitest";
import { hoursDisplayLine, resolveOpeningHoursSpecification } from "@/lib/restaurantHours";

// SEO-054. functions/_middleware.ts printed `opening` raw as "Hours:" in the
// edge shell, and `opening` is a date column in production. The shell now
// prints hoursDisplayLine and publishes resolveOpeningHoursSpecification.
describe("edge shell hours", () => {
  const hoursJson = {
    version: 1,
    periods: [{ open: { day: 1, hour: 7, minute: 0 }, close: { day: 1, hour: 14, minute: 0 } }],
    weekdayDescriptions: ["Monday: 7:00 AM - 2:00 PM", "Sunday: Closed"],
  };

  it("never prints a date as hours", () => {
    expect(hoursDisplayLine(null, "2026-03-15")).toBeNull();
    expect(resolveOpeningHoursSpecification(null, "2026-03-15")).toBeNull();
  });

  it("prints Google's weekday lines and publishes their periods", () => {
    expect(hoursDisplayLine(hoursJson, "2026-03-15")).toBe("Monday: 7:00 AM - 2:00 PM; Sunday: Closed");
    expect(resolveOpeningHoursSpecification(hoursJson, "2026-03-15")).toEqual([
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday"], opens: "07:00", closes: "14:00" },
    ]);
  });

  it("falls back to real hours text", () => {
    expect(hoursDisplayLine(null, " Mon-Sat 11am-10pm ")).toBe("Mon-Sat 11am-10pm");
    expect(hoursDisplayLine({ weekdayDescriptions: [] }, null)).toBeNull();
  });
});

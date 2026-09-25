import { describe, it, expect } from "vitest";
import { countEventsByArea, weekendAreaLabel } from "@/lib/areaCounts";
import { NEIGHBORHOODS } from "@/lib/neighborhoods";

const ev = (city: string | null, venue: string | null = null, location: string | null = null) => ({
  city,
  venue,
  location,
});

describe("countEventsByArea", () => {
  it("counts with each area's own matchTerms, ignoring case", () => {
    const counts = countEventsByArea(
      [
        ev("ankeny"),
        ev("Des Moines", "East Village Pavilion"),
        ev("Des Moines", null, "412 Court Avenue"),
        ev("West Des Moines", "Valley Junction"),
        ev(null, null, null),
      ],
      NEIGHBORHOODS,
    );
    expect(counts.ankeny).toBe(1);
    expect(counts["east-village"]).toBe(2);
    expect(counts["west-des-moines"]).toBe(1);
  });

  it("counts an event once per area however many terms it matches", () => {
    const counts = countEventsByArea(
      [ev("Des Moines", "East Village stage", "Court Avenue")],
      [{ slug: "east-village", matchTerms: ["East Village", "Court Avenue"] }],
    );
    expect(counts["east-village"]).toBe(1);
  });

  it("returns every area, zero included", () => {
    const counts = countEventsByArea([], NEIGHBORHOODS);
    expect(Object.keys(counts).sort()).toEqual(NEIGHBORHOODS.map((n) => n.slug).sort());
    for (const n of NEIGHBORHOODS) expect(counts[n.slug]).toBe(0);
  });
});

describe("weekendAreaLabel", () => {
  it("names the count, with a + when the query was capped", () => {
    expect(weekendAreaLabel(14, false)).toBe("14 this weekend");
    expect(weekendAreaLabel(14, true)).toBe("14+ this weekend");
  });

  it("says nothing at zero or without a number", () => {
    expect(weekendAreaLabel(0, false)).toBeNull();
    expect(weekendAreaLabel(undefined, false)).toBeNull();
    expect(weekendAreaLabel(Number.NaN, true)).toBeNull();
  });
});

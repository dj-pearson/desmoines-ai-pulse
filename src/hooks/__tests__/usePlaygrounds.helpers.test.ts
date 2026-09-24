import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  escapeLike,
  formatMilesAway,
  pgArrayLiteral,
  PLAYGROUND_METRO_FILTER,
  sortByDistanceFrom,
  suburbFromLocation,
} from "@/hooks/usePlaygrounds";

describe("suburbFromLocation", () => {
  it("reads the suburb out of the Places shape, not the state/ZIP", () => {
    expect(suburbFromLocation("123 Main St, Ankeny, IA 50023, USA")).toBe("Ankeny");
    expect(suburbFromLocation("500 Grand Ave, West Des Moines, IA 50265")).toBe("West Des Moines");
  });

  it("handles the short street, city shape", () => {
    expect(suburbFromLocation("4000 SW 9th St, Des Moines")).toBe("Des Moines");
    expect(suburbFromLocation("Ankeny, IA")).toBe("Ankeny");
  });

  it("strips a state and ZIP glued to the city", () => {
    expect(suburbFromLocation("12 Elm St, Clive IA 50325")).toBe("Clive");
  });

  it("offers no suburb it cannot read", () => {
    expect(suburbFromLocation(null)).toBeNull();
    expect(suburbFromLocation("")).toBeNull();
    expect(suburbFromLocation("Gray's Lake Park")).toBeNull();
    expect(suburbFromLocation("IA 50023, USA")).toBeNull();
    expect(suburbFromLocation("Park, 123 Main St")).toBeNull();
  });

  it("returns a substring of the input, so the ilike filter always matches its own row", () => {
    const inputs = [
      "123 Main St, Ankeny, IA 50023, USA",
      "12 Elm St, Clive IA 50325",
      "Jester Park, Granger",
    ];
    for (const loc of inputs) {
      const s = suburbFromLocation(loc);
      expect(s).not.toBeNull();
      expect(loc.toLowerCase()).toContain((s as string).toLowerCase());
    }
  });
});

describe("pgArrayLiteral", () => {
  it("quotes each element so spaces and commas survive", () => {
    expect(pgArrayLiteral(["Splash Pad", "Swings"])).toBe('{"Splash Pad","Swings"}');
    expect(pgArrayLiteral(["a,b"])).toBe('{"a,b"}');
  });

  it("escapes quotes and backslashes", () => {
    expect(pgArrayLiteral(['say "hi"'])).toBe('{"say \\"hi\\""}');
    expect(pgArrayLiteral(["a\\b"])).toBe('{"a\\\\b"}');
  });
});

describe("escapeLike", () => {
  it("escapes LIKE wildcards", () => {
    expect(escapeLike("50%_off")).toBe("50\\%\\_off");
    expect(escapeLike("West Des Moines")).toBe("West Des Moines");
  });
});

describe("PLAYGROUND_METRO_FILTER", () => {
  it("keeps rows with no coordinates", () => {
    expect(PLAYGROUND_METRO_FILTER).toContain("latitude.is.null");
    expect(PLAYGROUND_METRO_FILTER).toContain("longitude.is.null");
    expect(PLAYGROUND_METRO_FILTER.startsWith("and(latitude.gte.")).toBe(true);
  });
});

describe("sortByDistanceFrom", () => {
  it("sorts nearest first and puts unplaced rows last", () => {
    const from = { latitude: 41.5868, longitude: -93.625 };
    const rows = [
      { id: "far", latitude: 41.73, longitude: -93.6 },
      { id: "none", latitude: null, longitude: null },
      { id: "near", latitude: 41.59, longitude: -93.63 },
    ];
    const out = sortByDistanceFrom(rows, from);
    expect(out.map((r) => r.id)).toEqual(["near", "far", "none"]);
    expect(out[0].distanceMiles).toBeLessThan(1);
    expect(out[2].distanceMiles).toBeNull();
  });
});

describe("formatMilesAway", () => {
  it("uses one decimal under ten miles", () => {
    expect(formatMilesAway(1.234)).toBe("1.2 mi away");
    expect(formatMilesAway(12.6)).toBe("13 mi away");
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { DIETS, dietFromParam, dietOrClause } from "@/hooks/useDietaryRestaurants";
import { breweryVenueClause } from "@/hooks/useBreweryTrail";

describe("dietFromParam", () => {
  it("resolves each of the six diets", () => {
    for (const d of DIETS) expect(dietFromParam(d.id)?.id).toBe(d.id);
  });

  it("treats an unknown, empty or missing slug as no diet", () => {
    expect(dietFromParam("foo")).toBeNull();
    expect(dietFromParam("")).toBeNull();
    expect(dietFromParam(null)).toBeNull();
    expect(dietFromParam("undefined")).toBeNull();
  });

  it("ignores case and surrounding space", () => {
    expect(dietFromParam(" Vegan ")?.id).toBe("vegan");
  });
});

describe("dietOrClause", () => {
  it("matches every keyword against name, cuisine and description", () => {
    const keto = dietFromParam("keto");
    expect(keto).not.toBeNull();
    const clause = dietOrClause(keto!);
    for (const k of keto!.keywords) {
      expect(clause).toContain(`description.ilike.%${k}%`);
      expect(clause).toContain(`name.ilike.%${k}%`);
      expect(clause).toContain(`cuisine.ilike.%${k}%`);
    }
  });
});

describe("breweryVenueClause", () => {
  it("builds one venue ilike per distinct name", () => {
    expect(breweryVenueClause(["Exile Brewing", "Exile Brewing", "Confluence Brewing"])).toBe(
      "venue.ilike.%Confluence Brewing%,venue.ilike.%Exile Brewing%",
    );
  });

  it("strips characters that would end or group the or clause", () => {
    const clause = breweryVenueClause(["Fox Brewing, Inc. (West)"]);
    expect(clause).toBe("venue.ilike.%Fox Brewing Inc. West%");
  });

  it("escapes LIKE wildcards in a name", () => {
    expect(breweryVenueClause(["100% Hops"])).toBe("venue.ilike.%100\\% Hops%");
  });

  it("returns null when no usable name is left", () => {
    expect(breweryVenueClause([])).toBeNull();
    expect(breweryVenueClause(["", "()"])).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import {
  PLAYGROUND_SELECTION_RULE,
  buildPlaygroundHubSections,
  playgroundHubDescription,
  playgroundHubLead,
  rankPlaygrounds,
  splashPadReason,
  toddlerReason,
  type PlaygroundHubRow,
} from "@/lib/playgroundHub";

let n = 0;
function row(p: Partial<PlaygroundHubRow> & { name: string }): PlaygroundHubRow {
  n += 1;
  return { id: `id-${n}`, location: null, description: null, age_range: null, amenities: null, ...p };
}

describe("splashPadReason", () => {
  it("quotes the amenity that names a splash pad or sprayground", () => {
    expect(splashPadReason(row({ name: "Chesterfield", amenities: ["2 Toddler bucket swings", "Sprayground"] }))).toBe("Sprayground");
    expect(splashPadReason(row({ name: "Union", amenities: ["spray ground with zero depth entry"] }))).toBe(
      "spray ground with zero depth entry",
    );
    expect(splashPadReason(row({ name: "Ashby", amenities: ["Splash pool"] }))).toBe("Splash pool");
  });

  it("falls back to the description", () => {
    expect(
      splashPadReason(
        row({ name: "Greenwood - Ashworth Park", description: "Public recreation area with playgrounds, a splash pad & picnic shelters." }),
      ),
    ).toBe("Description mentions a splash pad");
  });

  it("does not count a wading pool or a water play area", () => {
    expect(splashPadReason(row({ name: "Ashfield", amenities: ["Wading pool"] }))).toBeNull();
    expect(splashPadReason(row({ name: "Union 2", description: "carousel, water play area, BBQ grills" }))).toBeNull();
  });
});

describe("toddlerReason", () => {
  it("takes toddler equipment from amenities", () => {
    expect(toddlerReason(row({ name: "Burke", age_range: "All ages", amenities: ["2 Toddler bucket swings"] }))).toBe(
      "2 Toddler bucket swings",
    );
  });

  it("takes a preschool age range", () => {
    expect(toddlerReason(row({ name: "Walker Johnston", age_range: "Preschool and older" }))).toBe(
      "Listed for ages: Preschool and older",
    );
    expect(toddlerReason(row({ name: "Jester", age_range: "Under 5 and up" }))).toBe("Listed for ages: Under 5 and up");
    expect(toddlerReason(row({ name: "Fixture", age_range: "2-5" }))).toBe("Listed for ages: 2-5");
  });

  it("does not read All ages or an older range as toddler", () => {
    expect(toddlerReason(row({ name: "A", age_range: "All ages" }))).toBeNull();
    expect(toddlerReason(row({ name: "B", age_range: "5-12" }))).toBeNull();
    expect(toddlerReason(row({ name: "C", age_range: "10-12" }))).toBeNull();
  });
});

describe("rankPlaygrounds (the stated selection rule)", () => {
  it("ranks by amenity count, then by name, and drops rows with none", () => {
    const picks = [
      { row: row({ name: "Beta" }), featureCount: 4, reason: "" },
      { row: row({ name: "Alpha" }), featureCount: 4, reason: "" },
      { row: row({ name: "Gamma" }), featureCount: 10, reason: "" },
      { row: row({ name: "Empty" }), featureCount: 0, reason: "" },
    ];
    expect(rankPlaygrounds(picks).map((p) => p.row.name)).toEqual(["Gamma", "Alpha", "Beta"]);
    expect(rankPlaygrounds(picks, 2).map((p) => p.row.name)).toEqual(["Gamma", "Alpha"]);
  });

  it("says on the page what the code does", () => {
    expect(PLAYGROUND_SELECTION_RULE).toMatch(/how many amenities/);
    expect(PLAYGROUND_SELECTION_RULE).toMatch(/then by name/);
    expect(PLAYGROUND_SELECTION_RULE).toMatch(/no amenities recorded is not ranked/);
  });
});

describe("buildPlaygroundHubSections", () => {
  const rows = [
    row({ name: "Miracle Park", age_range: "All ages", amenities: Array.from({ length: 10 }, (_, i) => `a${i}`) }),
    row({ name: "Union Park", age_range: "All ages", amenities: ["Sprayground", "bathrooms", "carousel"] }),
    row({ name: "Chesterfield", age_range: "All ages", amenities: ["2 Toddler bucket swings", "Sprayground", "Futsal court", "Table tennis", "court"] }),
    row({ name: "Walker Johnston", age_range: "Preschool and older", amenities: ["slide", "swings", "rope bridges", "nets", "path", "story walk"] }),
    row({ name: "Colby Park" }),
    row({ name: "Greenwood", description: "a splash pad & picnic shelters" }),
  ];
  const s = buildPlaygroundHubSections(rows, 3);

  it("ranks toddler picks by the rule", () => {
    expect(s.toddlers.map((p) => p.row.name)).toEqual(["Walker Johnston", "Chesterfield"]);
    expect(s.toddlerTotal).toBe(2);
  });

  it("does not repeat a toddler pick under all ages", () => {
    expect(s.allAges.map((p) => p.row.name)).toEqual(["Miracle Park", "Union Park"]);
    expect(s.allAges[0].reason).toBe("10 amenities listed");
  });

  it("lists every splash pad by name, including one only the description names", () => {
    expect(s.splashPads.map((p) => p.row.name)).toEqual(["Chesterfield", "Greenwood", "Union Park"]);
    expect(s.splashTotal).toBe(3);
  });

  it("leads with counts of what it lists", () => {
    expect(playgroundHubLead(48, s)).toBe(
      "48 playgrounds across the Des Moines metro: 3 list a splash pad or sprayground, and 2 list toddler equipment or a preschool age range.",
    );
    expect(playgroundHubLead(0, s)).toBeNull();
    expect(playgroundHubLead(5, { splashTotal: 0, toddlerTotal: 0 })).toBe(
      "5 playgrounds across the Des Moines metro.",
    );
  });

  it("describes the page in the searcher's words, within 160 characters", () => {
    const d = playgroundHubDescription(48, s);
    expect(d).toBe(
      "48 playgrounds across the Des Moines metro, with the best picks by age, 3 splash pads and spraygrounds and directions to each.",
    );
    expect(d!.length).toBeLessThanOrEqual(160);
    expect(playgroundHubDescription(4, { toddlers: [], allAges: [], splashTotal: 1 })).toBe(
      "4 playgrounds across the Des Moines metro, with 1 splash pad or sprayground and directions to each.",
    );
    expect(playgroundHubDescription(0, s)).toBeNull();
  });
});

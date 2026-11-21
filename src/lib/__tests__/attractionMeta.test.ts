import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ATTRACTION_DESCRIPTION_BUDGET,
  ATTRACTION_TITLE_BUDGET,
  attractionLocality,
  attractionMetaDescription,
  attractionPageTitle,
} from "@/lib/attractionMeta";

// Shapes from public.attractions as recorded in
// scripts/content-backups/seo-046 (location after fix-addresses.sql).
const adventureland = {
  name: "Adventureland Resort",
  type: "Entertainment",
  location: "3200 Adventureland Drive, Altoona, IA 50009",
  description: "Features waterslides and family entertainment",
};
const artCenter = {
  name: "Des Moines Art Center",
  type: "Museum",
  location: "4700 Grand Ave, Des Moines, Iowa",
  description:
    "Art museum featuring rotating exhibits, permanent collections including works by Matisse and Hopper, and the Pappajohn Sculpture Park downtown.",
};
const dogPark = { name: "17th Avenue Dog Park", type: "Park", location: "851 17th Avenue Southwest", description: "Dog park" };
const zoo = {
  name: "Blank Park Zoo",
  type: "Zoo",
  location: "7401 SW 9th Street, Des Moines, IA 50315",
  description: "A zoo featuring various animals",
};

describe("attractionLocality", () => {
  it.each([
    ["3200 Adventureland Drive, Altoona, IA 50009", "Altoona"],
    ["4700 Grand Ave, Des Moines, Iowa", "Des Moines"],
    ["50 309, 1 Line Drive, Des Moines, Iowa", "Des Moines"],
    ["1330 Grand Avenue, Des Moines", "Des Moines"],
  ])("reads the city from %s", (location, city) => {
    expect(attractionLocality(location)).toBe(city);
  });

  it.each([
    ["851 17th Avenue Southwest"],
    ["7700 University Avenue, Suite C"],
    ["Historic Court District, Des Moines"],
    ["East of Des Moines River, Downtown Des Moines"],
    ["Downtown Des Moines"],
    [""],
  ])("names no city for %j", (location) => {
    expect(attractionLocality(location)).toBeNull();
  });

  it("is null for a null location", () => {
    expect(attractionLocality(null)).toBeNull();
  });
});

describe("attractionPageTitle", () => {
  it("names the city the address names, not Des Moines", () => {
    expect(attractionPageTitle(adventureland)).toBe("Adventureland Resort: Entertainment in Altoona, Iowa");
  });

  it("says 'Des Moines Area' when the address names no city", () => {
    expect(attractionPageTitle(dogPark)).toBe("17th Avenue Dog Park in the Des Moines Area");
  });

  it("drops the type when the name already says it", () => {
    expect(attractionPageTitle(zoo)).toBe("Blank Park Zoo in Des Moines, Iowa");
    expect(attractionPageTitle(artCenter)).toBe("Des Moines Art Center: Museum in Des Moines, Iowa");
  });

  it("stays inside the budget for a long name", () => {
    const row = {
      name: "Prairie Meadows Racetrack, Casino, and Hotel",
      type: "Entertainment",
      location: "1 Prairie Meadows Drive, Altoona, IA 50009",
    };
    const title = attractionPageTitle(row);
    expect(title.length).toBeLessThanOrEqual(ATTRACTION_TITLE_BUDGET);
    expect(title).toBe("Prairie Meadows Racetrack, Casino, and Hotel, Altoona");
  });

  it("clips a name that cannot fit on its own", () => {
    const title = attractionPageTitle({ name: "A ".repeat(40) + "Very Long Attraction Name", type: "Park" });
    expect(title.length).toBeLessThanOrEqual(ATTRACTION_TITLE_BUDGET);
    expect(title.endsWith("...")).toBe(true);
  });
});

describe("attractionMetaDescription", () => {
  it("is more than the two-word description column", () => {
    const d = attractionMetaDescription(dogPark);
    expect(d).toBe(
      "17th Avenue Dog Park is a park in the Des Moines area. Hours, directions and events nearby.",
    );
  });

  it("places an Altoona row in Altoona", () => {
    const d = attractionMetaDescription(adventureland);
    expect(d).toContain("in Altoona, Iowa.");
    expect(d).toContain("Features waterslides and family entertainment.");
    expect(d).not.toMatch(/in Des Moines/);
  });

  it("clips a long description at a word, inside the budget", () => {
    const d = attractionMetaDescription(artCenter);
    expect(d.length).toBeLessThanOrEqual(ATTRACTION_DESCRIPTION_BUDGET);
    expect(d.startsWith("Des Moines Art Center is a museum in Des Moines, Iowa. Art museum featuring")).toBe(true);
    expect(d.endsWith("...")).toBe(true);
    expect(d).not.toMatch(/\s\S{1,2}\.\.\.$/);
  });

  it("says free only when is_free says so", () => {
    expect(attractionMetaDescription({ ...zoo, is_free: true })).toContain("Free admission.");
    expect(attractionMetaDescription({ ...zoo, is_free: false })).not.toMatch(/free/i);
    expect(attractionMetaDescription({ ...zoo, is_free: null })).not.toMatch(/free/i);
  });

  it("uses 'an' before a vowel and 'attraction' when the row has no type", () => {
    expect(attractionMetaDescription({ name: "Adventureland", type: "Amusement Park" })).toMatch(
      /^Adventureland is an amusement park in the Des Moines area\./,
    );
    expect(attractionMetaDescription({ name: "Somewhere", type: null })).toMatch(/^Somewhere is an attraction /);
  });
});

describe("the attraction page uses these, not its own strings", () => {
  // The inline versions were the defect: "in Des Moines, Iowa" for every row
  // and description.slice(0, 160). Reading the source keeps a second copy
  // from coming back.
  it("AttractionDetails passes the helpers to SEOHead", () => {
    const src = readFileSync("src/pages/AttractionDetails.tsx", "utf8");
    expect(src).toContain("title={attractionPageTitle(attraction)}");
    expect(src).toContain("description={attractionMetaDescription(attraction)}");
    expect(src).not.toMatch(/description\.slice\(0, 160\)/);
  });

  it("EnhancedAttractionSEO names the WebPage with the same title", () => {
    const src = readFileSync("src/components/EnhancedAttractionSEO.tsx", "utf8");
    expect(src).toContain("attractionPageTitle(attraction)");
    expect(src).not.toContain("| Things to Do");
  });
});

import { describe, it, expect } from "vitest";
import {
  PLAYGROUND_TITLE_BUDGET,
  playgroundAgeText,
  playgroundTitle,
  playgroundTitleFacets,
} from "@/lib/playgroundMeta";

// Rows below are production rows as of 2026-10-01 (SEO-042), trimmed to the
// columns the title reads.

describe("playgroundTitleFacets", () => {
  it("reads shade and restrooms from amenities when the columns are null", () => {
    expect(
      playgroundTitleFacets({
        name: "Ashley Okland Star Playground at Ewing Park",
        amenities: ["adaptive playground equipment", "bathrooms", "shaded areas"],
        has_shade: null,
        has_restrooms: null,
      }),
    ).toEqual({ equipment: true, shade: true, restrooms: true });
  });

  it("treats a null column as unknown, not yes", () => {
    expect(playgroundTitleFacets({ name: "Colby Park", amenities: null })).toEqual({
      equipment: false,
      shade: false,
      restrooms: false,
    });
  });

  it("lets a true column stand on its own", () => {
    expect(
      playgroundTitleFacets({ name: "X", amenities: [], has_shade: true, has_restrooms: true }),
    ).toEqual({ equipment: false, shade: true, restrooms: true });
  });

  it("does not read shade out of an unrelated word", () => {
    expect(playgroundTitleFacets({ name: "X", amenities: ["shadetree climbing"] }).shade).toBe(false);
  });
});

describe("playgroundTitle", () => {
  it("builds {Park} Playground, {City}: words", () => {
    expect(
      playgroundTitle({
        name: "Riverview Park",
        location: "710 Corning Ave., Des Moines, IA 50313",
        amenities: ["zipline swing", "climbing features"],
      }),
    ).toBe("Riverview Park Playground, Des Moines: Equipment");
  });

  it("names shade and restrooms only when the row backs them", () => {
    expect(
      playgroundTitle({
        name: "Terra Park",
        location: "6400 Pioneer Pkwy, Johnston, IA 50131",
        amenities: ["climbing structures", "sun shades"],
      }),
    ).toBe("Terra Park Playground, Johnston: Equipment, Shade");
  });

  it("does not add Playground when the name already says it", () => {
    expect(
      playgroundTitle({
        name: "Big Creek State Park Playground",
        location: "8794 NW 125th Ave., Polk City, IA 50222",
        amenities: ["wooden structures"],
      }),
    ).toBe("Big Creek State Park Playground, Polk City: Equipment");
    expect(
      playgroundTitle({
        name: "Jester Park Natural Playscape",
        location: "12130 NW 128th St., Granger, IA 50109",
        amenities: ["gravel paths"],
      }),
    ).toBe("Jester Park Natural Playscape, Granger: Equipment");
  });

  it("leaves the city out when the name already has it", () => {
    expect(
      playgroundTitle({ name: "Polk City Town Square Playground", location: "Polk City, IA 50226, USA" }),
    ).toBe("Polk City Town Square Playground");
  });

  it("invents no city when the location names none", () => {
    // "5300 Indianola Ave Des Moines, IA" has no comma before the city, and
    // suburbFromLocation will not guess.
    expect(
      playgroundTitle({ name: "Union Park", location: "209 Saylor Rd Des Moines, IA", amenities: ["bathrooms"] }),
    ).toBe("Union Park Playground: Equipment, Restrooms");
  });

  it("drops Equipment, then Shade, before it drops the city", () => {
    const title = playgroundTitle({
      name: "Ashley Okland Star Playground at Ewing Park",
      location: "5300 Indianola Ave, Des Moines, IA",
      amenities: ["adaptive playground equipment", "bathrooms", "shaded areas"],
    });
    expect(title).toBe("Ashley Okland Star Playground at Ewing Park: Restrooms");
    expect(title.length).toBeLessThanOrEqual(PLAYGROUND_TITLE_BUDGET);
  });

  it("keeps the city and Restrooms when they fit", () => {
    expect(
      playgroundTitle({
        name: "Miracle Park All-Inclusive",
        location: "310 NW School St., Ankeny, IA 50023",
        amenities: ["slides", "bathrooms", "sun shades"],
      }),
    ).toBe("Miracle Park All-Inclusive Playground, Ankeny: Restrooms");
    expect(
      playgroundTitle({
        // Synthetic: no production row has all three and a short name yet.
        name: "Bates Park",
        location: "330 Clark St, Clive, IA",
        amenities: ["slides", "bathrooms", "sun shades"],
      }),
    ).toBe("Bates Park Playground, Clive: Equipment, Shade, Restrooms");
  });

  it("keeps the city over Equipment alone", () => {
    expect(
      playgroundTitle({
        name: "Ironwood Park (Pirate Ship Park)",
        location: "2380 3rd Ave. SW, Altoona, IA 50009",
        amenities: ["pirate ship structure", "slides"],
      }),
    ).toBe("Ironwood Park (Pirate Ship Park) Playground, Altoona");
  });

  it("never exceeds the budget unless the bare name does", () => {
    const rows = [
      { name: "Ironwood Park (Pirate Ship Park)", location: "2380 3rd Ave. SW, Altoona, IA 50009", amenities: ["slides"] },
      { name: "Easter Lake Park Shelter #1 Playground", location: "Des Moines, IA 50320, USA" },
      { name: "Kids Empire Jordan Creek", location: "6805 Mills Civic Pkwy, West Des Moines, IA 50266, USA" },
    ];
    for (const r of rows) expect(playgroundTitle(r).length).toBeLessThanOrEqual(PLAYGROUND_TITLE_BUDGET);
    const long = { name: "A".repeat(70) };
    expect(playgroundTitle(long)).toBe(`${"A".repeat(70)} Playground`);
  });
});

describe("playgroundAgeText", () => {
  it("reads All ages as a phrase", () => {
    expect(playgroundAgeText("All ages")).toBe("Listed for all ages.");
    expect(playgroundAgeText("Preschool and older")).toBe("Listed for ages Preschool and older.");
    expect(playgroundAgeText(null)).toBeNull();
    expect(playgroundAgeText("  ")).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DES_MOINES_METRO_BOUNDS, isInMetro } from "@/lib/geo";

/**
 * WEB-SEO-037. `playgrounds` holds 69 rows and 21 are in Oregon, Washington,
 * Colorado and Missouri - a Google Places import that went wide - and nothing
 * on the hub, the hook, the detail page or the sitemap generator filtered
 * them. A third of the URLs on what SEO-014 calls the site's best-performing
 * module pointed at parks a Des Moines reader cannot visit.
 *
 * The box is the fix, and it is deliberately loose: a sanity bound, not a
 * service-area definition.
 */
describe("the Des Moines metro box", () => {
  it.each([
    ["Des Moines", 41.5868, -93.625],
    ["Ankeny", 41.7317, -93.6001],
    ["Waukee", 41.6072, -93.8852],
    ["Altoona", 41.6444, -93.4647],
    ["Indianola", 41.3581, -93.5575],
    ["West Des Moines", 41.5772, -93.7113],
  ])("keeps %s", (_name, lat, lng) => {
    expect(isInMetro(lat, lng)).toBe(true);
  });

  it.each([
    ["Portland OR", 45.5152, -122.6784],
    ["Seattle WA", 47.6062, -122.3321],
    ["Denver CO", 39.7392, -104.9903],
    ["Kansas City MO", 39.0997, -94.5786],
    ["St. Louis MO", 38.627, -90.1994],
  ])("drops %s", (_name, lat, lng) => {
    expect(isInMetro(lat, lng)).toBe(false);
  });

  it("drops Ames, which is not the metro", () => {
    // The box's nearest real edge case. If this starts passing, the box grew.
    expect(isInMetro(42.0308, -93.6319)).toBe(false);
  });

  it("keeps a row with no coordinates", () => {
    // A hand-curated park added without a lat/lng. Dropping a row for missing
    // data would hide it; the 21 strays came from an import that supplies
    // coordinates, so they are not what this ambiguity protects.
    expect(isInMetro(null, null)).toBe(true);
    expect(isInMetro(41.58, null)).toBe(true);
    expect(isInMetro(undefined, undefined)).toBe(true);
  });
});

describe("the hub's server-side filter", () => {
  const hook = readFileSync("src/hooks/usePlaygrounds.ts", "utf8");

  it("filters in the QUERY, not after the fetch", () => {
    // A client-side filter would still page through out-of-state rows and
    // report them in totalCount, so the count under the grid would disagree
    // with the grid.
    expect(hook).toMatch(/query = query\.or\(/);
  });

  it("carries the null arms, or a row with no coordinates vanishes", () => {
    // PostgREST has no "coalesce to true": a .gte against a null column
    // excludes the row silently. The or() has to say so explicitly, and this
    // is the assertion that catches someone simplifying it to two .gte calls.
    expect(hook).toContain("latitude.is.null");
    expect(hook).toContain("longitude.is.null");
  });

  it("builds the bounds from the shared constant", () => {
    // Not a second copy of four numbers. The generator uses isInMetro over the
    // same values, and the two have to agree or the sitemap and the hub list
    // different sets.
    expect(hook).toContain("DES_MOINES_METRO_BOUNDS");
    expect(DES_MOINES_METRO_BOUNDS.minLatitude).toBeLessThan(DES_MOINES_METRO_BOUNDS.maxLatitude);
    expect(DES_MOINES_METRO_BOUNDS.minLongitude).toBeLessThan(DES_MOINES_METRO_BOUNDS.maxLongitude);
  });
});

describe("the detail pages refuse what the hub hides", () => {
  it("PlaygroundDetails treats an out-of-metro row as not found", () => {
    const page = readFileSync("src/pages/PlaygroundDetails.tsx", "utf8");
    expect(page).toMatch(/const outsideMetro = .*isInMetro\(/s);
    expect(page).toContain("error || !playground || outsideMetro");
  });

  it("AttractionDetails treats an inactive row as not found", () => {
    // useAttractions and functions/_middleware.ts both filter is_active and
    // this page did not, so an attraction taken off the site kept a live,
    // indexable URL.
    const page = readFileSync("src/pages/AttractionDetails.tsx", "utf8");
    expect(page).toContain("attraction?.is_active === false");
    expect(page).toContain("error || !attraction || inactive");
  });
});

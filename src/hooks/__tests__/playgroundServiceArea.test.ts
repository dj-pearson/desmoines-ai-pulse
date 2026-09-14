/**
 * WEB-SEO-037: the public playground list drops rows that are not in Iowa;
 * admin surfaces keep them.
 *
 * Tests the predicate against the shapes usePlaygrounds and
 * usePlaygroundFacets apply it to, rather than mounting React Query - the fork
 * that matters is which rows survive, and that is a pure function of the row's
 * location plus one flag.
 */
import { describe, it, expect } from "vitest";
import { isOutsideIowa } from "@/lib/serviceArea";

/** A slice of the real table: the wide Places import plus local rows. */
const ROWS = [
  { name: "Ashby Park", location: "3600 Ashby Ave, Des Moines, IA 50310" },
  { name: "Orange City Park", location: "210 Central Ave, Orange City, IA 51041" },
  { name: "Ankeny Playground", location: "1234 Main St, Ankeny" },
  { name: "Laurelhurst Park", location: "3756 SE Oak St, Portland, OR 97214" },
  { name: "Cal Anderson Park", location: "1635 11th Ave, Seattle, WA 98122" },
  { name: "City Park", location: "Denver, Colorado" },
  { name: "Loose Park", location: "5200 Wornall Rd, Kansas City, MO 64112" },
];

function publicList(rows: typeof ROWS, includeOutsideServiceArea = false) {
  return includeOutsideServiceArea
    ? rows
    : rows.filter((r) => !isOutsideIowa(r.location));
}

describe("WEB-SEO-037 playground service area", () => {
  it("hides out-of-state rows from the public list", () => {
    expect(publicList(ROWS).map((r) => r.name)).toEqual([
      "Ashby Park",
      "Orange City Park",
      "Ankeny Playground",
    ]);
  });

  it("keeps every row for an admin surface", () => {
    expect(publicList(ROWS, true)).toHaveLength(ROWS.length);
  });

  it("derives totalCount from the filtered set, not the server count", () => {
    // The server counts all 7; the public list must not claim 7.
    const serverCount = ROWS.length;
    const filtered = publicList(ROWS);
    expect(filtered.length).toBe(3);
    expect(filtered.length).not.toBe(serverCount);
  });

  it("keeps suburb facets free of out-of-state cities", () => {
    const suburbs = new Set(
      publicList(ROWS).map((r) => {
        const parts = r.location.split(",");
        return parts[parts.length - 2]?.trim() || parts[0]?.trim();
      }),
    );
    expect(suburbs.has("Portland")).toBe(false);
    expect(suburbs.has("Seattle")).toBe(false);
    expect(suburbs.has("Des Moines")).toBe(true);
  });
});

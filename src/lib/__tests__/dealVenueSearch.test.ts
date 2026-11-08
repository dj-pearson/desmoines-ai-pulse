import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * WEB-FEAT-071: the DealManager venue picker does not offer a merged
 * duplicate restaurant. A deal linked to one stayed on the duplicate, so the
 * kept restaurant's Deals section never listed it.
 */
const calls: Array<[string, ...unknown[]]> = [];
let result: { data: unknown; error: unknown } = { data: [], error: null };

vi.mock("@/integrations/supabase/client", () => {
  function builder(table: string) {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "ilike", "not", "order", "limit"]) {
      b[m] = (...args: unknown[]) => {
        calls.push([`${table}.${m}`, ...args]);
        return b;
      };
    }
    b.then = (resolve: (v: unknown) => unknown) => resolve(result);
    return b;
  }
  return { supabase: { from: (table: string) => builder(table) } };
});

import { escapeIlike, searchDealVenues } from "@/lib/dealVenueSearch";

beforeEach(() => {
  calls.length = 0;
  result = { data: [], error: null };
});

describe("searchDealVenues", () => {
  it("leaves merged restaurants out of the restaurant search", async () => {
    await searchDealVenues("restaurant", "noce");
    expect(calls).toContainEqual(["restaurants.not", "is_merged", "is", true]);
    // The filter is part of the query, not applied to the 8 rows that come back,
    // so a merged match cannot take a live one's slot.
    const notAt = calls.findIndex((c) => c[0] === "restaurants.not");
    const limitAt = calls.findIndex((c) => c[0] === "restaurants.limit");
    expect(notAt).toBeGreaterThan(-1);
    expect(notAt).toBeLessThan(limitAt);
  });

  it("does not filter attractions or hotels on a column they lack", async () => {
    await searchDealVenues("attraction", "zoo");
    await searchDealVenues("hotel", "hyatt");
    expect(calls.some((c) => c[0].endsWith(".not"))).toBe(false);
    expect(calls).toContainEqual(["hotels.select", "id, name, city"]);
  });

  it("maps rows to options and drops rows without a name", async () => {
    result = {
      data: [
        { id: "r1", name: "Noce", location: "1326 Walnut St" },
        { id: "r2", name: null, location: null },
      ],
      error: null,
    };
    await expect(searchDealVenues("restaurant", "  noce ")).resolves.toEqual([
      { id: "r1", name: "Noce", place: "1326 Walnut St" },
    ]);
    expect(calls).toContainEqual(["restaurants.ilike", "name", "%noce%"]);
  });

  it("does not query for an unlinkable type or a one-letter term", async () => {
    await expect(searchDealVenues("event", "jazz")).resolves.toEqual([]);
    await expect(searchDealVenues("restaurant", "n")).resolves.toEqual([]);
    expect(calls).toEqual([]);
  });

  it("throws the query error for the caller's handleError", async () => {
    result = { data: null, error: new Error("boom") };
    await expect(searchDealVenues("restaurant", "noce")).rejects.toThrow("boom");
  });
});

describe("escapeIlike", () => {
  it("escapes ilike wildcards so a name matches itself", () => {
    expect(escapeIlike("100% Pure_Bar\\")).toBe("100\\% Pure\\_Bar\\\\");
  });
});

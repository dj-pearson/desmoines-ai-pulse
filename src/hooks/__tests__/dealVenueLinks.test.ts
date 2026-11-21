import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * WEB-FEAT-069: a deal curated against a restaurant that was later merged
 * into another row links to the kept row. The duplicate's page only
 * redirects there, and the kept row's Deals section lists deals by its own
 * id, so the old link sent the visitor to a page without the deal.
 */
const calls: Array<[string, ...unknown[]]> = [];
const queued: Record<string, Array<{ data: unknown; error: unknown }>> = {};
const handleError = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  function builder(table: string) {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "in"]) {
      b[m] = (...args: unknown[]) => {
        calls.push([`${table}.${m}`, ...args]);
        return b;
      };
    }
    b.then = (resolve: (v: unknown) => unknown) =>
      resolve(queued[table]?.shift() ?? { data: [], error: null });
    return b;
  }
  return { supabase: { from: (table: string) => builder(table) } };
});
vi.mock("@/lib/errorHandler", () => ({ handleError: (...a: unknown[]) => handleError(...a) }));

import { fetchDealVenueLinks, restaurantVenueLinks, type Deal } from "@/hooks/useDeals";
import { DEAL_VENUE_RESTAURANT_COLUMNS } from "@/lib/listColumns";

function deal(entity_id: string, entity_type = "restaurant"): Deal {
  return {
    id: `d-${entity_id}`,
    title: "Half-price drafts",
    description: null,
    business_name: "Noce",
    entity_type,
    entity_id,
    deal_type: "percentage",
    discount_value: null,
    code: null,
    terms: null,
    start_date: "2026-01-01T00:00:00Z",
    end_date: null,
    image_url: null,
    is_featured: false,
    created_at: "2026-01-01T00:00:00Z",
  };
}

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(queued)) delete queued[k];
  handleError.mockReset();
});

describe("restaurantVenueLinks", () => {
  it("links an unmerged restaurant to its own slug, falling back to its id", () => {
    expect(
      restaurantVenueLinks([
        { id: "r1", slug: "noce", is_merged: false, merged_into: null },
        { id: "r2", slug: null },
      ]),
    ).toEqual({ "restaurant:r1": "/restaurants/noce", "restaurant:r2": "/restaurants/r2" });
  });

  it("links a merged duplicate to the row it was merged into", () => {
    expect(
      restaurantVenueLinks(
        [{ id: "dup", slug: "noce-2", is_merged: true, merged_into: "keep" }],
        [{ id: "keep", slug: "noce", is_merged: false, merged_into: null }],
      ),
    ).toEqual({ "restaurant:dup": "/restaurants/noce" });
  });

  it("uses a survivor that is on the same page of deals", () => {
    const links = restaurantVenueLinks([
      { id: "dup", slug: "noce-2", is_merged: true, merged_into: "keep" },
      { id: "keep", slug: "noce", is_merged: false, merged_into: null },
    ]);
    expect(links["restaurant:dup"]).toBe("/restaurants/noce");
    expect(links["restaurant:keep"]).toBe("/restaurants/noce");
  });

  it("keeps the duplicate's own link when the survivor was not returned or points at itself", () => {
    expect(
      restaurantVenueLinks([
        { id: "dup", slug: "noce-2", is_merged: true, merged_into: "gone" },
        { id: "self", slug: "loop", is_merged: true, merged_into: "self" },
      ]),
    ).toEqual({ "restaurant:dup": "/restaurants/noce-2", "restaurant:self": "/restaurants/loop" });
  });

  it("ignores merged_into on a row that is not marked merged", () => {
    expect(
      restaurantVenueLinks(
        [{ id: "r1", slug: "noce", is_merged: false, merged_into: "other" }],
        [{ id: "other", slug: "elsewhere" }],
      ),
    ).toEqual({ "restaurant:r1": "/restaurants/noce" });
  });
});

describe("fetchDealVenueLinks", () => {
  it("reads merge bookkeeping and fetches only the survivors it does not hold", async () => {
    queued.restaurants = [
      {
        data: [
          { id: "dup", slug: "noce-2", is_merged: true, merged_into: "keep" },
          { id: "r1", slug: "fong", is_merged: false, merged_into: null },
        ],
        error: null,
      },
      { data: [{ id: "keep", slug: "noce", is_merged: false, merged_into: null }], error: null },
    ];
    const links = await fetchDealVenueLinks([deal("dup"), deal("r1")]);
    expect(links).toEqual({ "restaurant:dup": "/restaurants/noce", "restaurant:r1": "/restaurants/fong" });
    const selects = calls.filter(([c]) => c === "restaurants.select");
    expect(selects).toEqual([
      ["restaurants.select", DEAL_VENUE_RESTAURANT_COLUMNS],
      ["restaurants.select", DEAL_VENUE_RESTAURANT_COLUMNS],
    ]);
    expect(calls).toContainEqual(["restaurants.in", "id", ["keep"]]);
    expect(DEAL_VENUE_RESTAURANT_COLUMNS).toMatch(/\bis_merged\b/);
    expect(DEAL_VENUE_RESTAURANT_COLUMNS).toMatch(/\bmerged_into\b/);
  });

  it("makes no survivor read when nothing on the page is merged", async () => {
    queued.restaurants = [{ data: [{ id: "r1", slug: "fong", is_merged: false, merged_into: null }], error: null }];
    await fetchDealVenueLinks([deal("r1")]);
    expect(calls.filter(([c]) => c === "restaurants.select")).toHaveLength(1);
  });

  it("reports a failed survivor read and keeps the duplicate's own link", async () => {
    queued.restaurants = [
      { data: [{ id: "dup", slug: "noce-2", is_merged: true, merged_into: "keep" }], error: null },
      { data: null, error: { message: "boom" } },
    ];
    const links = await fetchDealVenueLinks([deal("dup")]);
    expect(links).toEqual({ "restaurant:dup": "/restaurants/noce-2" });
    expect(handleError).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * WEB-FEAT-067: /deals (and the explore deals row) stop listing a
 * deal at a restaurant that is closed for good or temporarily closed. The
 * restaurant page shows no deals for such a place and the Happy hour now
 * strip skips it; /deals was the one surface that still sent people there.
 */
const calls: Array<[string, ...unknown[]]> = [];
const results: Record<string, { data: unknown; error: unknown }> = {};
let currentTable = "";
const handleError = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "not", "lte", "or", "order", "limit", "in"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown) => resolve(results[currentTable]);
  return {
    supabase: {
      from: (table: string) => {
        currentTable = table;
        calls.push(["from", table]);
        return builder;
      },
    },
  };
});
vi.mock("@/lib/errorHandler", () => ({ handleError: (...a: unknown[]) => handleError(...a) }));

import {
  dropShutRestaurantDeals,
  fetchDeals,
  type Deal,
  type DealRestaurantStatus,
} from "@/hooks/useDeals";
import { DEAL_RESTAURANT_STATUS_COLUMNS } from "@/lib/listColumns";
import { isShutRestaurant } from "@/lib/restaurantHours";

function deal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: "d1",
    title: "Half-price drafts",
    description: null,
    business_name: "Noce",
    entity_type: "restaurant",
    entity_id: "r1",
    deal_type: "percentage",
    discount_value: null,
    code: null,
    terms: null,
    start_date: "2026-01-01T00:00:00Z",
    end_date: null,
    image_url: null,
    is_featured: false,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function venue(overrides: Partial<DealRestaurantStatus> = {}): DealRestaurantStatus {
  return { id: "r1", status: null, business_status: "OPERATIONAL", ...overrides };
}

beforeEach(() => {
  calls.length = 0;
  handleError.mockClear();
  results.deals = { data: [], error: null };
  results.restaurants = { data: [], error: null };
});

describe("isShutRestaurant", () => {
  it("is shut when closed for good or closed for now, by either column", () => {
    expect(isShutRestaurant({ status: "closed" })).toBe(true);
    expect(isShutRestaurant({ status: "permanently_closed" })).toBe(true);
    expect(isShutRestaurant({ status: "temporarily_closed" })).toBe(true);
    expect(isShutRestaurant({ business_status: "CLOSED_PERMANENTLY" })).toBe(true);
    expect(isShutRestaurant({ business_status: "closed_temporarily" })).toBe(true);
  });

  it("is not shut when operating, unknown, or not open yet", () => {
    expect(isShutRestaurant({ status: null, business_status: "OPERATIONAL" })).toBe(false);
    expect(isShutRestaurant({})).toBe(false);
    expect(isShutRestaurant(null)).toBe(false);
    // A grand-opening offer at a place opening soon is still an offer.
    expect(isShutRestaurant({ status: "opening_soon" })).toBe(false);
    expect(isShutRestaurant({ status: "announced" })).toBe(false);
  });
});

describe("dropShutRestaurantDeals", () => {
  it("drops deals at a shut restaurant and keeps the rest", () => {
    const deals = [
      deal({ id: "open", entity_id: "r1" }),
      deal({ id: "temp", entity_id: "r2" }),
      deal({ id: "gone", entity_id: "r3" }),
      deal({ id: "unlinked", entity_id: null }),
      deal({ id: "missing", entity_id: "r9" }),
      deal({ id: "hotel", entity_type: "hotel", entity_id: "r2" }),
    ];
    const venues = [
      venue({ id: "r1" }),
      venue({ id: "r2", business_status: "CLOSED_TEMPORARILY" }),
      venue({ id: "r3", status: "closed" }),
    ];
    expect(dropShutRestaurantDeals(deals, venues).map((d) => d.id)).toEqual([
      "open",
      "unlinked",
      "missing",
      "hotel",
    ]);
  });
});

describe("fetchDeals", () => {
  it("reads the status of each named restaurant once and drops shut ones", async () => {
    results.deals = {
      data: [
        deal({ id: "a", entity_id: "r2" }),
        deal({ id: "b", entity_id: "r1" }),
        deal({ id: "c", entity_id: "r2" }),
        deal({ id: "attraction", entity_type: "attraction", entity_id: "x1" }),
      ],
      error: null,
    };
    results.restaurants = {
      data: [venue({ id: "r1" }), venue({ id: "r2", business_status: "CLOSED_TEMPORARILY" })],
      error: null,
    };

    const out = await fetchDeals("all");

    expect(out.map((d) => d.id)).toEqual(["b", "attraction"]);
    expect(calls).toContainEqual(["from", "restaurants"]);
    expect(calls).toContainEqual(["select", DEAL_RESTAURANT_STATUS_COLUMNS]);
    expect(calls).toContainEqual(["in", "id", ["r1", "r2"]]);
    expect(calls.filter((c) => c[0] === "eq")).toEqual([]);
  });

  it("filters by category and skips the status read when no restaurant is named", async () => {
    results.deals = { data: [deal({ id: "h", entity_type: "hotel", entity_id: "h1" })], error: null };

    const out = await fetchDeals("hotel");

    expect(out.map((d) => d.id)).toEqual(["h"]);
    expect(calls).toContainEqual(["eq", "entity_type", "hotel"]);
    expect(calls).not.toContainEqual(["from", "restaurants"]);
  });

  it("lists the deals unfiltered and reports when the status read fails", async () => {
    results.deals = { data: [deal({ id: "a", entity_id: "r1" })], error: null };
    results.restaurants = { data: null, error: { message: "boom" } };

    const out = await fetchDeals();

    expect(out.map((d) => d.id)).toEqual(["a"]);
    expect(handleError).toHaveBeenCalledTimes(1);
  });

  it("throws when the deals read fails, so the page shows its error state", async () => {
    results.deals = { data: null, error: { message: "down" } };
    await expect(fetchDeals()).rejects.toEqual({ message: "down" });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * WEB-FEAT-025: the /restaurants hub lists restaurant happy hours running now,
 * from the deals DealManager curates, on the Des Moines clock.
 *
 * 2026-09-23 is a Wednesday; Des Moines is on CDT (UTC-5), so 22:00Z is 5 PM.
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
  fetchHappyHourCandidates,
  happyHourNow,
  type Deal,
  type HappyHourCandidate,
  type HappyHourRestaurant,
} from "@/hooks/useDeals";
import { HappyHourList } from "@/components/restaurants/RestaurantsHappyHourStrip";
import { HAPPY_HOUR_RESTAURANT_COLUMNS } from "@/lib/listColumns";
import { NOT_CLOSED_RESTAURANT_FILTER } from "@/lib/restaurantHours";

const WED_5PM_CT = new Date("2026-09-23T22:00:00Z");
const WED_7PM_CT = new Date("2026-09-24T00:00:00Z");

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
    days_of_week: ["mon", "tue", "wed", "thu", "fri"],
    start_time: "15:00:00",
    end_time: "18:00:00",
    ...overrides,
  };
}

function restaurant(overrides: Partial<HappyHourRestaurant> = {}): HappyHourRestaurant {
  return { id: "r1", name: "Noce", slug: "noce", status: null, business_status: "OPERATIONAL", ...overrides };
}

function candidate(d: Partial<Deal>, r: Partial<HappyHourRestaurant> = {}): HappyHourCandidate {
  return { deal: deal(d), restaurant: restaurant(r) };
}

beforeEach(() => {
  calls.length = 0;
  handleError.mockClear();
  results.deals = { data: [], error: null };
  results.restaurants = { data: [], error: null };
});

describe("fetchHappyHourCandidates", () => {
  it("reads in-date timed restaurant deals, then their restaurants without closed ones", async () => {
    results.deals = { data: [deal({ id: "d1", entity_id: "r1" }), deal({ id: "d2", entity_id: "r2" })], error: null };
    results.restaurants = { data: [restaurant({ id: "r1" }), restaurant({ id: "r2", slug: "b" })], error: null };

    const out = await fetchHappyHourCandidates();

    expect(out.map((c) => c.deal.id)).toEqual(["d1", "d2"]);
    expect(calls).toContainEqual(["from", "deals"]);
    expect(calls).toContainEqual(["eq", "entity_type", "restaurant"]);
    expect(calls).toContainEqual(["not", "start_time", "is", null]);
    expect(calls).toContainEqual(["not", "end_time", "is", null]);
    expect(calls).toContainEqual(["from", "restaurants"]);
    expect(calls).toContainEqual(["select", HAPPY_HOUR_RESTAURANT_COLUMNS]);
    expect(calls).toContainEqual(["in", "id", ["r1", "r2"]]);
    expect(calls).toContainEqual(["or", NOT_CLOSED_RESTAURANT_FILTER]);
  });

  it("drops deals at a temporarily or permanently closed restaurant, or one not returned", async () => {
    results.deals = {
      data: [
        deal({ id: "open", entity_id: "r1" }),
        deal({ id: "temp", entity_id: "r2" }),
        deal({ id: "gone", entity_id: "r3" }),
        deal({ id: "missing", entity_id: "r4" }),
      ],
      error: null,
    };
    results.restaurants = {
      data: [
        restaurant({ id: "r1" }),
        restaurant({ id: "r2", business_status: "CLOSED_TEMPORARILY" }),
        restaurant({ id: "r3", business_status: "CLOSED_PERMANENTLY" }),
      ],
      error: null,
    };

    const out = await fetchHappyHourCandidates();
    expect(out.map((c) => c.deal.id)).toEqual(["open"]);
  });

  it("skips the restaurant read when no timed deal is in date", async () => {
    const out = await fetchHappyHourCandidates();
    expect(out).toEqual([]);
    expect(calls).not.toContainEqual(["from", "restaurants"]);
  });

  it("reports a failed read and answers with nothing", async () => {
    results.deals = { data: null, error: { message: "boom" } };
    expect(await fetchHappyHourCandidates()).toEqual([]);
    expect(handleError).toHaveBeenCalledTimes(1);

    handleError.mockClear();
    results.deals = { data: [deal()], error: null };
    results.restaurants = { data: null, error: { message: "boom" } };
    expect(await fetchHappyHourCandidates()).toEqual([]);
    expect(handleError).toHaveBeenCalledTimes(1);
  });
});

describe("happyHourNow", () => {
  it("keeps only deals live at this Des Moines minute", () => {
    const rows = happyHourNow(
      [
        candidate({ id: "live" }),
        candidate({ id: "later", start_time: "20:00:00", end_time: "22:00:00" }, { id: "r2" }),
        candidate({ id: "weekend", days_of_week: ["sat", "sun"] }, { id: "r3" }),
        candidate({ id: "expired", end_date: "2026-09-01T00:00:00Z" }, { id: "r4" }),
      ],
      WED_5PM_CT,
    );
    expect(rows.map((r) => r.deal.id)).toEqual(["live"]);
    expect(happyHourNow([candidate({ id: "live" })], WED_7PM_CT)).toEqual([]);
  });

  it("lists a restaurant once, by its first live deal, and caps the rows", () => {
    const many = [
      candidate({ id: "first" }),
      candidate({ id: "second" }),
      ...[2, 3, 4, 5, 6, 7].map((n) => candidate({ id: `d${n}` }, { id: `r${n}` })),
    ];
    const rows = happyHourNow(many, WED_5PM_CT);
    expect(rows.map((r) => r.deal.id)).toEqual(["first", "d2", "d3", "d4", "d5"]);
    expect(happyHourNow(many, WED_5PM_CT, 2)).toHaveLength(2);
  });

  it("is empty for no data", () => {
    expect(happyHourNow(undefined, WED_5PM_CT)).toEqual([]);
  });
});

describe("HappyHourList", () => {
  it("links each restaurant's deals section and the running-now deals page", () => {
    render(
      <MemoryRouter>
        <HappyHourList rows={[candidate({ id: "live" })]} />
      </MemoryRouter>,
    );
    const section = screen.getByRole("region", { name: "Happy hour now" });
    const row = within(section).getAllByRole("listitem")[0];
    expect(within(row).getByRole("link", { name: "Noce" })).toHaveAttribute("href", "/restaurants/noce#deals");
    expect(row).toHaveTextContent("Half-price drafts");
    expect(row).toHaveTextContent("Mon-Fri, 3-6 PM");
    expect(within(section).getByRole("link", { name: "Every dining deal running now" })).toHaveAttribute(
      "href",
      "/deals?category=restaurant&when=now",
    );
  });

  it("renders nothing when no happy hour is running", () => {
    const { container } = render(
      <MemoryRouter>
        <HappyHourList rows={[]} />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

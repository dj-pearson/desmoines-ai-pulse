import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * WEB-FEAT-035: a restaurant's page lists the deals linked to it, ordered by
 * what a visitor can use now, on the same Central clock /deals uses.
 *
 * 2026-09-23 is a Wednesday; Des Moines is on CDT (UTC-5), so 22:00Z is 5 PM.
 */
const calls: Array<[string, ...unknown[]]> = [];
const result: { data: unknown; error: unknown } = { data: [], error: null };
const handleError = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "lte", "or", "order"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return {
    supabase: {
      from: (table: string) => {
        calls.push(["from", table]);
        return builder;
      },
    },
  };
});
vi.mock("@/lib/errorHandler", () => ({ handleError: (...a: unknown[]) => handleError(...a) }));

import { fetchRestaurantDeals, orderDealsForVenue, type Deal } from "@/hooks/useDeals";
import { RestaurantDealsList } from "@/components/restaurants/RestaurantDeals";

const WED_5PM_CT = new Date("2026-09-23T22:00:00Z");

function deal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: "d1",
    title: "Deal",
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
    days_of_week: null,
    start_time: null,
    end_time: null,
    ...overrides,
  };
}

const running = deal({ id: "running", title: "Happy hour", start_time: "16:00:00", end_time: "18:00:00" });
const anyTime = deal({ id: "any", title: "Free dessert" });
const later = deal({ id: "later", title: "Late night", start_time: "21:00:00", end_time: "23:00:00" });
const otherDay = deal({ id: "other", title: "Taco Tuesday", days_of_week: ["tue"] });
const ended = deal({ id: "ended", title: "Lunch special", start_time: "11:00:00", end_time: "14:00:00" });
const expired = deal({ id: "expired", title: "Gone", end_date: "2026-09-23T21:00:00Z" });

describe("orderDealsForVenue", () => {
  it("puts running now first, then any time, later today, other days, ended for today", () => {
    const ordered = orderDealsForVenue([ended, otherDay, later, anyTime, running], WED_5PM_CT);
    expect(ordered.map((d) => d.id)).toEqual(["running", "any", "later", "other", "ended"]);
  });

  it("drops a deal whose end date passed while the page was open", () => {
    expect(orderDealsForVenue([expired, anyTime], WED_5PM_CT).map((d) => d.id)).toEqual(["any"]);
  });

  it("keeps the query order within a group", () => {
    const a = deal({ id: "a" });
    const b = deal({ id: "b" });
    expect(orderDealsForVenue([b, a], WED_5PM_CT).map((d) => d.id)).toEqual(["b", "a"]);
  });
});

describe("fetchRestaurantDeals", () => {
  beforeEach(() => {
    calls.length = 0;
    result.data = [];
    result.error = null;
    handleError.mockClear();
  });

  it("asks for this restaurant's deals only, inside their date window", async () => {
    result.data = [running];
    expect(await fetchRestaurantDeals("r1")).toEqual([running]);
    expect(calls).toContainEqual(["from", "deals"]);
    expect(calls).toContainEqual(["eq", "entity_type", "restaurant"]);
    expect(calls).toContainEqual(["eq", "entity_id", "r1"]);
    expect(calls.some(([m, col]) => m === "lte" && col === "start_date")).toBe(true);
    expect(calls.some(([m, f]) => m === "or" && String(f).startsWith("end_date.is.null,end_date.gte."))).toBe(true);
    const select = calls.find(([m]) => m === "select");
    expect(String(select?.[1])).not.toContain("*");
  });

  it("reports a failed read and answers with no deals", async () => {
    result.data = null;
    result.error = { message: "boom" };
    expect(await fetchRestaurantDeals("r1")).toEqual([]);
    expect(handleError).toHaveBeenCalledTimes(1);
  });
});

describe("RestaurantDealsList", () => {
  function renderList(deals: Deal[]) {
    return render(
      <MemoryRouter>
        <RestaurantDealsList deals={deals} restaurantName="Noce" now={WED_5PM_CT} />
      </MemoryRouter>,
    );
  }

  it("renders nothing, not an empty heading, when no deal is in date", () => {
    const { container } = renderList([expired]);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the section and marks only the scheduled deal that is running", () => {
    renderList([later, running, anyTime]);
    const section = screen.getByRole("region", { name: "Deals and happy hours" });
    const items = within(section).getAllByRole("listitem");
    expect(items.map((li) => within(li).getByRole("heading", { level: 3 }).textContent)).toEqual([
      "Happy hour",
      "Free dessert",
      "Late night",
    ]);
    expect(within(items[0]).getByText("Running now")).toBeInTheDocument();
    expect(within(items[1]).queryByText("Running now")).toBeNull();
    expect(within(items[2]).getByText(/Starts 9 PM/)).toBeInTheDocument();
  });

  it("sends a coded deal to /deals rather than printing the code", () => {
    renderList([deal({ id: "c", title: "Coded", code: "SECRET10" })]);
    expect(screen.queryByText("SECRET10")).toBeNull();
    expect(screen.getByRole("link", { name: "Get the code on the Deals page" })).toHaveAttribute(
      "href",
      "/deals?category=restaurant",
    );
  });
});

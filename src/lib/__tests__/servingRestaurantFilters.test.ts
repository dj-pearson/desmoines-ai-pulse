import { createElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

/**
 * WEB-BE-045, AC3's hubs: a place Google calls CLOSED_PERMANENTLY (which the
 * hours refresh writes without touching `status`) still showed on pSEO
 * listings and neighbourhood guides, and the suburb event pages asked for
 * status = 'active', which the CHECK on restaurants.status never allows, so
 * they listed no restaurants at all. The mock evaluates the PostgREST filters
 * each read sends against fixture rows, so the assertions are on what comes
 * back, not on the filter strings.
 */

type Row = Record<string, string | number | boolean | null>;
type Pred = (row: Row) => boolean;

/** Split on commas that are not inside parentheses. */
function splitTop(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of list) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function condition(expr: string): Pred {
  const group = /^(and|or)\((.*)\)$/.exec(expr);
  if (group) {
    const parts = splitTop(group[2]).map(condition);
    return group[1] === "and" ? (r) => parts.every((p) => p(r)) : (r) => parts.some((p) => p(r));
  }
  const m = /^([a-z_]+)\.(not\.)?(is|in|eq|neq)\.(.*)$/.exec(expr);
  if (!m) throw new Error(`unsupported filter ${expr}`);
  const [, col, not, op, raw] = m;
  let pred: Pred;
  if (op === "is") pred = (r) => (r[col] ?? null) === null;
  else if (op === "in") {
    const values = raw.replace(/^\(|\)$/g, "").split(",");
    // SQL: NULL IN (...) and NULL NOT IN (...) are both unknown, so false.
    pred = (r) => r[col] != null && values.includes(String(r[col]));
    if (not) return (r) => r[col] != null && !values.includes(String(r[col]));
  } else if (op === "eq") pred = (r) => r[col] != null && String(r[col]) === raw;
  else pred = (r) => r[col] != null && String(r[col]) !== raw;
  return not ? (r) => !pred(r) : pred;
}

function orFilter(list: string): Pred {
  return condition(`or(${list})`);
}

let rows: Row[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const chain = () => {
    const preds: Pred[] = [];
    let limit = Infinity;
    let sortCol: string | null = null;
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.order = (col: string) => {
      sortCol ??= col;
      return c;
    };
    c.limit = (n: number) => {
      limit = n;
      return c;
    };
    c.eq = (col: string, v: unknown) => {
      preds.push((r) => r[col] != null && String(r[col]) === String(v));
      return c;
    };
    c.neq = (col: string, v: unknown) => {
      // PostgREST neq drops NULL too; the code under test sends neq is_merged true.
      preds.push((r) => r[col] != null && String(r[col]) !== String(v));
      return c;
    };
    c.or = (list: string) => {
      preds.push(orFilter(list));
      return c;
    };
    c.filter = () => c;
    c.then = (resolve: (v: unknown) => unknown) => {
      let data = rows.filter((r) => preds.every((p) => p(r)));
      if (sortCol) {
        const col = sortCol;
        data = [...data].sort((a, b) => Number(b[col] ?? -1) - Number(a[col] ?? -1));
      }
      return Promise.resolve({ data: data.slice(0, limit), error: null }).then(resolve);
    };
    return c;
  };
  return { supabase: { from: () => chain() } };
});

const {
  SERVING_BUSINESS_STATUS_RESTAURANT_FILTER,
  VISITABLE_STATUS_RESTAURANT_FILTER,
  isServingToday,
} = await import("@/lib/restaurantStatus");
const { useAreaPlaces } = await import("@/pseo/hooks/useAreaGuide");
const { PseoLiveListings } = await import("@/pseo/components/sections/PseoLiveListings");

function restaurant(name: string, over: Partial<Row> = {}): Row {
  return {
    id: name,
    name,
    slug: name.toLowerCase().replace(/\W+/g, "-"),
    description: null,
    location: "100 Court Ave, Des Moines",
    city: "Des Moines",
    cuisine: "American",
    price_range: "$$",
    rating: 4,
    image_url: null,
    status: "open",
    business_status: "OPERATIONAL",
    is_merged: false,
    neighborhood: "east-village",
    latitude: 41.59,
    longitude: -93.61,
    ...over,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(
    QueryClientProvider,
    { client },
    createElement(MemoryRouter, null, children),
  );
}

describe("the serving filters agree with isServingToday", () => {
  const statuses = [null, "open", "newly_opened", "closed", "opening_soon", "announced", "permanently_closed", "temporarily_closed", "coming_soon"];
  const google = [null, "OPERATIONAL", "CLOSED_TEMPORARILY", "CLOSED_PERMANENTLY"];
  const visitable = orFilter(VISITABLE_STATUS_RESTAURANT_FILTER);
  const serving = orFilter(SERVING_BUSINESS_STATUS_RESTAURANT_FILTER);

  for (const status of statuses) {
    for (const business_status of google) {
      it(`status ${status}, business_status ${business_status}`, () => {
        const row = { status, business_status };
        expect(visitable(row) && serving(row)).toBe(isServingToday(row));
      });
    }
  }
});

describe("neighbourhood guide places (useAreaPlaces)", () => {
  it("leaves out a place Google closed, for good or for now, and keeps the rest", async () => {
    rows = [
      restaurant("Gone For Good", { rating: 4.9, business_status: "CLOSED_PERMANENTLY" }),
      restaurant("Shut For Repairs", { rating: 4.8, business_status: "CLOSED_TEMPORARILY" }),
      restaurant("Opening In May", { rating: 4.7, status: "opening_soon", business_status: null }),
      restaurant("Serving", { rating: 4.2 }),
      restaurant("No Google Answer", { rating: 4.1, business_status: null }),
    ];
    const boundary = { slug: "east-village", name: "East Village", polygon: [] };
    const { result } = renderHook(
      () => useAreaPlaces(boundary as unknown as Parameters<typeof useAreaPlaces>[0]),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.restaurants.map((r) => r.name)).toEqual(["Serving", "No Google Answer"]);
    expect(result.current.data?.total).toBe(2);
  });
});

describe("pSEO live listings (restaurants)", () => {
  it("does not list a place Google closed as a top restaurant, even when it is the best rated", async () => {
    rows = [
      ...Array.from({ length: 24 }, (_, i) =>
        restaurant(`Closed ${i}`, { rating: 5, business_status: "CLOSED_PERMANENTLY" }),
      ),
      restaurant("Still Cooking", { rating: 4.5 }),
      restaurant("Temporarily Dark", { rating: 4.9, business_status: "CLOSED_TEMPORARILY" }),
    ];
    render(
      createElement(PseoLiveListings, {
        dimensions: [{ dimension: "content_type", slug: "restaurants" }] as never,
        pageTypeId: "test",
      }),
      { wrapper },
    );
    expect(await screen.findByText("Still Cooking")).toBeTruthy();
    expect(screen.queryByText("Temporarily Dark")).toBeNull();
    expect(screen.queryByText("Closed 0")).toBeNull();
  });
});

describe("suburb event pages (EventsByLocation)", () => {
  const page = readFileSync("src/pages/EventsByLocation.tsx", "utf8");

  it("no longer asks for a status the CHECK on restaurants.status forbids", () => {
    expect(page).not.toMatch(/\.eq\(\s*["']status["']\s*,\s*["']active["']\s*\)/);
  });

  it("filters the sample and the count with the serving filters, in the query", () => {
    expect(page).toMatch(/const restaurantQuery = [\s\S]*?applyServingRestaurantFilters\(\s*supabase\s*\.from\("restaurants"\)/);
  });
});

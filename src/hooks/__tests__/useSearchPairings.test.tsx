import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/**
 * /search pairs each event with a dinner nearby (useSearchPairings). The hook
 * used to select a private column list without hours_json or business_status,
 * so pickDinner read `opening` (a date in production, so no dinner at all) and
 * could not see a Google CLOSED_TEMPORARILY place (WEB-FEAT-038).
 */
type Result = { data: unknown; error: unknown };
const selects: Record<string, string> = {};
const responses: Record<string, Result> = {};

function builder(table: string) {
  const b: Record<string, unknown> = {};
  b.select = (cols: string) => {
    selects[table] = cols;
    return b;
  };
  for (const op of ["eq", "neq", "or", "not", "limit"]) b[op] = () => b;
  // Like PostgREST, return only the selected columns, so a field the hook
  // forgets to select is absent here too.
  b.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) => {
    const res = responses[table] ?? { data: [], error: null };
    const wanted = new Set((selects[table] ?? "").split(",").map((c) => c.trim()));
    const data = Array.isArray(res.data)
      ? res.data.map((row: Record<string, unknown>) =>
          Object.fromEntries(Object.entries(row).filter(([k]) => wanted.has(k))),
        )
      : res.data;
    return Promise.resolve({ ...res, data }).then(resolve, reject);
  };
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (table: string) => builder(table) },
}));

const { renderHook, waitFor } = await import("@testing-library/react");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { useSearchPairings, PAIRING_COLUMNS } = await import("../useSearchPairings");
const { TONIGHT_RESTAURANT_COLUMNS } = await import("@/lib/listColumns");

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const columns = (projection: string) => projection.split(",").map((c) => c.trim());

/** Open every day 00:00-23:59, in the stored Google shape. */
const ALL_WEEK = {
  periods: Array.from({ length: 7 }, (_, day) => ({
    open: { day, hour: 0, minute: 0 },
    close: { day, hour: 23, minute: 59 },
  })),
};

/** 7 PM Central three days out, so dinner (90 min before) is always in the future. */
function startInThreeDays(): string {
  const day = formatInTimeZone(new Date(Date.now() + 3 * 86_400_000), "America/Chicago", "yyyy-MM-dd");
  return fromZonedTime(`${day}T19:00:00`, "America/Chicago").toISOString();
}

const event = () => ({
  id: "e1",
  title: "Show",
  date: startInThreeDays(),
  event_start_utc: startInThreeDays(),
  latitude: 41.5868,
  longitude: -93.625,
});

const restaurant = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  name: "Near Bistro",
  slug: "near-bistro",
  cuisine: "American",
  price_range: "$$",
  latitude: 41.587,
  longitude: -93.6252,
  // A date, as production stores it: never hours.
  opening: "2019-05-01",
  hours_json: ALL_WEEK,
  opening_date: null,
  status: "open",
  business_status: "OPERATIONAL",
  ...over,
});

beforeEach(() => {
  for (const k of Object.keys(selects)) delete selects[k];
  for (const k of Object.keys(responses)) delete responses[k];
});

describe("PAIRING_COLUMNS", () => {
  it("selects every column pickDinner reads for Tonight, plus price_range", () => {
    const pairing = columns(PAIRING_COLUMNS);
    for (const col of columns(TONIGHT_RESTAURANT_COLUMNS)) expect(pairing).toContain(col);
    expect(pairing).toContain("price_range");
    expect(pairing).toContain("hours_json");
    expect(pairing).toContain("business_status");
  });
});

describe("useSearchPairings", () => {
  it("pairs a dinner from hours_json when `opening` is only a date", async () => {
    responses.restaurants = { data: [restaurant()], error: null };
    const events = [event()];
    const { result } = renderHook(() => useSearchPairings(events), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.get("e1")?.dinner?.restaurant.id).toBe("r1"));
    expect(selects.restaurants).toBe(PAIRING_COLUMNS);
  });

  it("never suggests a Google CLOSED_TEMPORARILY place, and falls through to an operating one", async () => {
    responses.restaurants = {
      data: [
        // Nearer, and its weekly hours still say open.
        restaurant({ id: "shut", latitude: 41.5869, longitude: -93.6251, business_status: "CLOSED_TEMPORARILY" }),
        restaurant({ id: "open", latitude: 41.589, longitude: -93.627 }),
      ],
      error: null,
    };
    const events = [event()];
    const { result } = renderHook(() => useSearchPairings(events), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.get("e1")?.dinner?.restaurant.id).toBe("open"));
  });

  it("offers no dinner when the only place nearby is temporarily closed", async () => {
    responses.restaurants = {
      data: [restaurant({ business_status: "CLOSED_TEMPORARILY" })],
      error: null,
    };
    responses.hotels = {
      data: [{ id: "h1", name: "Inn", slug: "inn", city: "Des Moines", latitude: 41.5868, longitude: -93.625 }],
      error: null,
    };
    const events = [event()];
    const { result } = renderHook(() => useSearchPairings(events), { wrapper: makeWrapper() });
    // Wait for the hotel line so the restaurants query has settled too.
    await waitFor(() => expect(result.current.get("e1")?.stay?.hotel.id).toBe("h1"));
    await waitFor(() => expect(selects.restaurants).toBe(PAIRING_COLUMNS));
    expect(result.current.get("e1")?.dinner).toBeNull();
  });
});

import { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The two rails under event detail dropped a multi-day run on its second day
 * (WEB-FEAT-056). "More like this" filtered `date >= start of today (Central)`
 * and "Same night nearby" filtered `date >= max(now, start - 3h)`, neither with
 * an end_date arm, so on the third day of the State Fair a fair-category page
 * suggested nothing from the fair and a concert two blocks away did not list
 * the fair as on that night. The hubs, site search, landings and .ics feeds
 * already keep running rows (WEB-FEAT-041/045/050/052).
 *
 * The mock evaluates the filters the hook sends against fixture rows, so the
 * assertion is on what the rail shows, not on the filter string.
 */

type Row = Record<string, string | number | boolean | null>;
type Pred = (row: Row) => boolean;

let rows: Row[] = [];

function cmp(cell: Row[string], op: string, raw: string): boolean {
  if (op === "eq") return String(cell) === raw;
  if (op === "neq") return String(cell) !== raw;
  if (cell == null) return false;
  const a = typeof cell === "number" ? cell : Date.parse(String(cell));
  const b = typeof cell === "number" ? Number(raw) : Date.parse(raw.replace(/^"|"$/g, ""));
  if (op === "gte") return a >= b;
  if (op === "lte") return a <= b;
  if (op === "lt") return a < b;
  if (op === "gt") return a > b;
  throw new Error(`unsupported op ${op}`);
}

/** Split a PostgREST or()/and() body on top-level commas. */
function splitTop(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function term(t: string): Pred {
  const group = t.match(/^(and|or)\((.*)\)$/);
  if (group) {
    const parts = splitTop(group[2]).map(term);
    return group[1] === "and" ? (r) => parts.every((p) => p(r)) : (r) => parts.some((p) => p(r));
  }
  const [col, op, ...rest] = t.split(".");
  return (r) => cmp(r[col], op, rest.join("."));
}

vi.mock("@/integrations/supabase/client", () => {
  const chain = () => {
    const preds: Pred[] = [];
    let limit = Infinity;
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.order = () => c;
    c.limit = (n: number) => {
      limit = n;
      return c;
    };
    for (const op of ["eq", "neq", "gte", "lte", "lt", "gt"]) {
      c[op] = (col: string, v: unknown) => {
        preds.push((r) => cmp(r[col], op, String(v)));
        return c;
      };
    }
    c.is = (col: string, v: unknown) => {
      preds.push((r) => (r[col] ?? null) === v);
      return c;
    };
    c.or = (body: string) => {
      preds.push(term(`or(${body})`));
      return c;
    };
    c.then = (resolve: (v: unknown) => unknown) => {
      const data = rows
        .filter((r) => preds.every((p) => p(r)))
        .sort((a, b) => Date.parse(String(a.date)) - Date.parse(String(b.date)))
        .slice(0, limit);
      return Promise.resolve({ data, error: null }).then(resolve);
    };
    return c;
  };
  return { supabase: { from: () => chain() } };
});

const { useRelatedEvents, useSameNightNearby } = await import("../useRelatedEvents");

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

// Third day of the fair: 2026-08-15, 09:00 CDT.
const NOW = new Date("2026-08-15T14:00:00Z");

const VENUE = { latitude: 41.5968, longitude: -93.5513 };

const STATE_FAIR: Row = {
  id: "fair",
  title: "Iowa State Fair",
  category: "Festivals",
  date: "2026-08-13T14:00:00Z",
  event_start_utc: "2026-08-13T14:00:00Z",
  end_date: "2026-08-24T03:00:00Z",
  ...VENUE,
};

/** A one-night show that ended last night: must stay off both rails. */
const LAST_NIGHT: Row = {
  id: "last-night",
  title: "Last night's show",
  category: "Festivals",
  date: "2026-08-15T00:00:00Z",
  event_start_utc: "2026-08-15T00:00:00Z",
  end_date: null,
  ...VENUE,
};

const NEXT_WEEK: Row = {
  id: "next-week",
  title: "Next week's festival",
  category: "Festivals",
  date: "2026-08-22T15:00:00Z",
  event_start_utc: "2026-08-22T15:00:00Z",
  end_date: null,
  ...VENUE,
};

/** The page being viewed: a concert tonight at the fairgrounds, 7pm CDT. */
const TONIGHT: Row = {
  id: "tonight",
  title: "Grandstand concert",
  category: "Festivals",
  date: "2026-08-16T00:00:00Z",
  event_start_utc: "2026-08-16T00:00:00Z",
  end_date: null,
  ...VENUE,
};

describe("event detail rails keep running multi-day events", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    rows = [STATE_FAIR, LAST_NIGHT, NEXT_WEEK, TONIGHT];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("More like this lists a festival on its third day", async () => {
    const { result } = renderHook(
      () => useRelatedEvents({ id: "tonight", category: "Festivals", date: String(TONIGHT.date) }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.events.map((e) => e.id)).toEqual(["fair", "next-week"]);
  });

  it("More like this still drops a past one-night show and the page itself", async () => {
    const { result } = renderHook(
      () => useRelatedEvents({ id: "tonight", category: "Festivals", date: String(TONIGHT.date) }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const ids = result.current.events.map((e) => e.id);
    expect(ids).not.toContain("last-night");
    expect(ids).not.toContain("tonight");
  });

  it("Same night nearby lists a festival that opened two days ago and runs through tonight", async () => {
    const { result } = renderHook(
      () =>
        useSameNightNearby(
          { id: "tonight", date: String(TONIGHT.date), event_start_utc: String(TONIGHT.event_start_utc) },
          VENUE.latitude,
          VENUE.longitude,
          NOW,
        ),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(result.current.events.map((e) => e.item.id)).toEqual(["fair"]));
  });

  it("Same night nearby leaves out a run that ends before the evening starts", async () => {
    rows = [
      TONIGHT,
      {
        ...STATE_FAIR,
        id: "morning-market",
        title: "Morning market",
        // Opened yesterday, closes at noon CDT today: over before the
        // rail's window (start - 3h = 4pm CDT) opens.
        date: "2026-08-14T13:00:00Z",
        end_date: "2026-08-15T17:00:00Z",
      },
    ];
    const { result } = renderHook(
      () =>
        useSameNightNearby(
          { id: "tonight", date: String(TONIGHT.date), event_start_utc: String(TONIGHT.event_start_utc) },
          VENUE.latitude,
          VENUE.longitude,
          NOW,
        ),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.events).toEqual([]);
  });
});

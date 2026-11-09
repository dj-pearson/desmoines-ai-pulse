import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The home "This weekend" group read only rows that START in the weekend
 * window (WEB-FEAT-074), so a festival that opened Thursday and runs through
 * Sunday was not under "This weekend" on the weekend it was the biggest
 * thing on. The fix is a second, capped read for runs, ordered by end, that
 * sorts after the window's starts, so a three-month exhibit cannot crowd a
 * weekend show off the page.
 *
 * The mock applies each read's filters, order and limit to fixture rows, so
 * the assertions are on which rows come back and in what order.
 */

type Cell = string | number | boolean | null;
type Row = Record<string, Cell>;
type Pred = (row: Row) => boolean;

let rows: Row[] = [];

function cmp(cell: Cell, op: string, raw: string): boolean {
  if (op === "neq") return String(cell) !== raw;
  if (op === "is") return raw === "null" ? cell == null : String(cell) === raw;
  if (cell == null) return false;
  const a = Date.parse(String(cell));
  const b = Date.parse(raw);
  if (op === "gte") return a >= b;
  if (op === "lte") return a <= b;
  if (op === "lt") return a < b;
  throw new Error(`unsupported op ${op}`);
}

vi.mock("@/integrations/supabase/client", () => {
  const chain = () => {
    const preds: Pred[] = [];
    let limit = Infinity;
    let orderBy: string | null = null;
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.order = (col: string) => {
      orderBy = col;
      return c;
    };
    c.limit = (n: number) => {
      limit = n;
      return c;
    };
    for (const op of ["neq", "is", "gte", "lte", "lt"]) {
      c[op] = (col: string, v: unknown) => {
        preds.push((r) => cmp(r[col], op, String(v)));
        return c;
      };
    }
    c.then = (resolve: (v: unknown) => unknown) => {
      const hit = rows.filter((r) => preds.every((p) => p(r)));
      if (orderBy) {
        const key = orderBy;
        hit.sort((x, y) => Date.parse(String(x[key])) - Date.parse(String(y[key])));
      }
      return Promise.resolve({ data: hit.slice(0, limit), error: null }).then(resolve);
    };
    return c;
  };
  return { supabase: { from: () => chain(), rpc: vi.fn() } };
});

const { useHomeWeekEvents, HOME_WEEK_RUNNING_LIMIT } = await import("../useHomeWeekEvents");

// Wednesday 2026-10-07, noon CDT. Tomorrow is Thursday; the weekend window is
// Fri 2026-10-09 00:00 CDT (05:00Z) to the end of Sunday 2026-10-11.
const NOW = new Date("2026-10-07T17:00:00Z");

const visible = { is_merged: false, is_hidden: false, archived_at: null };

function row(id: string, date: string, end_date: string | null = null): Row {
  return { id, title: id, date, end_date, ...visible };
}

// Opens Thursday 5 PM CDT, closes Sunday 10 PM CDT.
const FESTIVAL = row("festival", "2026-10-08T22:00:00Z", "2026-10-12T03:00:00Z");
// August to November: running all weekend, ends long after the festival.
const EXHIBIT = row("exhibit", "2026-08-01T15:00:00Z", "2026-11-01T22:00:00Z");
// Thursday only: over before the weekend opens.
const THURSDAY_ONLY = row("thursday", "2026-10-08T23:00:00Z", "2026-10-09T03:00:00Z");

/** Nine weekend shows, one an hour from Saturday 2 PM CDT. */
const WEEKEND_SHOWS = Array.from({ length: 9 }, (_, i) =>
  row(`show-${i}`, new Date(Date.parse("2026-10-10T19:00:00Z") + i * 3600_000).toISOString()),
);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function ids(limit = 9) {
  const { result } = renderHook(() => useHomeWeekEvents(limit), { wrapper });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  return result.current;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  rows = [];
});

describe("useHomeWeekEvents runs (WEB-FEAT-074)", () => {
  it("lists a Thu-Sun festival under This weekend", async () => {
    rows = [FESTIVAL, WEEKEND_SHOWS[0]];
    const r = await ids();
    expect(r.band).toBe("weekend");
    expect(r.events.map((e) => e.id)).toEqual(["show-0", "festival"]);
  });

  it("keeps every weekend start ahead of the runs, with the festival before the exhibit", async () => {
    rows = [EXHIBIT, FESTIVAL, ...WEEKEND_SHOWS];
    const r = await ids(9);
    const got = r.events.map((e) => e.id);
    expect(got.slice(0, 9)).toEqual(WEEKEND_SHOWS.map((s) => s.id));
    expect(got.slice(9)).toEqual(["festival", "exhibit"]);
    // Paging counts starts only, so the two runs do not fake a full page.
    expect(r.startCount).toBe(9);
  });

  it("caps the runs and orders them by end, so long exhibits cannot fill the group", async () => {
    const exhibits = Array.from({ length: 6 }, (_, i) =>
      row(`exhibit-${i}`, "2026-08-01T15:00:00Z", `2026-12-0${i + 1}T22:00:00Z`),
    );
    rows = [...exhibits, FESTIVAL, WEEKEND_SHOWS[0]];
    const r = await ids();
    expect(r.events.map((e) => e.id)).toEqual([
      "show-0",
      "festival",
      ...exhibits.slice(0, HOME_WEEK_RUNNING_LIMIT - 1).map((e) => e.id),
    ]);
    expect(r.startCount).toBe(1);
  });

  it("leaves out a run that ended before the weekend opened", async () => {
    rows = [THURSDAY_ONLY, WEEKEND_SHOWS[0]];
    const r = await ids();
    expect(r.events.map((e) => e.id)).toEqual(["show-0"]);
  });

  it("calls a weekend with only a festival on it a weekend, not empty", async () => {
    rows = [FESTIVAL, row("weekday", "2026-10-08T23:30:00Z")];
    const r = await ids();
    expect(r.band).toBe("weekend");
    expect(r.events.map((e) => e.id)).toEqual(["festival"]);
  });
});

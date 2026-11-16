import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The restaurant page's "Tonight nearby" read only events dated inside today's
 * Central window, so a festival a block away that opened yesterday never
 * showed (WEB-FEAT-080). The mock evaluates the filters the fetch sends
 * against fixture rows, so the assertion is on what comes back, not on the
 * filter string.
 */

type Row = Record<string, string | number | boolean | null>;
type Pred = (row: Row) => boolean;

let rows: Row[] = [];

function cmp(cell: Row[string], op: string, raw: string): boolean {
  if (op === "eq") return String(cell) === raw;
  if (op === "neq") return String(cell) !== raw;
  if (cell == null) return false;
  const a = typeof cell === "number" ? cell : Date.parse(String(cell));
  const b = typeof cell === "number" ? Number(raw) : Date.parse(raw);
  if (op === "gte") return a >= b;
  if (op === "lte") return a <= b;
  if (op === "lt") return a < b;
  if (op === "gt") return a > b;
  throw new Error(`unsupported op ${op}`);
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
    c.then = (resolve: (v: unknown) => unknown) => {
      const data = rows.filter((r) => preds.every((p) => p(r))).slice(0, limit);
      return Promise.resolve({ data, error: null }).then(resolve);
    };
    return c;
  };
  return { supabase: { from: () => chain() } };
});

const { fetchTonightNearRestaurantRows, pickTonightNear } = await import("../useTonightNearRestaurant");
const { centralDayWindow } = await import("@/lib/tonightPairings");

// Thursday 2026-09-24, 5:00 PM CDT.
const NOW = new Date("2026-09-24T22:00:00Z");
const ORIGIN = { latitude: 41.585, longitude: -93.625 };
const NEAR = { latitude: ORIGIN.latitude + 0.3 / 69, longitude: ORIGIN.longitude };

function row(id: string, date: string, extra: Partial<Row> = {}): Row {
  return {
    id,
    title: id,
    date,
    event_start_utc: date,
    end_date: null,
    is_merged: false,
    is_hidden: false,
    archived_at: null,
    ...NEAR,
    ...extra,
  };
}

afterEach(() => {
  rows = [];
});

describe("fetchTonightNearRestaurantRows", () => {
  it("returns a run that opened yesterday and is still on, next to today's show", async () => {
    rows = [
      row("festival", "2026-09-23T15:00:00Z", { end_date: "2026-09-28T05:00:00Z" }),
      row("show", "2026-09-25T00:30:00Z"),
      row("ended-yesterday", "2026-09-20T15:00:00Z", { end_date: "2026-09-24T04:00:00Z" }),
      row("hidden-run", "2026-09-23T15:00:00Z", { end_date: "2026-09-28T05:00:00Z", is_hidden: true }),
      row("far-run", "2026-09-23T15:00:00Z", {
        end_date: "2026-09-28T05:00:00Z",
        latitude: ORIGIN.latitude + 0.2,
      }),
    ];
    const fetched = await fetchTonightNearRestaurantRows(ORIGIN.latitude, ORIGIN.longitude, centralDayWindow(NOW));
    expect(fetched.map((r) => r.id).sort()).toEqual(["festival", "show"]);

    const picked = pickTonightNear(fetched, ORIGIN, NOW);
    expect(picked.map((p) => [p.event.id, p.runsUntil !== null])).toEqual([
      ["show", false],
      ["festival", true],
    ]);
  });
});

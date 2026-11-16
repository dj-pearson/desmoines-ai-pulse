import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * WEB-BE-045 AC5, "a fallback message when hours are unknown": the open-now
 * list reads only rows with hours_json, so a place with no hours vanished
 * from the page without a word. fetchServingWithoutHoursCount counts them.
 * The mock evaluates the filters the count sends against fixture rows, so the
 * assertions are on which rows are counted, not on filter strings.
 */

type Row = Record<string, string | boolean | null | object>;
type Pred = (row: Row) => boolean;

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

/** The two shapes applyServingRestaurantFilters sends: col.is.null and col.not.in.(...). */
function condition(expr: string): Pred {
  const isNull = /^([a-z_]+)\.is\.null$/.exec(expr);
  if (isNull) return (r) => (r[isNull[1]] ?? null) === null;
  const notIn = /^([a-z_]+)\.not\.in\.\((.*)\)$/.exec(expr);
  if (notIn) {
    const values = notIn[2].split(",");
    // SQL: NULL NOT IN (...) is unknown, so the row is not kept by this arm.
    return (r) => r[notIn[1]] != null && !values.includes(String(r[notIn[1]]));
  }
  throw new Error(`unsupported filter ${expr}`);
}

let rows: Row[] = [];
let failWith: { message: string } | null = null;
const selects: Array<{ columns: string; options: unknown }> = [];

vi.mock("@/integrations/supabase/client", () => {
  const chain = () => {
    const preds: Pred[] = [];
    const c: Record<string, unknown> = {};
    c.select = (columns: string, options: unknown) => {
      selects.push({ columns, options });
      return c;
    };
    c.is = (col: string, v: null) => {
      preds.push((r) => (r[col] ?? null) === v);
      return c;
    };
    c.not = (col: string, op: string, v: unknown) => {
      if (op !== "is" || v !== true) throw new Error(`unsupported not ${col} ${op} ${String(v)}`);
      // IS NOT TRUE keeps false and NULL.
      preds.push((r) => r[col] !== true);
      return c;
    };
    c.or = (list: string) => {
      const parts = splitTop(list).map(condition);
      preds.push((r) => parts.some((p) => p(r)));
      return c;
    };
    c.then = (resolve: (v: unknown) => unknown) => {
      if (failWith) return Promise.resolve({ data: null, count: null, error: failWith }).then(resolve);
      const count = rows.filter((r) => preds.every((p) => p(r))).length;
      return Promise.resolve({ data: null, count, error: null }).then(resolve);
    };
    return c;
  };
  return { supabase: { from: () => chain() } };
});

const handleError = vi.fn();
vi.mock("@/lib/errorHandler", () => ({
  ErrorSeverity: { INFO: "info", WARNING: "warning", ERROR: "error", CRITICAL: "critical" },
  handleError: (...args: unknown[]) => handleError(...args),
}));

const { fetchServingWithoutHoursCount } = await import("@/hooks/useOpenNowRestaurants");

const HOURS = { periods: [{ open: { day: 1, hour: 11, minute: 0 }, close: { day: 1, hour: 22, minute: 0 } }] };

function place(id: string, over: Partial<Row> = {}): Row {
  return { id, status: "open", business_status: "OPERATIONAL", is_merged: false, hours_json: null, ...over };
}

describe("fetchServingWithoutHoursCount", () => {
  beforeEach(() => {
    failWith = null;
    selects.length = 0;
    handleError.mockClear();
  });

  it("counts serving places with no hours, and nothing else", async () => {
    rows = [
      place("has hours", { hours_json: HOURS }),
      place("no hours"),
      place("no hours, no statuses", { status: null, business_status: null, is_merged: null }),
      place("merged duplicate", { is_merged: true }),
      place("closed for good", { status: "closed" }),
      place("Google says gone", { business_status: "CLOSED_PERMANENTLY" }),
      place("renovating", { business_status: "CLOSED_TEMPORARILY" }),
      place("not open yet", { status: "opening_soon" }),
    ];
    await expect(fetchServingWithoutHoursCount()).resolves.toBe(2);
  });

  it("asks for a count only, no rows", async () => {
    rows = [];
    await fetchServingWithoutHoursCount();
    expect(selects).toEqual([{ columns: "id", options: { count: "exact", head: true } }]);
  });

  it("reports a failed count and returns null instead of a number", async () => {
    failWith = { message: "boom" };
    await expect(fetchServingWithoutHoursCount()).resolves.toBeNull();
    expect(handleError).toHaveBeenCalledTimes(1);
    expect(handleError.mock.calls[0][2]).toBe("warning");
  });
});

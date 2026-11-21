import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Advanced search (/search/advanced, and every saved search re-run from it)
 * dropped a multi-day run from its second day (WEB-FEAT-066). searchEvents
 * filtered `date >= max(start of today Central, "from" date)` with no end_date
 * arm, so on the third morning of the State Fair a search for "state fair"
 * found the Grandstand concert and not the fair, and a "from" date inside a
 * run (a festival weekend searched from Saturday) lost it too, while /events
 * and site search listed it (WEB-FEAT-045).
 *
 * The mock evaluates the filters the read sends, nested `and(...)`/`or(...)`
 * included, against fixture rows, so the assertions are on which rows come
 * back, not on a filter string.
 */

type Cell = string | number | boolean | null;
type Row = Record<string, Cell>;
type Pred = (row: Row) => boolean;

let rows: Row[] = [];

function like(cell: Cell, pattern: string): boolean {
  const needle = pattern.replace(/^%|%$/g, "").toLowerCase();
  return typeof cell === "string" && cell.toLowerCase().includes(needle);
}

function cmp(cell: Cell, op: string, raw: string): boolean {
  if (op === "eq") return String(cell) === raw;
  if (op === "neq") return String(cell) !== raw;
  if (op === "is") return raw === "null" ? cell == null : String(cell) === raw;
  if (op === "ilike") return like(cell, raw);
  if (cell == null) return false;
  // Coordinates compare as numbers, timestamps as instants.
  const a = typeof cell === "number" ? cell : Date.parse(String(cell));
  const b = typeof cell === "number" ? Number(raw) : Date.parse(raw);
  if (op === "gte") return a >= b;
  if (op === "lte") return a <= b;
  if (op === "lt") return a < b;
  if (op === "gt") return a > b;
  throw new Error(`unsupported op ${op}`);
}

/** Split on commas that are not inside parentheses. */
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
  out.push(cur);
  return out;
}

/** One PostgREST logic-tree term: `and(...)`, `or(...)` or `col.op.value`. */
function term(t: string): Pred {
  const group = /^(and|or)\((.*)\)$/.exec(t);
  if (group) {
    const parts = splitTop(group[2]).map(term);
    return group[1] === "and" ? (r) => parts.every((p) => p(r)) : (r) => parts.some((p) => p(r));
  }
  const [col, op, ...rest] = t.split(".");
  return (r) => cmp(r[col], op, rest.join("."));
}

vi.mock("@/integrations/supabase/client", () => {
  const chain = (table: string) => {
    const preds: Pred[] = [];
    let limit = Infinity;
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.order = () => c;
    c.in = () => c;
    c.limit = (n: number) => {
      limit = n;
      return c;
    };
    for (const op of ["eq", "neq", "is", "gte", "lte", "lt", "gt", "ilike"]) {
      c[op] = (col: string, v: unknown) => {
        preds.push((r) => cmp(r[col], op, String(v)));
        return c;
      };
    }
    c.or = (body: string) => {
      const parts = splitTop(body).map(term);
      preds.push((r) => parts.some((p) => p(r)));
      return c;
    };
    c.then = (resolve: (v: unknown) => unknown) => {
      const data = table === "events" ? rows.filter((r) => preds.every((p) => p(r))).slice(0, limit) : [];
      return Promise.resolve({ data, error: null }).then(resolve);
    };
    return c;
  };
  return { supabase: { from: (table: string) => chain(table) } };
});

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));

const { searchEvents, DEFAULT_ADVANCED_FILTERS } = await import("../useAdvancedSearch");

// Third morning of the fair: 2026-08-15, 09:00 CDT.
const NOW = new Date("2026-08-15T14:00:00Z");

const visible = { is_merged: false, is_hidden: false, archived_at: null, is_featured: false };

const STATE_FAIR: Row = {
  id: "fair-1",
  title: "Iowa State Fair",
  venue: "Iowa State Fairgrounds",
  location: "Des Moines, IA",
  date: "2026-08-13T14:00:00Z",
  end_date: "2026-08-24T03:00:00Z",
  ...visible,
};
const FAIR_CONCERT: Row = {
  id: "concert-1",
  title: "Grandstand at the State Fair",
  venue: "Iowa State Fairgrounds",
  location: "Des Moines, IA",
  date: "2026-08-17T01:30:00Z",
  end_date: null,
  ...visible,
};
const LAST_YEAR: Row = {
  id: "fair-2025",
  title: "Iowa State Fair 2025",
  venue: "Iowa State Fairgrounds",
  location: "Des Moines, IA",
  date: "2025-08-07T14:00:00Z",
  end_date: "2025-08-18T03:00:00Z",
  ...visible,
};
// Its last night was yesterday (ends 10 PM CDT on the 14th).
const ENDED_YESTERDAY: Row = {
  id: "ended",
  title: "State Fair Preview Night",
  venue: "Hoyt Sherman Place",
  location: "Des Moines, IA",
  date: "2026-08-12T23:00:00Z",
  end_date: "2026-08-15T03:00:00Z",
  ...visible,
};
const JAZZ: Row = {
  id: "jazz-1",
  title: "Jazz in July Encore",
  venue: "Water Works Park",
  location: "Des Moines, IA",
  date: "2026-08-21T23:00:00Z",
  end_date: null,
  ...visible,
};

function search(patch: Partial<typeof DEFAULT_ADVANCED_FILTERS>) {
  return searchEvents({ ...DEFAULT_ADVANCED_FILTERS, category: "Events", ...patch });
}

const ids = (results: { id: string }[]) => results.map((r) => r.id).sort();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  rows = [STATE_FAIR, FAIR_CONCERT, LAST_YEAR, ENDED_YESTERDAY, JAZZ];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("advanced search keeps a run that is still on", () => {
  it("a text search on the fair's third morning finds the fair", async () => {
    expect(ids(await search({ query: "state fair" }))).toEqual(["concert-1", "fair-1"]);
  });

  it("no text: the fair is listed beside what starts later", async () => {
    expect(ids(await search({}))).toEqual(["concert-1", "fair-1", "jazz-1"]);
  });

  it('a "from" date inside the run keeps it; the window still ends at "to"', async () => {
    const results = await search({ dateRange: { start: "2026-08-20", end: "2026-08-20" } });
    expect(ids(results)).toEqual(["fair-1"]);
  });

  it("the text match and the window are ANDed, not ORed", async () => {
    // Matches last year's fair and yesterday's preview by text; neither is on.
    expect(ids(await search({ query: "fairgrounds" }))).toEqual(["concert-1", "fair-1"]);
    expect(ids(await search({ query: "preview night" }))).toEqual([]);
    expect(ids(await search({ query: "no such show" }))).toEqual([]);
  });

  it("an unpublished run stays off", async () => {
    rows = [{ ...STATE_FAIR, archived_at: "2026-08-14T00:00:00Z" }, FAIR_CONCERT];
    expect(ids(await search({ query: "state fair" }))).toEqual(["concert-1"]);
  });
});

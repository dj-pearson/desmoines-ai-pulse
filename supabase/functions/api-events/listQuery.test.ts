// Run with: deno test supabase/functions/api-events/listQuery.test.ts
// Offline: listQuery.ts imports only _shared/centralTime.ts and
// _shared/validation.ts, neither of which imports anything remote.
//
// The stub records the filters the way PostgREST would receive them, and
// matches() evaluates them against fixture rows, so each case asserts which
// events a caller gets back rather than which strings were built.
import {
  applyEventListFilters,
  applyEventVisibility,
  centralDayEndUtc,
  centralDayStartUtc,
  type EventFilterBuilder,
  type EventListParams,
} from "./listQuery.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`expected ${e}, got ${a}`);
}

type Row = Record<string, string | boolean | null>;
type Pred = (r: Row) => boolean;

/** Split a PostgREST logic list on commas that are not inside parentheses. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function compare(op: string, left: string | boolean | null, right: string): boolean {
  if (left === null || left === undefined) return false;
  const l = String(left);
  if (op === "gte") return new Date(l).getTime() >= new Date(right).getTime();
  if (op === "lte") return new Date(l).getTime() <= new Date(right).getTime();
  if (op === "eq") return l === right;
  if (op === "ilike") {
    const needle = right.replace(/^%|%$/g, "").toLowerCase();
    return l.toLowerCase().includes(needle);
  }
  throw new Error(`unsupported op ${op}`);
}

function parseExpr(expr: string): Pred {
  const logic = /^(and|or)\((.*)\)$/.exec(expr);
  if (logic) {
    const parts = splitTop(logic[2]).map(parseExpr);
    return logic[1] === "and" ? (r) => parts.every((p) => p(r)) : (r) => parts.some((p) => p(r));
  }
  const m = /^([a-z_]+)\.([a-z]+)\.(.*)$/.exec(expr);
  if (!m) throw new Error(`cannot parse ${expr}`);
  const [, col, op, val] = m;
  return (r) => compare(op, r[col], val);
}

class Stub implements EventFilterBuilder<Stub> {
  preds: Pred[] = [];
  orParams: string[] = [];
  eq(c: string, v: string): Stub {
    this.preds.push((r) => r[c] === v);
    return this;
  }
  neq(c: string, v: boolean): Stub {
    // PostgREST neq never matches NULL; these columns are NOT NULL or false.
    this.preds.push((r) => r[c] !== v);
    return this;
  }
  is(c: string, _v: null): Stub {
    this.preds.push((r) => r[c] === null || r[c] === undefined);
    return this;
  }
  lte(c: string, v: string): Stub {
    this.preds.push((r) => compare("lte", r[c], v));
    return this;
  }
  or(f: string): Stub {
    this.orParams.push(f);
    this.preds.push(parseExpr(`or(${f})`));
    return this;
  }
  matches(r: Row): boolean {
    return this.preds.every((p) => p(r));
  }
}

function base(over: Partial<Row>): Row {
  return {
    id: "x",
    title: "Show",
    date: "2026-08-20T00:00:00Z",
    end_date: null,
    venue: "Hoyt Sherman Place",
    location: "Des Moines",
    city: "Des Moines",
    category: "Music",
    enhanced_description: null,
    is_merged: false,
    is_hidden: false,
    archived_at: null,
    ...over,
  };
}

// Saturday Aug 15 2026, 8:30 PM CDT (UTC-5).
const SAT_EVENING = new Date("2026-08-16T01:30:00Z");

const ROWS: Row[] = [
  // Today, 5 PM CDT, still on at 8:30. Its UTC date is Aug 15, but the UTC
  // date "today" has already become Aug 16.
  base({ id: "tonight", date: "2026-08-15T22:00:00Z" }),
  // State Fair: opened Thursday Aug 13, runs to Sunday Aug 23.
  base({ id: "fair", title: "Iowa State Fair", date: "2026-08-13T14:00:00Z", end_date: "2026-08-24T03:00:00Z", venue: "Iowa State Fairgrounds" }),
  // A one-night show earlier this week.
  base({ id: "past", date: "2026-08-12T01:00:00Z" }),
  base({ id: "hidden", is_hidden: true }),
  base({ id: "archived", archived_at: "2026-08-01T00:00:00Z" }),
  base({ id: "merged", is_merged: true }),
  // Aug 20, 8 PM CDT: on Aug 20 in Des Moines, Aug 21 in UTC.
  base({ id: "aug20-evening", date: "2026-08-21T01:00:00Z", venue: "Wooly's" }),
];

function run(params: EventListParams, now = SAT_EVENING): { ids: string[]; stub: Stub } {
  const stub = applyEventListFilters(new Stub(), params, now);
  return { ids: ROWS.filter((r) => stub.matches(r)).map((r) => r.id as string), stub };
}

Deno.test("default list drops merged, hidden and archived rows", () => {
  const { ids } = run({});
  for (const off of ["hidden", "archived", "merged"]) {
    if (ids.includes(off)) throw new Error(`${off} was served: ${ids}`);
  }
});

Deno.test("default list keeps an evening show that started before the UTC date rolled over", () => {
  const { ids } = run({});
  if (!ids.includes("tonight")) throw new Error(`tonight missing: ${ids}`);
});

Deno.test("default list keeps a run that opened before today and drops a past one-night show", () => {
  const { ids } = run({});
  assertEquals(ids, ["tonight", "fair", "aug20-evening"]);
});

Deno.test("end_date includes the evening of the last requested day", () => {
  const { ids } = run({ start_date: "2026-08-20", end_date: "2026-08-20" });
  // The fair is still running on Aug 20, so an overlap read returns it too.
  assertEquals(ids, ["fair", "aug20-evening"]);
});

Deno.test("location and search go out as one or= group ANDed with the window", () => {
  const { ids, stub } = run({ location: "Wooly's", search: "show" });
  assertEquals(stub.orParams.length, 1);
  assertEquals(ids, ["aug20-evening"]);
});

Deno.test("PostgREST-reserved characters in a search cannot break the group", () => {
  const { stub } = run({ search: "a,b) or(title" });
  const only = stub.orParams[0];
  // Balanced parentheses and exactly two top-level groups (window, search) inside and(...).
  assertEquals(splitTop(/^and\((.*)\)$/.exec(only)![1]).length, 2);
});

Deno.test("detail visibility filter refuses merged, hidden and archived rows", () => {
  const stub = applyEventVisibility(new Stub());
  assertEquals(ROWS.filter((r) => stub.matches(r)).map((r) => r.id), ["tonight", "fair", "past", "aug20-evening"]);
});

Deno.test("Central day bounds follow the DST offset and refuse impossible dates", () => {
  assertEquals(centralDayStartUtc("2026-08-20"), "2026-08-20T05:00:00.000Z");
  assertEquals(centralDayEndUtc("2026-08-20"), "2026-08-21T04:59:59.999Z");
  assertEquals(centralDayStartUtc("2026-12-01"), "2026-12-01T06:00:00.000Z");
  // Nov 1 2026 is the fall-back day: starts in CDT, ends in CST.
  assertEquals(centralDayEndUtc("2026-11-01"), "2026-11-02T05:59:59.999Z");
  assertEquals(centralDayStartUtc("2026-02-30"), null);
  assertEquals(centralDayStartUtc("next week"), null);
});

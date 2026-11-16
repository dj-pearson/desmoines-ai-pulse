// Run with: deno test supabase/functions/assemble-weekly-digest/content.test.ts
// Offline: content.ts imports only _shared/centralTime.ts.
//
// The stub records the filters the way PostgREST would receive them and
// evaluates them against fixture rows, so each case asserts which events the
// digest would mail rather than which strings were built. WEB-FEAT-089.
import {
  applyDigestRunsFilters,
  applyDigestStartsFilters,
  DIGEST_RUNNING_LIMIT,
  type DigestFilterBuilder,
  digestWindow,
  formatDigestEventDate,
  mergeDigestEvents,
} from "./content.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`expected ${e}, got ${a}`);
}

type Row = Record<string, string | boolean | null>;
type Pred = (r: Row) => boolean;

function cmp(left: string | boolean | null, right: string): number | null {
  if (left === null || left === undefined) return null;
  return new Date(String(left)).getTime() - new Date(right).getTime();
}

class Stub implements DigestFilterBuilder<Stub> {
  preds: Pred[] = [];
  neq(c: string, v: boolean): Stub {
    this.preds.push((r) => r[c] !== v);
    return this;
  }
  is(c: string, _v: null): Stub {
    this.preds.push((r) => r[c] === null || r[c] === undefined);
    return this;
  }
  gte(c: string, v: string): Stub {
    // SQL: NULL >= x is not true.
    this.preds.push((r) => (cmp(r[c], v) ?? -1) >= 0);
    return this;
  }
  lt(c: string, v: string): Stub {
    this.preds.push((r) => (cmp(r[c], v) ?? 0) < 0);
    return this;
  }
  lte(c: string, v: string): Stub {
    this.preds.push((r) => (cmp(r[c], v) ?? 1) <= 0);
    return this;
  }
  matches(r: Row): boolean {
    return this.preds.every((p) => p(r));
  }
}

function base(over: Partial<Row>): Row {
  return {
    id: "x",
    date: "2026-08-20T00:00:00Z",
    end_date: null,
    is_hidden: false,
    is_merged: false,
    archived_at: null,
    ...over,
  };
}

// Monday Aug 17 2026, 6 AM CDT (11:00Z), when the Monday digest is assembled.
const MONDAY = new Date("2026-08-17T11:00:00Z");

const ROWS: Row[] = [
  // Today, 7 PM CDT. Its UTC date is Aug 18.
  base({ id: "tonight", date: "2026-08-18T00:00:00Z" }),
  // Sunday Aug 23, 8 PM CDT (Aug 24 01:00Z): the window's last evening.
  base({ id: "sun-evening", date: "2026-08-24T01:00:00Z" }),
  // Monday Aug 24, 9 AM CDT: a week out, outside the window.
  base({ id: "next-monday", date: "2026-08-24T14:00:00Z" }),
  // Last night, Sunday Aug 16, 7 PM CDT (Aug 17 00:00Z). The old UTC-date
  // floor (Aug 17 00:00Z) let it in.
  base({ id: "last-night", date: "2026-08-17T00:00:00Z" }),
  // State Fair: opened Thursday Aug 13, runs to Sunday Aug 23.
  base({ id: "fair", date: "2026-08-13T14:00:00Z", end_date: "2026-08-24T03:00:00Z" }),
  // A three-month exhibit that opened in June.
  base({ id: "exhibit", date: "2026-06-01T15:00:00Z", end_date: "2026-09-30T22:00:00Z" }),
  // A run that ended yesterday.
  base({ id: "ended", date: "2026-08-10T15:00:00Z", end_date: "2026-08-16T22:00:00Z" }),
  base({ id: "hidden", date: "2026-08-19T00:00:00Z", is_hidden: true }),
  base({ id: "archived", date: "2026-08-19T00:00:00Z", archived_at: "2026-08-01T00:00:00Z" }),
  base({ id: "merged-run", date: "2026-08-13T14:00:00Z", end_date: "2026-08-24T03:00:00Z", is_merged: true }),
];

const W = digestWindow(MONDAY);

function ids(stub: Stub): string[] {
  return ROWS.filter((r) => stub.matches(r)).map((r) => r.id as string);
}

Deno.test("window is seven Central days starting at Central midnight", () => {
  assertEquals(W, {
    start: "2026-08-17T05:00:00.000Z",
    end: "2026-08-24T04:59:59.999Z",
  });
});

Deno.test("window crosses the DST change on Central days", () => {
  // Saturday Oct 31 2026, noon CDT; DST ends Sunday Nov 1.
  assertEquals(digestWindow(new Date("2026-10-31T17:00:00Z")), {
    start: "2026-10-31T05:00:00.000Z",
    end: "2026-11-07T05:59:59.999Z",
  });
});

Deno.test("an evening digest run still means today in Central", () => {
  // Monday Aug 17, 9 PM CDT is already Aug 18 in UTC.
  assertEquals(digestWindow(new Date("2026-08-18T02:00:00Z")).start, "2026-08-17T05:00:00.000Z");
});

Deno.test("starts read keeps the last evening, drops last night and next week", () => {
  assertEquals(ids(applyDigestStartsFilters(new Stub(), W)), ["tonight", "sun-evening"]);
});

Deno.test("runs read keeps a run that opened before today, never a past or hidden one", () => {
  assertEquals(ids(applyDigestRunsFilters(new Stub(), W)), ["fair", "exhibit"]);
});

Deno.test("runs only fill the tail, so starts are never pushed off past the cap", () => {
  const starts = ["a", "b", "c", "d", "e", "f"];
  assertEquals(mergeDigestEvents(starts, ["fair", "exhibit", "third"], 6), ["a", "b", "c", "d", "fair", "exhibit"]);
  assertEquals(mergeDigestEvents(["a"], ["fair"], 6), ["a", "fair"]);
  assertEquals(mergeDigestEvents([], ["fair", "exhibit"], 6).length, DIGEST_RUNNING_LIMIT);
});

Deno.test("date line is the Central day of a timestamptz, never Invalid Date", () => {
  // PostgREST returns timestamptz with an offset.
  assertEquals(formatDigestEventDate({ date: "2026-08-24T01:00:00+00:00" }, W), "Sun, Aug 23");
  assertEquals(formatDigestEventDate({ date: "2026-08-18T00:00:00+00:00", end_date: null }, W), "Mon, Aug 17");
  assertEquals(formatDigestEventDate({ date: "not a date" }, W), "");
});

Deno.test("a run that began before the window reads Through <last day>", () => {
  assertEquals(
    formatDigestEventDate({ date: "2026-08-13T14:00:00+00:00", end_date: "2026-08-24T03:00:00+00:00" }, W),
    "Through Sun, Aug 23",
  );
  // A multi-day event that starts inside the window shows its start.
  assertEquals(
    formatDigestEventDate({ date: "2026-08-21T23:00:00+00:00", end_date: "2026-08-23T23:00:00+00:00" }, W),
    "Fri, Aug 21",
  );
});

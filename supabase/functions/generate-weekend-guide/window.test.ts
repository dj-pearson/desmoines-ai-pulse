// Run with: deno test supabase/functions/generate-weekend-guide/window.test.ts
// Offline: window.ts imports only _shared/centralTime.ts.
//
// The stub records the filters the way PostgREST would receive them and
// evaluates them against fixture rows, so each case asserts which events the
// guide is written from rather than which strings were built. WEB-FEAT-089.
import {
  applyWeekendGuideFilters,
  formatGuideEventDate,
  nextWeekendWindow,
  type WeekendFilterBuilder,
} from "./window.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`expected ${e}, got ${a}`);
}

type Row = Record<string, string | boolean | null>;
type Pred = (r: Row) => boolean;

function cmp(left: string | boolean | null | undefined, right: string): number | null {
  if (left === null || left === undefined) return null;
  return new Date(String(left)).getTime() - new Date(right).getTime();
}

// SQL: a comparison with NULL is not true.
function gtePred(c: string, v: string): Pred {
  return (r) => (cmp(r[c], v) ?? -1) >= 0;
}

class Stub implements WeekendFilterBuilder<Stub> {
  preds: Pred[] = [];
  neq(c: string, v: boolean): Stub {
    this.preds.push((r) => r[c] !== v);
    return this;
  }
  is(c: string, _v: null): Stub {
    this.preds.push((r) => r[c] === null || r[c] === undefined);
    return this;
  }
  lte(c: string, v: string): Stub {
    this.preds.push((r) => (cmp(r[c], v) ?? 1) <= 0);
    return this;
  }
  or(filters: string): Stub {
    // Only `col.gte.<iso>` terms are expected; anything else fails the case.
    const arms = filters.split(",").map((term) => {
      const m = /^([a-z_]+)\.gte\.(.+)$/.exec(term);
      if (!m) throw new Error(`unexpected or= term ${term}`);
      return gtePred(m[1], m[2]);
    });
    this.preds.push((r) => arms.some((p) => p(r)));
    return this;
  }
  matches(r: Row): boolean {
    return this.preds.every((p) => p(r));
  }
}

function base(over: Partial<Row>): Row {
  return {
    id: "x",
    date: "2026-11-20T18:00:00Z",
    end_date: null,
    is_hidden: false,
    is_merged: false,
    archived_at: null,
    ...over,
  };
}

// Sunday Nov 15 2026, 9 PM CST (Nov 16 03:00Z): when the cron writes the guide.
const SUNDAY_NIGHT = new Date("2026-11-16T03:00:00Z");

const ROWS: Row[] = [
  // Thursday Nov 19, 8 PM CST (Nov 20 02:00Z). The old window let this in.
  base({ id: "thu-evening", date: "2026-11-20T02:00:00Z" }),
  // Friday Nov 20, 8 PM CST (Nov 21 02:00Z): its UTC date is Saturday.
  base({ id: "fri-evening", date: "2026-11-21T02:00:00Z" }),
  // Saturday Nov 21, 8 PM CST (Nov 22 02:00Z). The old window cut it.
  base({ id: "sat-evening", date: "2026-11-22T02:00:00Z" }),
  // Sunday Nov 22, 2 PM CST. The old window had no Sunday at all.
  base({ id: "sun-matinee", date: "2026-11-22T20:00:00Z" }),
  // Sunday Nov 22, 11:30 PM CST (Nov 23 05:30Z): last half hour of the weekend.
  base({ id: "sun-late", date: "2026-11-23T05:30:00Z" }),
  // Monday Nov 23, 9 AM CST: after the weekend.
  base({ id: "monday", date: "2026-11-23T15:00:00Z" }),
  // Opened Wednesday, runs through Sunday.
  base({
    id: "festival",
    date: "2026-11-18T16:00:00Z",
    end_date: "2026-11-23T03:00:00Z",
  }),
  // Opened Monday, closed Thursday night: over before Friday.
  base({
    id: "closed-thu",
    date: "2026-11-16T16:00:00Z",
    end_date: "2026-11-20T04:00:00Z",
  }),
  // One-night show on Wednesday, no end_date.
  base({ id: "wednesday", date: "2026-11-19T01:00:00Z" }),
  base({ id: "hidden", date: "2026-11-21T20:00:00Z", is_hidden: true }),
  base({ id: "merged", date: "2026-11-21T20:00:00Z", is_merged: true }),
  base({ id: "archived", date: "2026-11-21T20:00:00Z", archived_at: "2026-11-01T00:00:00Z" }),
];

function selected(now: Date): string[] {
  const q = applyWeekendGuideFilters(new Stub(), nextWeekendWindow(now));
  return ROWS.filter((r) => q.matches(r)).map((r) => String(r.id));
}

Deno.test("window is Friday 00:00 through Sunday 23:59:59.999 Central", () => {
  assertEquals(nextWeekendWindow(SUNDAY_NIGHT), {
    friday: "2026-11-20",
    start: "2026-11-20T06:00:00.000Z",
    end: "2026-11-23T05:59:59.999Z",
  });
});

Deno.test("Sunday-night cron selects Friday evening through late Sunday, plus the run", () => {
  assertEquals(selected(SUNDAY_NIGHT), [
    "fri-evening",
    "sat-evening",
    "sun-matinee",
    "sun-late",
    "festival",
  ]);
});

Deno.test("hidden, merged and archived rows are left out", () => {
  const ids = selected(SUNDAY_NIGHT);
  for (const id of ["hidden", "merged", "archived"]) {
    if (ids.includes(id)) throw new Error(`${id} was selected`);
  }
});

Deno.test("Sunday night in Central is still Sunday: not the weekend after", () => {
  // 03:00Z Monday is a UTC Monday; the Central date decides.
  assertEquals(nextWeekendWindow(SUNDAY_NIGHT).friday, "2026-11-20");
});

Deno.test("a Friday or Saturday run writes the NEXT weekend, not the one in progress", () => {
  // Friday Nov 20, 10 AM CST.
  assertEquals(nextWeekendWindow(new Date("2026-11-20T16:00:00Z")).friday, "2026-11-27");
  // Saturday Nov 21, 10 AM CST.
  assertEquals(nextWeekendWindow(new Date("2026-11-21T16:00:00Z")).friday, "2026-11-27");
  // Thursday Nov 19, 11 PM CST (Nov 20 05:00Z, a UTC Friday): still this weekend.
  assertEquals(nextWeekendWindow(new Date("2026-11-20T05:00:00Z")).friday, "2026-11-20");
});

Deno.test("DST: the weekend that ends the morning clocks fall back", () => {
  // Wednesday Oct 28 2026, noon CDT. DST ends Sunday Nov 1 at 2 AM.
  assertEquals(nextWeekendWindow(new Date("2026-10-28T17:00:00Z")), {
    friday: "2026-10-30",
    start: "2026-10-30T05:00:00.000Z",
    end: "2026-11-02T05:59:59.999Z",
  });
});

Deno.test("date line is the Central day and time, and runs read 'Running through'", () => {
  const w = nextWeekendWindow(SUNDAY_NIGHT);
  assertEquals(
    formatGuideEventDate({ date: "2026-11-21T02:00:00Z" }, w),
    "Friday, Nov 20, 8:00 PM",
  );
  assertEquals(
    formatGuideEventDate(
      { date: "2026-11-18T16:00:00Z", end_date: "2026-11-23T03:00:00Z" },
      w,
    ),
    "Running through Sunday, Nov 22",
  );
  // A multi-day event that starts inside the weekend shows its start.
  assertEquals(
    formatGuideEventDate(
      { date: "2026-11-21T16:00:00Z", end_date: "2026-11-22T22:00:00Z" },
      w,
    ),
    "Saturday, Nov 21, 10:00 AM",
  );
  assertEquals(formatGuideEventDate({ date: "not a date" }, w), "Date not listed");
});

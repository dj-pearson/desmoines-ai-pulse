// Run with: deno test --allow-read supabase/functions/_shared/eventWindow.test.ts
// Offline: eventWindow.ts imports only ./centralTime.ts. --allow-read is for
// the drift guard at the bottom, which reads the four callers. WEB-FEAT-091.
import {
  addCentralDays,
  applyEventVisibility,
  centralDayEndUtc,
  centralDaySpan,
  centralDayStartUtc,
  centralToday,
  centralWeekday,
  currentWeekendFriday,
  formatCentralDay,
  nextWeekendFriday,
  parseCentralDay,
  upcomingOrRunningFilter,
  type VisibilityFilterBuilder,
  weekendSpan,
} from "./eventWindow.ts";

function assertEquals(actual: unknown, expected: unknown, msg = ""): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
}

const day = (s: string) => parseCentralDay(s)!;

Deno.test("centralToday is the Central date, not the UTC one", () => {
  // 2026-09-25T02:00Z is Thursday Sep 24, 9 PM CDT.
  assertEquals(centralToday(new Date("2026-09-25T02:00:00Z")), { year: 2026, month: 9, day: 24 });
  // 2027-01-15T05:30Z is Thursday Jan 14, 11:30 PM CST.
  assertEquals(centralToday(new Date("2027-01-15T05:30:00Z")), { year: 2027, month: 1, day: 14 });
});

Deno.test("day bounds follow the Central offset on each side of DST", () => {
  assertEquals(centralDayStartUtc(day("2026-07-15")), "2026-07-15T05:00:00.000Z");
  assertEquals(centralDayEndUtc(day("2026-07-15")), "2026-07-16T04:59:59.999Z");
  assertEquals(centralDayStartUtc(day("2027-01-15")), "2027-01-15T06:00:00.000Z");
  // Nov 1 2026 is the fall-back day: CDT at midnight, CST by the next one.
  assertEquals(centralDaySpan(day("2026-11-01"), day("2026-11-01")), {
    start: "2026-11-01T05:00:00.000Z",
    end: "2026-11-02T05:59:59.999Z",
  });
  // Mar 8 2026 is spring-forward: a 23-hour day.
  assertEquals(centralDaySpan(day("2026-03-08"), day("2026-03-08")), {
    start: "2026-03-08T06:00:00.000Z",
    end: "2026-03-09T04:59:59.999Z",
  });
});

Deno.test("addCentralDays rolls months and years and is unmoved by DST", () => {
  assertEquals(formatCentralDay(addCentralDays(day("2026-12-30"), 3)), "2027-01-02");
  assertEquals(formatCentralDay(addCentralDays(day("2026-03-01"), -1)), "2026-02-28");
  assertEquals(formatCentralDay(addCentralDays(day("2026-03-07"), 1)), "2026-03-08");
  assertEquals(formatCentralDay(addCentralDays(day("2026-10-31"), 2)), "2026-11-02");
});

Deno.test("parseCentralDay is strict", () => {
  assertEquals(parseCentralDay("2026-02-30"), null);
  assertEquals(parseCentralDay("2026-13-01"), null);
  assertEquals(parseCentralDay("2026-8-20"), null);
  assertEquals(parseCentralDay(""), null);
  assertEquals(parseCentralDay(null), null);
  assertEquals(parseCentralDay("2028-02-29"), { year: 2028, month: 2, day: 29 });
});

Deno.test("weekday is the Central date's weekday", () => {
  assertEquals(centralWeekday(day("2026-11-15")), 0);
  assertEquals(centralWeekday(day("2026-11-20")), 5);
});

// Nov 16-22 2026: Mon 16 ... Fri 20, Sat 21, Sun 22.
const WEEK = ["16", "17", "18", "19", "20", "21", "22"].map((d) => day(`2026-11-${d}`));

Deno.test("currentWeekendFriday: the weekend in progress on Fri-Sun, the coming one Mon-Thu", () => {
  assertEquals(
    WEEK.map((d) => formatCentralDay(currentWeekendFriday(d))),
    ["2026-11-20", "2026-11-20", "2026-11-20", "2026-11-20", "2026-11-20", "2026-11-20", "2026-11-20"],
  );
});

Deno.test("nextWeekendFriday: never the weekend in progress", () => {
  assertEquals(
    WEEK.map((d) => formatCentralDay(nextWeekendFriday(d))),
    ["2026-11-20", "2026-11-20", "2026-11-20", "2026-11-20", "2026-11-27", "2026-11-27", "2026-11-27"],
  );
});

Deno.test("weekendSpan is Fri 00:00 through Sun 23:59:59.999 Central", () => {
  assertEquals(weekendSpan(day("2026-11-20")), {
    start: "2026-11-20T06:00:00.000Z",
    end: "2026-11-23T05:59:59.999Z",
  });
  // The weekend DST ends inside: Fri Oct 30 is CDT, Sun Nov 1 ends in CST.
  assertEquals(weekendSpan(day("2026-10-30")), {
    start: "2026-10-30T05:00:00.000Z",
    end: "2026-11-02T05:59:59.999Z",
  });
});

Deno.test("upcomingOrRunningFilter is the client's string", () => {
  assertEquals(upcomingOrRunningFilter("X"), "date.gte.X,end_date.gte.X");
});

type Row = Record<string, boolean | string | null>;

class Stub implements VisibilityFilterBuilder<Stub> {
  preds: ((r: Row) => boolean)[] = [];
  neq(c: string, v: boolean): Stub {
    this.preds.push((r) => r[c] !== v);
    return this;
  }
  is(c: string, _v: null): Stub {
    this.preds.push((r) => r[c] === null || r[c] === undefined);
    return this;
  }
}

Deno.test("applyEventVisibility drops hidden, merged and archived rows and keeps the rest", () => {
  const base = { is_hidden: false, is_merged: false, archived_at: null };
  const rows: (Row & { id: string })[] = [
    { id: "ok", ...base },
    { id: "null-flags", is_hidden: null, is_merged: null, archived_at: null },
    { id: "hidden", ...base, is_hidden: true },
    { id: "merged", ...base, is_merged: true },
    { id: "archived", ...base, archived_at: "2026-08-01T00:00:00Z" },
  ];
  const q = applyEventVisibility(new Stub());
  assertEquals(rows.filter((r) => q.preds.every((p) => p(r))).map((r) => r.id), ["ok", "null-flags"]);
});

// The callers used to carry their own copies of this arithmetic. A new private
// copy is how the four drifted; keep them on the shared one.
const CALLERS = [
  "../nlp-search/dateWindow.ts",
  "../api-events/listQuery.ts",
  "../assemble-weekly-digest/content.ts",
  "../generate-weekend-guide/window.ts",
];

Deno.test("the four callers import eventWindow.ts and keep no private Central-midnight math", async () => {
  for (const rel of CALLERS) {
    const src = await Deno.readTextFile(new URL(rel, import.meta.url));
    assertEquals(src.includes('from "../_shared/eventWindow.ts"'), true, `${rel} imports eventWindow.ts`);
    assertEquals(src.includes("centralWallClockToUtc"), false, `${rel} has its own centralWallClockToUtc`);
    assertEquals(/date\.gte\.\$\{/.test(src), false, `${rel} builds its own date.gte or= group`);
  }
});

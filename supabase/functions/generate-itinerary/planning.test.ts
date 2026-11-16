// IOS-DD-TRIP-PLANNER-06 / -08: request validation, Central windows and item
// sanitizing for generate-itinerary. Offline; no Supabase client.
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  applyTripRunsFilters,
  applyTripStartsFilters,
  centralEventWindow,
  centralMonthStartUtc,
  mergeTripEvents,
  runningThrough,
  sanitizeItems,
  type TripEventFilterBuilder,
  validateTripRequest,
} from "./planning.ts";

const TODAY = "2026-10-01";

Deno.test("rejects a date that is not YYYY-MM-DD", () => {
  const r = validateTripRequest({ startDate: "10/04/2026", endDate: "2026-10-05" }, TODAY);
  assert(!r.ok);
  if (!r.ok) assertEquals(r.code, "invalid_dates");
});

Deno.test("rejects an impossible calendar date", () => {
  const r = validateTripRequest({ startDate: "2026-02-30", endDate: "2026-03-01" }, "2026-02-01");
  assert(!r.ok);
});

Deno.test("rejects a 15-day trip", () => {
  const r = validateTripRequest({ startDate: "2026-10-01", endDate: "2026-10-15" }, TODAY);
  assert(!r.ok);
  if (!r.ok) {
    assertEquals(r.code, "trip_too_long");
    assertEquals(r.error, "Trips can be up to 14 days.");
  }
});

Deno.test("accepts a 14-day trip", () => {
  const r = validateTripRequest({ startDate: "2026-10-01", endDate: "2026-10-14" }, TODAY);
  assert(r.ok);
  if (r.ok) assertEquals(r.value.numDays, 14);
});

Deno.test("rejects a start more than a day in the past", () => {
  const r = validateTripRequest({ startDate: "2026-09-29", endDate: "2026-09-30" }, TODAY);
  assert(!r.ok);
  if (!r.ok) assertEquals(r.code, "start_in_past");
});

Deno.test("allows yesterday (a phone just past midnight elsewhere)", () => {
  const r = validateTripRequest({ startDate: "2026-09-30", endDate: "2026-09-30" }, TODAY);
  assert(r.ok);
});

Deno.test("clamps mustSee and drops an unknown budget", () => {
  const r = validateTripRequest({
    startDate: "2026-10-03",
    endDate: "2026-10-04",
    preferences: {
      mustSee: ["a", "b", "c", "d", "e", "f", "x".repeat(300)],
      budget: "lavish",
      pace: "packed",
      groupSize: 99,
      neighborhood: "  East Village  ",
    },
  }, TODAY);
  assert(r.ok);
  if (r.ok) {
    assertEquals(r.value.preferences.mustSee?.length, 5);
    assertEquals(r.value.preferences.budget, undefined);
    assertEquals(r.value.preferences.pace, "packed");
    assertEquals(r.value.preferences.groupSize, 20);
    assertEquals(r.value.preferences.neighborhood, "East Village");
  }
});

Deno.test("centralEventWindow uses CDT in July", () => {
  const w = centralEventWindow("2026-07-10", "2026-07-11");
  assertEquals(w.fromIso, "2026-07-10T05:00:00.000Z");
  assertEquals(w.toIso, "2026-07-12T05:00:00.000Z");
});

Deno.test("centralEventWindow uses CST in December", () => {
  const w = centralEventWindow("2026-12-31", "2026-12-31");
  assertEquals(w.fromIso, "2026-12-31T06:00:00.000Z");
  assertEquals(w.toIso, "2027-01-01T06:00:00.000Z");
});

Deno.test("centralMonthStartUtc is the Central month, not the UTC month", () => {
  assertEquals(centralMonthStartUtc(new Date("2026-10-15T12:00:00Z")).toISOString(), "2026-10-01T05:00:00.000Z");
  assertEquals(centralMonthStartUtc(new Date("2026-10-01T05:00:00Z")).toISOString(), "2026-10-01T05:00:00.000Z");
  // Sept 30, 10pm Central: still September in Des Moines.
  assertEquals(centralMonthStartUtc(new Date("2026-10-01T03:00:00Z")).toISOString(), "2026-09-01T05:00:00.000Z");
});

Deno.test("sanitizeItems turns an unknown listing id into a custom stop", () => {
  const ids = { event: new Set<string>(), restaurant: new Set(["r-1"]), attraction: new Set<string>() };
  const out = sanitizeItems([
    { dayNumber: 1, orderIndex: 1, itemType: "restaurant", contentType: "restaurant", contentId: "r-1", aiReason: "ok" },
    { dayNumber: 1, orderIndex: 2, itemType: "restaurant", contentType: "restaurant", contentId: "made-up", title: "Fake Diner" },
  ], ids, 2);
  assertEquals(out.length, 2);
  assertEquals(out[0].contentId, "r-1");
  assertEquals(out[0].itemType, "restaurant");
  assertEquals(out[1].contentId, null);
  assertEquals(out[1].contentType, null);
  assertEquals(out[1].itemType, "custom");
  assertEquals(out[1].customTitle, "Fake Diner");
});

Deno.test("sanitizeItems coerces an unknown itemType and clamps the day", () => {
  const ids = { event: new Set<string>(), restaurant: new Set<string>(), attraction: new Set<string>() };
  const out = sanitizeItems([
    { dayNumber: 9, orderIndex: 1, itemType: "museum", customTitle: "Art walk" },
    { dayNumber: 1, orderIndex: 2, itemType: "custom" },
  ], ids, 2);
  assertEquals(out.length, 1, "an item with no title anywhere is dropped");
  assertEquals(out[0].itemType, "custom");
  assertEquals(out[0].dayNumber, 2);
});

// WEB-FEAT-093: the trip's event reads. The stub records the filters
// the way PostgREST would receive them and evaluates them against fixture
// rows, so each case asserts which events the planner would be offered.
type Row = { id: string; [column: string]: string | boolean | null };
type Pred = (r: Row) => boolean;

function cmp(left: string | boolean | null | undefined, right: string): number | null {
  if (left === null || left === undefined) return null;
  return new Date(String(left)).getTime() - new Date(right).getTime();
}

class Stub implements TripEventFilterBuilder<Stub> {
  preds: Pred[] = [];
  is(c: string, _v: null): Stub {
    this.preds.push((r) => r[c] === null || r[c] === undefined);
    return this;
  }
  not(c: string, op: string, v: boolean): Stub {
    if (op !== "is") throw new Error(`unexpected operator ${op}`);
    this.preds.push((r) => r[c] !== v);
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
  matches(r: Row): boolean {
    return this.preds.every((p) => p(r));
  }
}

function row(over: Partial<Row>): Row {
  return {
    id: "x",
    date: "2026-08-15T17:00:00Z",
    end_date: null,
    is_hidden: false,
    is_merged: false,
    archived_at: null,
    ...over,
  };
}

// A Saturday-Sunday trip, Aug 15-16 2026, on the State Fair's third day.
const TRIP = centralEventWindow("2026-08-15", "2026-08-16");

const TRIP_ROWS: Row[] = [
  row({ id: "sat-show", date: "2026-08-16T01:00:00Z" }), // Sat 8 PM CDT
  row({ id: "state-fair", date: "2026-08-13T14:00:00Z", end_date: "2026-08-24T03:00:00Z" }),
  row({ id: "thu-fest", date: "2026-08-13T22:00:00Z", end_date: "2026-08-17T02:00:00Z" }), // Thu 5 PM - Sun 9 PM
  row({ id: "closed-friday", date: "2026-08-10T14:00:00Z", end_date: "2026-08-15T04:00:00Z" }), // ends Fri 11 PM
  row({ id: "past-one-night", date: "2026-08-14T01:00:00Z" }), // Thu 8 PM, no end_date
  row({ id: "monday", date: "2026-08-17T14:00:00Z" }),
  row({ id: "hidden-run", date: "2026-08-13T14:00:00Z", end_date: "2026-08-24T03:00:00Z", is_hidden: true }),
  row({ id: "archived-run", date: "2026-08-13T14:00:00Z", end_date: "2026-08-24T03:00:00Z", archived_at: "2026-08-14T00:00:00Z" }),
  row({ id: "merged-run", date: "2026-08-13T14:00:00Z", end_date: "2026-08-24T03:00:00Z", is_merged: true }),
  row({ id: "merged-show", date: "2026-08-15T23:00:00Z", is_merged: true }),
];

function offered(): string[] {
  const starts = applyTripStartsFilters(new Stub(), TRIP);
  const runs = applyTripRunsFilters(new Stub(), TRIP);
  return mergeTripEvents(
    TRIP_ROWS.filter((r) => starts.matches(r)),
    TRIP_ROWS.filter((r) => runs.matches(r)),
  ).map((r) => String(r.id));
}

Deno.test("trip events include a run that opened before the trip", () => {
  assertEquals(offered(), ["sat-show", "state-fair", "thu-fest"]);
});

Deno.test("trip events leave out runs that closed before it and past one-night shows", () => {
  const ids = offered();
  assert(!ids.includes("closed-friday"));
  assert(!ids.includes("past-one-night"));
  assert(!ids.includes("monday"));
});

Deno.test("trip runs read keeps the listing visibility", () => {
  const runs = applyTripRunsFilters(new Stub(), TRIP);
  const ids = TRIP_ROWS.filter((r) => runs.matches(r)).map((r) => r.id);
  assertEquals(ids, ["state-fair", "thu-fest"]);
});

Deno.test("mergeTripEvents puts starts first and lists each id once", () => {
  const out = mergeTripEvents([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }]);
  assertEquals(out.map((e) => e.id), ["a", "b", "c"]);
});

Deno.test("runningThrough gives the Central end day for a run and null for a start", () => {
  // Ends Aug 24 03:00Z = Sunday Aug 23, 10 PM CDT.
  assertEquals(runningThrough({ date: "2026-08-13T14:00:00Z", end_date: "2026-08-24T03:00:00Z" }, TRIP), "2026-08-23");
  assertEquals(runningThrough({ date: "2026-08-16T01:00:00Z", end_date: "2026-08-16T04:00:00Z" }, TRIP), null);
  assertEquals(runningThrough({ date: "2026-08-13T14:00:00Z", end_date: null }, TRIP), null);
  assertEquals(runningThrough({ date: "2026-08-13T14:00:00Z", end_date: "not a date" }, TRIP), null);
});

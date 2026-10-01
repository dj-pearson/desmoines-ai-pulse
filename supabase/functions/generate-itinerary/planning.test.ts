// IOS-DD-TRIP-PLANNER-06 / -08: request validation, Central windows and item
// sanitizing for generate-itinerary. Offline; no Supabase client.
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  centralEventWindow,
  centralMonthStartUtc,
  sanitizeItems,
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

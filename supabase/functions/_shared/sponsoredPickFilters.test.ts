/**
 * IOS-DD-MONETIZATION-19: sponsored picks only point at listings that are
 * still on, in Des Moines time, with honest copy.
 *
 * Run: `deno test supabase/functions/_shared/sponsoredPickFilters.test.ts`
 */
import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import {
  buildReason,
  centralToday,
  isEventStillOn,
  isRestaurantOpenForBusiness,
} from "./sponsoredPickFilters.ts";

Deno.test("centralToday is the Des Moines date, not UTC", () => {
  // 03:00Z on Oct 1 is 10pm CDT on Sep 30.
  assertEquals(centralToday(new Date("2026-10-01T03:00:00Z")), "2026-09-30");
  assertEquals(centralToday(new Date("2026-10-01T18:00:00Z")), "2026-10-01");
});

Deno.test("an event that ended yesterday is not on", () => {
  const now = new Date("2026-09-30T18:00:00Z");
  assertFalse(isEventStillOn({ date: "2026-09-29T00:00:00Z", end_date: "2026-09-29T04:00:00Z" }, now));
  assertFalse(isEventStillOn({ date: "2026-09-29" }, now));
});

Deno.test("an untimed event today is on all day", () => {
  // 9pm CDT on Sep 30.
  const now = new Date("2026-10-01T02:00:00Z");
  assert(isEventStillOn({ date: "2026-09-30" }, now));
});

Deno.test("a timed event today is on until three hours after it starts", () => {
  const start = "2026-09-30T17:00:00Z"; // noon CDT
  assert(isEventStillOn({ date: start }, new Date("2026-09-30T19:00:00Z")));
  assertFalse(isEventStillOn({ date: start }, new Date("2026-09-30T21:00:00Z")));
});

Deno.test("a future end_date keeps a multi-day event on", () => {
  const now = new Date("2026-09-30T18:00:00Z");
  assert(isEventStillOn({ date: "2026-09-20", end_date: "2026-10-05T00:00:00Z" }, now));
});

Deno.test("a later event is on; a row with no date is not", () => {
  const now = new Date("2026-09-30T18:00:00Z");
  assert(isEventStillOn({ date: "2026-10-10T23:00:00Z" }, now));
  assertFalse(isEventStillOn({ date: null }, now));
});

Deno.test("closed restaurants are not sponsored destinations", () => {
  assertFalse(isRestaurantOpenForBusiness({ business_status: "CLOSED_PERMANENTLY" }));
  assertFalse(isRestaurantOpenForBusiness({ status: "closed" }));
  assertFalse(isRestaurantOpenForBusiness({ status: "permanently_closed" }));
  assert(isRestaurantOpenForBusiness({ business_status: "OPERATIONAL", status: "open" }));
  assert(isRestaurantOpenForBusiness({}));
});

Deno.test("buildReason makes no claim it cannot back up", () => {
  for (const reason of [
    buildReason("restaurant", "mexican"),
    buildReason("restaurant", null),
    buildReason("event", "live music"),
    buildReason("event", undefined),
  ]) {
    assertFalse(reason.toLowerCase().includes("loving"), reason);
    assertFalse(reason.toLowerCase().includes("worth a look"), reason);
    assert(reason.startsWith("Sponsored"), reason);
  }
  assertEquals(buildReason("event", "live music"), "Sponsored · Live Music event");
  assertEquals(buildReason("restaurant", "Mexican"), "Sponsored · Mexican");
});

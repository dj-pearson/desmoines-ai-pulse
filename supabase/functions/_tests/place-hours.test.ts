import { strict as assert } from "node:assert";
import {
  BUSINESS_STATUSES,
  HOURS_JSON_VERSION,
  HOURS_TIME_ZONE,
  isPermanentlyClosed,
  normalizeBusinessStatus,
  normalizeOpeningHours,
} from "../_shared/placeHours.ts";

Deno.test("normalizeBusinessStatus keeps the three documented values", () => {
  for (const status of BUSINESS_STATUSES) {
    assert.equal(normalizeBusinessStatus(status), status);
    assert.equal(normalizeBusinessStatus(status.toLowerCase()), status);
  }
});

Deno.test("an unrecognised status is null, not stored", () => {
  // The column is filtered on. A value nobody anticipated must not be mistaken
  // for a closure OR for an operating venue.
  for (const junk of ["CLOSED", "OPEN", "", "  ", 42, null, undefined, {}]) {
    assert.equal(normalizeBusinessStatus(junk), null);
  }
});

Deno.test("isPermanentlyClosed is the only status that hides a row", () => {
  assert.equal(isPermanentlyClosed("CLOSED_PERMANENTLY"), true);
  // Temporarily closed is a badge, not a removal: the venue is coming back.
  assert.equal(isPermanentlyClosed("CLOSED_TEMPORARILY"), false);
  assert.equal(isPermanentlyClosed("OPERATIONAL"), false);
  assert.equal(isPermanentlyClosed(null), false);
});

Deno.test("normalizeOpeningHours keeps periods and descriptions", () => {
  const stored = normalizeOpeningHours(
    {
      openNow: true,
      periods: [
        { open: { day: 1, hour: 11, minute: 0 }, close: { day: 1, hour: 21, minute: 30 } },
      ],
      weekdayDescriptions: ["Monday: 11:00 AM - 9:30 PM"],
    },
    "2026-09-19T12:00:00.000Z",
  );

  assert.ok(stored);
  assert.equal(stored!.version, HOURS_JSON_VERSION);
  assert.equal(stored!.timeZone, HOURS_TIME_ZONE);
  assert.equal(stored!.source, "google-places");
  assert.equal(stored!.fetchedAt, "2026-09-19T12:00:00.000Z");
  assert.deepEqual(stored!.periods, [
    { open: { day: 1, hour: 11, minute: 0 }, close: { day: 1, hour: 21, minute: 30 } },
  ]);
  assert.deepEqual(stored!.weekdayDescriptions, ["Monday: 11:00 AM - 9:30 PM"]);
});

Deno.test("openNow is NOT stored", () => {
  // It is true at the instant of the fetch and wrong within hours, and a stored
  // copy looks authoritative. The periods are the durable answer.
  const stored = normalizeOpeningHours({
    openNow: true,
    periods: [{ open: { day: 0, hour: 9, minute: 0 } }],
  });
  assert.ok(stored);
  assert.equal("openNow" in stored!, false);
});

Deno.test("a period with no close is kept as-is", () => {
  // Places omits `close` for a venue open 24 hours that day. Inventing a
  // closing time would be inventing a fact.
  const stored = normalizeOpeningHours({ periods: [{ open: { day: 3, hour: 0, minute: 0 } }] });
  assert.ok(stored);
  assert.equal(stored!.periods.length, 1);
  assert.equal("close" in stored!.periods[0], false);
});

Deno.test("an unusable period is dropped and the rest survive", () => {
  const stored = normalizeOpeningHours({
    periods: [
      { open: { day: 9, hour: 11, minute: 0 } },
      { close: { day: 2, hour: 21, minute: 0 } },
      null,
      { open: { day: 2, hour: 11, minute: 0 }, close: { day: 2, hour: 21, minute: 0 } },
    ],
  });
  assert.ok(stored);
  assert.equal(stored!.periods.length, 1);
  assert.equal(stored!.periods[0].open.day, 2);
});

Deno.test("nothing usable is null, never an empty shape", () => {
  // THE ASSERTION THIS FILE EXISTS FOR. `{periods: []}` reads as "closed all
  // week" and means "Google did not answer", and the difference decides
  // whether a restaurant is published as closed.
  assert.equal(normalizeOpeningHours(null), null);
  assert.equal(normalizeOpeningHours(undefined), null);
  assert.equal(normalizeOpeningHours({}), null);
  assert.equal(normalizeOpeningHours({ periods: [] }), null);
  assert.equal(normalizeOpeningHours({ periods: [{ close: { day: 1, hour: 9, minute: 0 } }] }), null);
  assert.equal(normalizeOpeningHours("Mon-Fri 11am-9pm"), null);
});

Deno.test("descriptions alone are enough to store", () => {
  // Places sometimes returns weekdayDescriptions with no periods. That is real
  // information for a reader even though no query can filter on it.
  const stored = normalizeOpeningHours({ weekdayDescriptions: ["Monday: Closed"] });
  assert.ok(stored);
  assert.deepEqual(stored!.periods, []);
});

Deno.test("a minute of 0 survives, because 0 is falsy", () => {
  // The WEB-BE-037 defect in another file was `getMinutes() || 30`. Same trap
  // here: `point.minute || 0` is correct only by accident, and `hour` has no
  // such fallback at all - an `|| 19` there would turn midnight into 7 PM.
  const stored = normalizeOpeningHours({ periods: [{ open: { day: 0, hour: 0, minute: 0 } }] });
  assert.ok(stored);
  assert.equal(stored!.periods[0].open.hour, 0);
  assert.equal(stored!.periods[0].open.minute, 0);
});

Deno.test("a missing minute defaults to the top of the hour", () => {
  const stored = normalizeOpeningHours({ periods: [{ open: { day: 5, hour: 17 } }] });
  assert.ok(stored);
  assert.equal(stored!.periods[0].open.minute, 0);
});

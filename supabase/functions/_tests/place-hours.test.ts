import { strict as assert } from "node:assert";
import {
  buildHoursOnlyUpdate,
  buildStaleRefreshUpdate,
  failedLookupCountsAsCheck,
  HOURS_STALE_MAX_DAYS,
  HOURS_STALE_MIN_DAYS,
  parseStaleDays,
  staleHoursCutoff,
  staleHoursFilter,
  BUSINESS_STATUSES,
  HOURS_ONLY_FIELD_MASK,
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

// SEO-054: the hours-only refresh writes two columns and reads two fields.
Deno.test("buildHoursOnlyUpdate writes only hours_json and business_status", () => {
  const update = buildHoursOnlyUpdate(
    {
      businessStatus: "OPERATIONAL",
      regularOpeningHours: {
        periods: [{ open: { day: 1, hour: 11, minute: 0 }, close: { day: 1, hour: 21, minute: 0 } }],
        weekdayDescriptions: ["Monday: 11:00 AM - 9:00 PM"],
      },
      // Fields the full enrichment writes. The hours-only mode must ignore them.
      editorialSummary: { text: "Should never reach the description column" },
      nationalPhoneNumber: "(515) 555-0100",
      rating: 4.6,
    },
    "2026-10-01T00:00:00.000Z",
  );
  assert.ok(update);
  assert.deepEqual(Object.keys(update!).sort(), ["business_status", "hours_json"]);
  assert.equal(update!.business_status, "OPERATIONAL");
  assert.equal(update!.hours_json!.fetchedAt, "2026-10-01T00:00:00.000Z");
  assert.equal(update!.hours_json!.periods.length, 1);
});

Deno.test("buildHoursOnlyUpdate is null when Places has neither hours nor a status", () => {
  assert.equal(buildHoursOnlyUpdate({}), null);
  assert.equal(buildHoursOnlyUpdate({ regularOpeningHours: { periods: [] }, businessStatus: "OPEN" }), null);
  assert.equal(buildHoursOnlyUpdate(null), null);
});

Deno.test("a closed place with no hours still records its status", () => {
  assert.deepEqual(buildHoursOnlyUpdate({ businessStatus: "CLOSED_PERMANENTLY" }), {
    business_status: "CLOSED_PERMANENTLY",
  });
});

Deno.test("the hours-only mask asks for exactly the two fields it writes", () => {
  assert.equal(HOURS_ONLY_FIELD_MASK, "regularOpeningHours,businessStatus");
});

// WEB-FEAT-079: re-reading hours a row already has.

Deno.test("parseStaleDays: absent, zero or junk is not a refresh", () => {
  for (const raw of [null, undefined, false, 0, -3, "", "abc", NaN, {}]) {
    assert.equal(parseStaleDays(raw), null, String(raw));
  }
});

Deno.test("parseStaleDays clamps to a week and a year", () => {
  assert.equal(parseStaleDays(30), 30);
  assert.equal(parseStaleDays("14"), 14);
  assert.equal(parseStaleDays(30.9), 30);
  assert.equal(parseStaleDays(1), HOURS_STALE_MIN_DAYS);
  assert.equal(parseStaleDays(10_000), HOURS_STALE_MAX_DAYS);
});

Deno.test("staleHoursCutoff is that many days before now, in ISO", () => {
  const now = new Date("2026-11-08T12:00:00.000Z");
  assert.equal(staleHoursCutoff(30, now), "2026-10-09T12:00:00.000Z");
});

Deno.test("staleHoursFilter reads the check time, and fetchedAt only for never-checked rows", () => {
  const cutoff = "2026-10-09T12:00:00.000Z";
  assert.equal(
    staleHoursFilter(cutoff),
    "hours_checked_at.lt.2026-10-09T12:00:00.000Z,and(hours_checked_at.is.null,hours_json->>fetchedAt.lt.2026-10-09T12:00:00.000Z)",
  );
});

Deno.test("a refresh with new hours writes hours, status and the check time", () => {
  const at = "2026-11-08T12:00:00.000Z";
  const update = buildStaleRefreshUpdate(
    {
      businessStatus: "CLOSED_TEMPORARILY",
      regularOpeningHours: {
        periods: [{ open: { day: 1, hour: 11, minute: 0 }, close: { day: 1, hour: 21, minute: 0 } }],
        weekdayDescriptions: ["Monday: 11:00 AM - 9:00 PM"],
      },
    },
    at,
  );
  assert.equal(update.hours_checked_at, at);
  assert.equal(update.business_status, "CLOSED_TEMPORARILY");
  assert.equal(update.hours_json?.fetchedAt, at);
  assert.equal(update.hours_json?.periods.length, 1);
});

Deno.test("a refresh with no hours keeps the stored ones and still records the check", () => {
  // Writing hours_json: null here would turn "Google said these hours on
  // fetchedAt" into "unknown", and an empty periods array would read as
  // closed all week. Only the check time moves.
  const at = "2026-11-08T12:00:00.000Z";
  assert.deepEqual(buildStaleRefreshUpdate({}, at), { hours_checked_at: at });
  assert.deepEqual(buildStaleRefreshUpdate(null, at), { hours_checked_at: at });
  assert.deepEqual(buildStaleRefreshUpdate({ businessStatus: "CLOSED_PERMANENTLY" }, at), {
    business_status: "CLOSED_PERMANENTLY",
    hours_checked_at: at,
  });
});

Deno.test("only a 404 counts as a check; quota and server errors are retried", () => {
  assert.equal(failedLookupCountsAsCheck(404), true);
  for (const status of [400, 401, 403, 429, 500, 503]) {
    assert.equal(failedLookupCountsAsCheck(status), false, String(status));
  }
});

Deno.test("bulk-update-restaurants routes staleDays to the refresh and checks every answer", async () => {
  const src = await Deno.readTextFile(new URL("../bulk-update-restaurants/index.ts", import.meta.url));
  // The refresh reads rows that HAVE hours, stale by the shared filter.
  const fn = src.slice(src.indexOf("async function refreshStaleHours"), src.indexOf("serve(async"));
  assert.ok(fn.includes(".not('hours_json', 'is', null)"), "refresh must read rows with hours");
  assert.ok(fn.includes(".or(staleHoursFilter(cutoff))"), "refresh must use the shared stale filter");
  assert.ok(fn.includes("buildStaleRefreshUpdate("), "refresh must write the check time");
  assert.ok(fn.includes("HOURS_ONLY_FIELD_MASK"), "refresh must ask for the two fields only");
  // Routed only when staleDays parses; absent keeps the fill mode.
  assert.ok(/const staleDays = parseStaleDays\(rawStaleDays\)\s+if \(staleDays !== null\)/.test(src));
});

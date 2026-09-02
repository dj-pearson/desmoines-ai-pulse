/**
 * DMI-010 — the three dedup tiers, each proved to fire AND proved not to fire on
 * a genuinely distinct event.
 *
 * The counter-assertions are the point. A dedup that returns `true` for
 * everything passes every "it catches the duplicate" test ever written, and the
 * symptom in production is not an error — it is events silently never being
 * inserted. Each tier below therefore has a matched pair: one case it must
 * catch, one it must let through.
 *
 * Run: `deno test --allow-read supabase/functions/_shared/eventDedup.test.ts`
 */
import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import {
  calculateTitleSimilarity,
  generateEventFingerprint,
  isDuplicateEvent,
  TITLE_SIMILARITY_THRESHOLD,
  type ExistingEvent,
} from "./eventDedup.ts";

const d = (s: string) => new Date(s);

const existing = (o: Partial<ExistingEvent> = {}): ExistingEvent => ({
  id: "e1",
  title: "Nutcracker",
  date: "2026-12-12T19:00:00.000Z",
  venue: "Civic Center",
  source_url: "https://dmplayhouse.com/shows/nutcracker",
  ...o,
});

Deno.test("fingerprint: stable identity, and the DOMAIN rather than the full url", () => {
  const base = {
    title: "The Nutcracker!",
    date: d("2026-12-12T19:00:00.000Z"),
    venue: "Civic Center",
    source_url: "https://dmplayhouse.com/shows/nutcracker",
  };
  const fp = generateEventFingerprint(base);
  assertEquals(fp, "thenutcracker_2026-12-12_civiccenter_dmplayhouse.com");

  // Two links to the same show on the same site are the same show.
  assertEquals(
    generateEventFingerprint({ ...base, source_url: "https://dmplayhouse.com/tickets/nutcracker" }),
    fp,
  );
  // A different site is a different row, even for the same show.
  assert(generateEventFingerprint({ ...base, source_url: "https://ticketmaster.com/x" }) !== fp);
  // Time of day is not identity; the calendar day is.
  assertEquals(generateEventFingerprint({ ...base, date: d("2026-12-12T01:30:00.000Z") }), fp);
});

Deno.test("TIER 1 — an exact fingerprint match is a duplicate", () => {
  const fp = "nutcracker_2026-12-12_civiccenter_dmplayhouse.com";
  const v = isDuplicateEvent(
    { title: "Nutcracker", date: d("2026-12-12T19:00:00.000Z"), venue: "Civic Center", source_url: "https://dmplayhouse.com/a", fingerprint: fp },
    [existing({ fingerprint: fp, source_url: "https://elsewhere.test/b", title: "Totally Different", venue: "Other Hall" })],
  );
  assert(v.isDuplicate);
  assertEquals(v.reason, "exact_fingerprint_match");
});

Deno.test("TIER 1 counter — a MISSING fingerprint is unknown, not a match", () => {
  // Two undefined fingerprints must not compare equal. This is the case that
  // would silently swallow every event from a producer that does not fingerprint.
  const v = isDuplicateEvent(
    { title: "Alpha", date: d("2026-12-12T19:00:00.000Z"), venue: "Hall A", source_url: "https://a.test/1" },
    [existing({ title: "Beta", venue: "Hall B", source_url: "https://b.test/2", fingerprint: undefined, date: "2026-11-01T19:00:00.000Z" })],
  );
  assertFalse(v.isDuplicate);
});

Deno.test("TIER 2 — same url, same date, 80%+ title similarity", () => {
  const url = "https://dmsymphony.org/concerts/beethoven";
  const v = isDuplicateEvent(
    { title: "Beethoven Symphony No 9", date: d("2026-10-04T19:30:00.000Z"), venue: "Civic Center", source_url: url },
    [existing({ title: "Beethoven Symphony No 9!", date: "2026-10-04T20:00:00.000Z", source_url: url, venue: "Civic Center", fingerprint: undefined })],
  );
  assert(v.isDuplicate);
  assertEquals(v.reason, "same_source_date_similar_title");
});

Deno.test("TIER 2 counter — same url and date, DIFFERENT show, is not a duplicate", () => {
  // A venue listing two shows on one night is the normal case, and collapsing
  // them would delete a real event.
  const url = "https://dmsymphony.org/concerts/";
  const v = isDuplicateEvent(
    { title: "Beethoven Symphony No 9", date: d("2026-10-04T19:30:00.000Z"), venue: "Civic Center", source_url: url },
    [existing({ title: "Mahler Symphony No 2", date: "2026-10-04T19:30:00.000Z", source_url: url, venue: "Civic Center", fingerprint: undefined })],
  );
  assertFalse(v.isDuplicate);
  assert(calculateTitleSimilarity("Beethoven Symphony No 9", "Mahler Symphony No 2") <= TITLE_SIMILARITY_THRESHOLD);
});

Deno.test("TIER 3 — same title and venue on the same Central day is one event", () => {
  const v = isDuplicateEvent(
    { title: "Open Mic Night", date: d("2026-09-10T01:00:00.000Z"), venue: "Woolys", source_url: "https://firstfleetconcerts.com/a" },
    [existing({ title: "open mic night", venue: "woolys", date: "2026-09-09T23:00:00.000Z", source_url: "https://firstfleetconcerts.com/b", fingerprint: undefined })],
  );
  assert(v.isDuplicate);
  assertEquals(v.reason, "same_title_venue_same_day");
});

Deno.test("TIER 3 counter — the SAME weekly event a week later is a real second event", () => {
  // The failure this guards: a weekly residency collapsing to one row forever.
  const v = isDuplicateEvent(
    { title: "Open Mic Night", date: d("2026-09-16T23:00:00.000Z"), venue: "Woolys", source_url: "https://firstfleetconcerts.com/a" },
    [existing({ title: "Open Mic Night", venue: "Woolys", date: "2026-09-09T23:00:00.000Z", source_url: "https://firstfleetconcerts.com/b", fingerprint: undefined })],
  );
  assertFalse(v.isDuplicate);
});

Deno.test("TIER 3 boundary — the line is the Central calendar day, not a rolling window", () => {
  // 2026-09-10T00:00Z is 7pm CDT on Sep 9. The comparison is against Sep 9 in
  // Des Moines, NOT against a 24-hour window around a UTC instant.
  const at = (utcHour: number) => isDuplicateEvent(
    { title: "Show", date: d("2026-09-10T00:00:00.000Z"), venue: "Hall", source_url: "https://a.test/1" },
    [existing({ title: "Show", venue: "Hall", date: new Date(Date.UTC(2026, 8, 10, utcHour)).toISOString(), source_url: "https://a.test/2", fingerprint: undefined })],
  ).isDuplicate;
  assert(at(2), "2am UTC on Sep 10 is 9pm CDT on Sep 9 — the same evening, one event");
  assertFalse(at(23), "11pm UTC on Sep 10 is 6pm CDT on Sep 10 — the next day, a second event");
});

Deno.test("TIER 3 counter — a Saturday evening and a Sunday matinee are two performances", () => {
  // The case eventSourceProfiles names outright: the Symphony's concerts "must
  // both be ingested". They are 18 hours apart, so the old 24-hour window
  // collapsed them into one row and the site showed a matinee that did not
  // exist as a separate listing (WEB-BE-036).
  const v = isDuplicateEvent(
    { title: "Beethoven Symphony No 9", date: d("2026-10-04T19:00:00.000Z"), venue: "Civic Center", source_url: "https://dmsymphony.org/a" },
    [existing({ title: "Beethoven Symphony No 9", venue: "Civic Center", date: "2026-10-04T01:00:00.000Z", source_url: "https://dmsymphony.org/b", fingerprint: undefined })],
  );
  assertFalse(v.isDuplicate, "Sat 8pm CDT and Sun 2pm CDT are different Central days");
});

Deno.test("the first matching tier wins, so the reported reason is the strongest one", () => {
  // This row satisfies tier 1 AND tier 3. The log must say fingerprint, because
  // whoever reads it trusts those differently.
  const fp = "show_2026-09-10_hall_a.test";
  const v = isDuplicateEvent(
    { title: "Show", date: d("2026-09-10T19:00:00.000Z"), venue: "Hall", source_url: "https://a.test/1", fingerprint: fp },
    [existing({ title: "Show", venue: "Hall", date: "2026-09-10T20:00:00.000Z", source_url: "https://a.test/1", fingerprint: fp })],
  );
  assertEquals(v.reason, "exact_fingerprint_match");
});

Deno.test("no existing events means nothing is a duplicate", () => {
  // Vacuously true and worth pinning: the first run against an empty table must
  // insert everything, not nothing.
  assertFalse(isDuplicateEvent(
    { title: "Show", date: d("2026-09-10T19:00:00.000Z"), venue: "Hall", source_url: "https://a.test/1" },
    [],
  ).isDuplicate);
});

Deno.test("similarity is POSITIONAL, not an edit distance — a known weakness, pinned", () => {
  // Recorded rather than fixed: changing it changes which rows reach a
  // production table, which is a behaviour change and not a refactor.
  assertEquals(calculateTitleSimilarity("Nutcracker", "Nutcracker"), 1);
  assert(calculateTitleSimilarity("The Nutcracker", "Nutcracker") < 0.2,
    "a four-character prefix shift scores near zero, and that is the shipped behaviour");
  assertEquals(calculateTitleSimilarity("", "anything"), 0);
});

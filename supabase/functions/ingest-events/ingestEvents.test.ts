/**
 * DMI-011 and DMI-012 — what the ingest endpoint decides, and what a retry does.
 *
 * `planIngest` is pure, so the interesting half of this endpoint is testable
 * without a database: which items become rows, which are rejected and why, and
 * which are duplicates of something already there.
 *
 * DMI-012's whole question — "does POSTing the same payload twice insert
 * anything the second time" — is answered here by feeding the first run's rows
 * back in as the existing set, which is exactly what the second request would
 * read out of the table.
 *
 * Run: `deno test --allow-read supabase/functions/ingest-events/ingestEvents.test.ts`
 */
import { assert, assertEquals, assertFalse, assertStringIncludes } from "jsr:@std/assert@1";
import { planIngest, validateItem } from "./plan.ts";
import { generateEventFingerprint, type ExistingEvent } from "../_shared/eventDedup.ts";

const URL_ = "https://hoytsherman.org/events/";

const item = (o: Record<string, unknown> = {}) => ({
  title: "Band Night",
  date: "2026-09-12 19:30:00",
  venue: "Hoyt Sherman Place",
  source_url: "https://hoytsherman.org/events/band-night",
  ...o,
});

/** The rows a first run produced, in the shape a second request reads back. */
const asExisting = (rows: Record<string, unknown>[]): ExistingEvent[] =>
  rows.map((r, i) => {
    const e = {
      id: `row-${i}`,
      title: String(r.title),
      date: (r.event_start_utc as Date).toISOString(),
      venue: String(r.venue),
      source_url: String(r.source_url),
    };
    return { ...e, fingerprint: generateEventFingerprint({ ...e, date: new Date(e.date) }) };
  });

Deno.test("a well-formed item becomes a row with all three date columns", () => {
  const v = validateItem(item(), URL_);
  assert(v.ok);
  if (!v.ok) return;
  assertEquals(v.row.title, "Band Night");
  assertEquals(v.row.event_start_local, "2026-09-12 19:30:00");
  assertEquals(v.row.event_timezone, "America/Chicago");
  assert(v.row.event_start_utc instanceof Date);
  // Central is UTC-5 in September, so 19:30 local is 00:30 UTC the next day.
  assertEquals((v.row.event_start_utc as Date).toISOString(), "2026-09-13T00:30:00.000Z");
});

Deno.test("a MALFORMED item is rejected with a named reason, never coerced", () => {
  // The three fields that decide whether a row is a real event. The cloud path
  // defaults a missing title to "Untitled Event"; on a public calendar that is
  // fiction, so this refuses instead.
  const noTitle = validateItem(item({ title: "" }), URL_);
  assertFalse(noTitle.ok);
  if (!noTitle.ok) assertStringIncludes(noTitle.reason, "missing title");

  const badDate = validateItem(item({ date: "sometime this autumn" }), URL_);
  assertFalse(badDate.ok);
  if (!badDate.ok) {
    assertStringIncludes(badDate.reason, "unparseable date");
    assertStringIncludes(badDate.reason, "invented date");
  }

  const noDate = validateItem(item({ date: undefined }), URL_);
  assertFalse(noDate.ok);

  const noUrl = validateItem(item({ source_url: "" }), "");
  assertFalse(noUrl.ok);

  // COUNTER-ASSERTION: the validator is not refusing everything. A missing
  // PRICE or venue is fine and defaults, because nothing turns on them.
  const thin = validateItem(item({ price: undefined, venue: undefined, description: undefined }), URL_);
  assert(thin.ok, "an item missing only optional fields is still a row");
  if (thin.ok) assertEquals(thin.row.price, "See website");
});

Deno.test("an item with no source_url falls back to the listing url", () => {
  const v = validateItem(item({ source_url: undefined }), URL_);
  assert(v.ok);
  if (v.ok) assertEquals(v.row.source_url, URL_);
});

Deno.test("rejections are ITEMIZED, not counted", () => {
  const plan = planIngest(
    [item(), item({ title: "" }), item({ date: "not a date", title: "Second" })],
    [],
    URL_,
  );
  assertEquals(plan.rows.length, 1);
  assertEquals(plan.rejected.length, 2);
  // The item itself comes back, so an operator can see WHICH extraction failed
  // rather than only that two did.
  assert(plan.rejected.every((r) => r.item && typeof r.reason === "string" && r.reason.length > 0));
  assertEquals((plan.rejected[1].item as { title: string }).title, "Second");
});

Deno.test("DMI-012 — the same payload twice inserts N then 0", () => {
  const payload = [item(), item({ title: "Second Show", source_url: "https://hoytsherman.org/events/second" })];

  const first = planIngest(payload, [], URL_);
  assertEquals(first.rows.length, 2, "first run inserts both");
  assertEquals(first.duplicates, 0);

  // The second request reads the first run's rows back out of the table.
  const second = planIngest(payload, asExisting(first.rows), URL_);
  assertEquals(second.rows.length, 0, "second run inserts nothing");
  assertEquals(second.duplicates, 2, "and reports them as DUPLICATES, not rejections");
  assertEquals(second.rejected.length, 0, "a retry is not a validation failure");
});

Deno.test("DMI-012 — a partial overlap inserts exactly the non-overlapping items", () => {
  const first = planIngest([item(), item({ title: "Second Show", source_url: "https://hoytsherman.org/events/second" })], [], URL_);
  const overlapping = [
    item(),
    item({ title: "Third Show", source_url: "https://hoytsherman.org/events/third" }),
  ];
  const second = planIngest(overlapping, asExisting(first.rows), URL_);
  assertEquals(second.duplicates, 1);
  assertEquals(second.rows.length, 1);
  assertEquals(second.rows[0].title, "Third Show");
});

Deno.test("DMI-012 counter — a genuinely NEW event in the second payload IS inserted", () => {
  // Without this, every assertion above would pass on an endpoint that refuses
  // everything on a retry, which is the opposite failure and just as bad.
  const first = planIngest([item()], [], URL_);
  const second = planIngest(
    [item(), item({ title: "Brand New Show", date: "2026-10-01 20:00:00", source_url: "https://hoytsherman.org/events/new" })],
    asExisting(first.rows),
    URL_,
  );
  assertEquals(second.duplicates, 1);
  assertEquals(second.rows.length, 1);
  assertEquals(second.rows[0].title, "Brand New Show");
});

Deno.test("a payload that repeats an event WITHIN itself writes it once", () => {
  // The batch must dedup against itself, not only against the database — or a
  // single request inserts the same show twice and the dedup never sees it.
  const plan = planIngest([item(), item(), item()], [], URL_);
  assertEquals(plan.rows.length, 1);
  assertEquals(plan.duplicates, 2);
});

Deno.test("dedup is the SHARED module's, not a second opinion", () => {
  // Tier 3 of _shared/eventDedup.ts: same title and venue within 24 hours. If
  // this file had its own dedup it would almost certainly be fingerprint-only
  // and would miss this.
  const existing = asExisting(planIngest([item()], [], URL_).rows);
  const shiftedOneHour = planIngest([item({ date: "2026-09-12 20:30:00", source_url: "https://hoytsherman.org/events/other" })], existing, URL_);
  assertEquals(shiftedOneHour.duplicates, 1, "an hour later at the same venue is the same show");

  const nextWeek = planIngest([item({ date: "2026-09-19 19:30:00", source_url: "https://hoytsherman.org/events/other" })], existing, URL_);
  assertEquals(nextWeek.rows.length, 1, "a week later is a real second show");
});

Deno.test("an empty payload writes nothing and rejects nothing", () => {
  const plan = planIngest([], [], URL_);
  assertEquals(plan.rows.length, 0);
  assertEquals(plan.duplicates, 0);
  assertEquals(plan.rejected.length, 0);
});

/**
 * Event-reminder email content (WEB-FEAT-057).
 * Run with: deno test --allow-read supabase/functions/send-event-reminders/content.test.ts
 */
import {
  NO_TIME_MARKER,
  type ReminderContentInput,
  reminderEventUrl,
  reminderSubject,
  reminderWhen,
  reminderWhere,
  timingPhrase,
} from "./content.ts";

function assertEquals<T>(actual: T, expected: T, msg = ""): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  expected: ${e}\n  actual:   ${a}`);
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

const SITE = "https://desmoinesinsider.com";

function reminder(overrides: Partial<ReminderContentInput> = {}): ReminderContentInput {
  return {
    event_id: "0b6f3a3e-9a55-4c1f-9b55-0d7f1f5d2a10",
    event_title: "Tacos & Tequila",
    // 2026-11-13 19:00 CST
    event_date: "2026-11-14T01:00:00+00:00",
    event_start_utc: "2026-11-14T01:00:00+00:00",
    event_venue: "Wooly's",
    event_location: "504 E Locust St, Des Moines",
    reminder_type: "1_day",
    ...overrides,
  };
}

// 2026-11-13 19:31:58 CST, the ingest sentinel for "no time given".
const NO_TIME_UTC = "2026-11-14T01:31:58+00:00";

Deno.test("subject is plain text: an ampersand is not HTML-escaped", () => {
  assertEquals(reminderSubject(reminder()), "Reminder: Tacos & Tequila starts tomorrow");
  assert(!reminderSubject(reminder({ event_title: `Rock "n" Roll's <Night>` })).includes("&"), "no entities");
});

Deno.test("subject falls back when the title is missing", () => {
  assertEquals(reminderSubject(reminder({ event_title: null })), "Reminder: Your event starts tomorrow");
});

Deno.test("link is the canonical dated slug, not a dateless title slug", () => {
  assertEquals(reminderEventUrl(reminder(), SITE), `${SITE}/events/tacos-tequila-2026-11-13`);
  assertEquals(reminderEventUrl(reminder(), `${SITE}/`), `${SITE}/events/tacos-tequila-2026-11-13`);
});

Deno.test("link falls back to the id when there is no usable title", () => {
  const r = reminder({ event_title: "!!!" });
  assertEquals(reminderEventUrl(r, SITE), `${SITE}/events/${r.event_id}`);
});

Deno.test("a stated time is printed in Central", () => {
  const when = reminderWhen(reminder());
  assert(when.includes("Friday, November 13, 2026"), when);
  assert(when.includes("7:00"), when);
  assert(/CST/.test(when), when);
});

Deno.test("the no-time sentinel is never printed as a time", () => {
  const r = reminder({ event_start_utc: NO_TIME_UTC, event_date: NO_TIME_UTC });
  const when = reminderWhen(r);
  assertEquals(when, "Friday, November 13, 2026");
  assert(!when.includes("7:31"), when);
});

Deno.test("timing phrase does not promise an hour nobody announced", () => {
  const base = { event_start_utc: NO_TIME_UTC, event_date: NO_TIME_UTC };
  assertEquals(timingPhrase(reminder({ ...base, reminder_type: "1_day" })), "is tomorrow");
  assertEquals(timingPhrase(reminder({ ...base, reminder_type: "3_hours" })), "is today");
  assertEquals(timingPhrase(reminder({ ...base, reminder_type: "1_hour" })), "is today");
  assertEquals(timingPhrase(reminder({ reminder_type: "3_hours" })), "starts in 3 hours");
  assertEquals(timingPhrase(reminder({ reminder_type: "1_hour" })), "starts in 1 hour");
  assertEquals(timingPhrase(reminder({ reminder_type: "weekly" })), "is coming up");
});

Deno.test("where: venue with address, address alone, duplicates, and neither", () => {
  assertEquals(reminderWhere(reminder()), { place: "Wooly's", address: "504 E Locust St, Des Moines" });
  assertEquals(reminderWhere(reminder({ event_venue: null })), { place: "504 E Locust St, Des Moines", address: null });
  assertEquals(reminderWhere(reminder({ event_location: "Wooly's" })), { place: "Wooly's", address: null });
  assertEquals(reminderWhere(reminder({ event_venue: " ", event_location: null })), null);
});

Deno.test("NO_TIME_MARKER matches the ingest constant", async () => {
  const src = await Deno.readTextFile(new URL("../_shared/eventDateTime.ts", import.meta.url));
  assert(src.includes(`export const NO_TIME_MARKER = "${NO_TIME_MARKER}";`), "sentinel drifted from eventDateTime.ts");
});

Deno.test("the sender uses this module and no longer escapes the subject", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assert(src.includes("reminderSubject("), "index.ts builds the subject with reminderSubject");
  assert(src.includes("reminderEventUrl("), "index.ts builds the link with reminderEventUrl");
  assert(!/subject\s*=\s*`[^`]*escapeHtml/.test(src), "subject is not HTML-escaped");
  assert(!src.includes("function createSlug"), "the dateless slug builder is gone");
});

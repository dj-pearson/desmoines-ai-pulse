/**
 * Event-reminder email content (WEB-FEAT-057), and the category it is sent
 * under (WEB-FEAT-063).
 * Run with: deno test --allow-read supabase/functions/send-event-reminders/content.test.ts
 */
import {
  NO_TIME_MARKER,
  REMINDER_EMAIL_CATEGORY,
  type ReminderContentInput,
  reminderEventUrl,
  reminderSendInput,
  reminderSubject,
  reminderWhen,
  reminderWhere,
  shouldSendReminder,
  timingPhrase,
} from "./content.ts";
import { sendEmail } from "../_shared/email.ts";

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

Deno.test("hour-level reminders are not sent for an event with no announced time (WEB-FEAT-058)", () => {
  const base = { event_start_utc: NO_TIME_UTC, event_date: NO_TIME_UTC };
  assertEquals(shouldSendReminder(reminder({ ...base, reminder_type: "3_hours" })), false, "3_hours untimed");
  assertEquals(shouldSendReminder(reminder({ ...base, reminder_type: "1_hour" })), false, "1_hour untimed");
  assertEquals(shouldSendReminder(reminder({ ...base, reminder_type: "1_day" })), true, "1_day untimed still goes");
  assertEquals(shouldSendReminder(reminder({ reminder_type: "3_hours" })), true, "3_hours timed");
  assertEquals(shouldSendReminder(reminder({ reminder_type: "1_hour" })), true, "1_hour timed");
  assertEquals(shouldSendReminder(reminder({ reminder_type: "1_day" })), true, "1_day timed");
});

Deno.test("the sender filters with shouldSendReminder before claiming", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assert(/\.filter\(shouldSendReminder\)/.test(src), "index.ts filters fetched reminders");
  assert(src.includes("sendable.map("), "only the filtered list is sent");
});

Deno.test("get_pending_reminders skips untimed events in the hour windows (WEB-FEAT-058)", async () => {
  const sql = await Deno.readTextFile(
    new URL("../../migrations/20261108000040_pending_reminders_skip_untimed_hour_windows.sql", import.meta.url),
  );
  assert(sql.includes("create or replace function public.get_pending_reminders(reminder_window text default '1_hour'::text)"), "same signature");
  const marker = `= '${NO_TIME_MARKER}'`;
  assertEquals(sql.split(marker).length - 1, 2, "both hour arms test the marker");
  assertEquals(sql.split("COALESCE(e.time_tbd, false)").length - 1, 2, "both hour arms test time_tbd");
  assert(sql.includes("REVOKE EXECUTE ON FUNCTION public.get_pending_reminders(text) FROM PUBLIC, anon, authenticated;"), "grants restated");
  assert(sql.includes("GRANT EXECUTE ON FUNCTION public.get_pending_reminders(text) TO service_role;"), "service_role keeps it");
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

Deno.test("the footer opt-out is this reminder's, not the newsletter's (WEB-FEAT-059)", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assert(src.includes("reminderToken: reminder.reminder_id"), "renderEmail gets the reminder id");
  assert(!src.includes("newsletter_subscribers"), "no newsletter token lookup");
  assert(!src.includes("unsubscribeToken:"), "no newsletter token in the footer");
});

// WEB-FEAT-063: a reminder is mail the user asked for on one event, so leaving
// the newsletter must not stop it. It went out as "marketing", and email.ts
// drops marketing for any address with an 'unsubscribe' row in
// email_suppressions, which the newsletter unsubscribe writes.

function suppressionDb(rows: Array<{ email: string; reason: string }>) {
  const logged: Array<Record<string, unknown>> = [];
  const client = {
    from(_table: string) {
      return {
        select() {
          return {
            in(_col: string, emails: string[]) {
              return Promise.resolve({ data: rows.filter((r) => emails.includes(r.email)), error: null });
            },
          };
        },
        insert(batch: Array<Record<string, unknown>>) {
          logged.push(...batch);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { client, logged };
}

const sendInput = () =>
  reminderSendInput(
    { user_email: "Reader@Example.com", event_id: "evt-1", reminder_type: "1_day" },
    {
      subject: "Reminder: Tacos & Tequila starts tomorrow",
      html: "<p>hi</p>",
      text: "hi",
      headers: {
        "List-Unsubscribe": "<https://x.supabase.co/functions/v1/email-unsubscribe?reminder=r1>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    },
  );

// No SES credentials: sendEmail stops after the suppression check and logs
// "skipped", so these tests never sign a request or touch the network.
const NO_SES = (_k: string) => undefined;

Deno.test("reminder: sent as transactional, keeping its one-click header, template and ref", () => {
  const input = sendInput();
  assertEquals(REMINDER_EMAIL_CATEGORY, "transactional");
  assertEquals(input.category, "transactional");
  assertEquals(input.template, "event_reminder_1_day");
  assertEquals(input.from, "Des Moines Insider <events@desmoinesinsider.com>");
  assertEquals(input.ref, { type: "event", id: "evt-1" });
  assert(String(input.headers?.["List-Unsubscribe"]).includes("reminder=r1"), "keeps the reminder one-click link");
});

Deno.test("reminder: a newsletter unsubscribe does not suppress it", async () => {
  const { client, logged } = suppressionDb([{ email: "reader@example.com", reason: "unsubscribe" }]);
  const res = await sendEmail(sendInput(), { env: NO_SES, supabase: client });
  assertEquals(res.suppressed, []);
  assertEquals(logged.map((r) => r.status), ["skipped"]);
});

Deno.test("reminder: a bounce, complaint or manual block still suppresses it", async () => {
  for (const reason of ["bounce", "complaint", "manual"]) {
    const { client, logged } = suppressionDb([{ email: "reader@example.com", reason }]);
    const res = await sendEmail(sendInput(), { env: NO_SES, supabase: client });
    assertEquals(res.error, "all recipients suppressed", reason);
    assertEquals(logged.map((r) => r.status), ["suppressed"], reason);
  }
});

Deno.test("reminder: index.ts sends through reminderSendInput, not a marketing literal", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assert(src.includes("reminderSendInput("), "index.ts builds the send with reminderSendInput");
  const call = src.slice(src.indexOf("await sendEmail("));
  const args = call.slice(0, call.indexOf("{ supabase }"));
  assert(!/category:\s*"marketing"/.test(args), "the sendEmail call carries no marketing category");
});

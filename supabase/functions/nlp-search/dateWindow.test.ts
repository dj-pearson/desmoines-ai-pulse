// Run with: deno test supabase/functions/nlp-search/dateWindow.test.ts
// No remote imports, same as _shared/centralTime.test.ts.
import { centralTodayStartUtc, nlpDateWindow } from "./dateWindow.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`expected ${e}, got ${a}`);
}

// 2026-09-25T02:00Z is Thursday Sep 24, 9:00 PM CDT (UTC-5).
const THU_EVENING = new Date("2026-09-25T02:00:00Z");

Deno.test("today is the Central day, not the UTC day", () => {
  assertEquals(nlpDateWindow("today", THU_EVENING), {
    start: "2026-09-24T05:00:00.000Z",
    end: "2026-09-25T04:59:59.999Z",
  });
});

Deno.test("tomorrow after 7pm CDT is Friday, not Saturday", () => {
  assertEquals(nlpDateWindow("tomorrow", THU_EVENING)?.start, "2026-09-25T05:00:00.000Z");
});

Deno.test("this weekend is Fri-Sun Central", () => {
  assertEquals(nlpDateWindow("this_weekend", THU_EVENING), {
    start: "2026-09-25T05:00:00.000Z",
    end: "2026-09-28T04:59:59.999Z",
  });
});

Deno.test("on Sunday, this weekend is the weekend in progress", () => {
  // Sun Sep 27, 10:00 AM CDT
  const w = nlpDateWindow("this_weekend", new Date("2026-09-27T15:00:00Z"));
  assertEquals(w?.start, "2026-09-25T05:00:00.000Z");
});

Deno.test("this week runs through Sunday; next week is Mon-Sun", () => {
  assertEquals(nlpDateWindow("this_week", THU_EVENING)?.end, "2026-09-28T04:59:59.999Z");
  assertEquals(nlpDateWindow("next_week", THU_EVENING), {
    start: "2026-09-28T05:00:00.000Z",
    end: "2026-10-05T04:59:59.999Z",
  });
});

Deno.test("DST end day is 25 hours", () => {
  const w = nlpDateWindow("specific", THU_EVENING, "2026-11-01")!;
  assertEquals(Date.parse(w.end) + 1 - Date.parse(w.start), 25 * 3600 * 1000);
});

Deno.test("invalid specific dates and unknown presets give no window", () => {
  assertEquals(nlpDateWindow("specific", THU_EVENING, "2026-02-30"), null);
  assertEquals(nlpDateWindow("specific", THU_EVENING, null), null);
  assertEquals(nlpDateWindow("someday", THU_EVENING), null);
});

Deno.test("default floor is the start of today in Central time", () => {
  assertEquals(centralTodayStartUtc(THU_EVENING), "2026-09-24T05:00:00.000Z");
});

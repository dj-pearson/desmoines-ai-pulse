import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * get_pending_reminders is read by a cron that runs once an hour at minute 0
 * (send-event-reminders-hourly). A reminder whose window is narrower than the
 * gap between runs is never picked up for some start minutes, and nothing
 * reports it: the row stays pending until the event starts
 * (WEB-FEAT-090).
 *
 * Postgres is not available in CI, so this reads each arm's BETWEEN bounds out
 * of the newest migration that defines the function and replays top-of-hour
 * runs against every start minute.
 */
const DIR = "supabase/migrations";
const PREVIOUS = "20261108000040_pending_reminders_skip_untimed_hour_windows.sql";
const TYPES = ["1_day", "3_hours", "1_hour"] as const;
type ReminderType = (typeof TYPES)[number];

/** The cron's own schedule, read so a change to it is noticed here. */
function cronIsHourlyAtMinuteZero(): boolean {
  const sql = readFileSync(`${DIR}/20251110000002_add_event_reminders_cron.sql`, "utf8");
  return /'send-event-reminders-hourly',\s*--[^\n]*\n\s*'0 \* \* \* \*'/.test(sql);
}

function newestDefinition(): string {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) =>
      /create or replace function public\.get_pending_reminders/i.test(readFileSync(`${DIR}/${f}`, "utf8")),
    );
  return files[files.length - 1];
}

/** "2 hours 30 minutes" -> 150. */
function minutes(interval: string): number {
  let total = 0;
  for (const [, n, unit] of interval.matchAll(/(\d+)\s*(hour|minute)s?/g)) {
    total += Number(n) * (unit === "hour" ? 60 : 1);
  }
  return total;
}

function windows(file: string): Record<ReminderType, [number, number]> {
  const sql = readFileSync(`${DIR}/${file}`, "utf8");
  const out = {} as Record<ReminderType, [number, number]>;
  for (const type of TYPES) {
    const arm = new RegExp(
      `r\\.reminder_type = '${type}'[\\s\\S]*?BETWEEN now\\(\\) \\+ INTERVAL '([^']+)' AND now\\(\\) \\+ INTERVAL '([^']+)'`,
    ).exec(sql);
    if (!arm) throw new Error(`${file}: no BETWEEN window for ${type}`);
    out[type] = [minutes(arm[1]), minutes(arm[2])];
  }
  return out;
}

/**
 * Start minutes past the hour (0-59) that no top-of-hour run ever sees inside
 * [lo, hi] minutes before the start. `lateBy` shifts every run, for a cron
 * that fires a little after minute 0.
 */
function missedStartMinutes([lo, hi]: [number, number], lateBy = 0): number[] {
  const missed: number[] = [];
  for (let m = 0; m < 60; m++) {
    // A start at minute m of hour 48 (two days out, so every window fits).
    const start = 48 * 60 + m;
    let seen = false;
    for (let run = lateBy; run < start; run += 60) {
      const lead = start - run;
      if (lead >= lo && lead <= hi) seen = true;
    }
    if (!seen) missed.push(m);
  }
  return missed;
}

describe("reminder windows cover the hourly cron", () => {
  const current = newestDefinition();

  it("reads the cron as hourly at minute 0", () => {
    expect(cronIsHourlyAtMinuteZero()).toBe(true);
  });

  it("replays the old windows and finds what they missed", () => {
    // Guards the replay itself: the windows WEB-FEAT-058 left behind missed
    // a 7:30 PM start for both hour-level reminders.
    const old = windows(PREVIOUS);
    expect(missedStartMinutes(old["3_hours"])).toContain(30);
    expect(missedStartMinutes(old["1_hour"])).toContain(30);
    expect(missedStartMinutes(old["1_hour"])).toContain(15);
    expect(missedStartMinutes(old["1_day"])).toEqual([]);
  });

  it.each(TYPES)("%s reaches every start minute", (type) => {
    expect(current).not.toBe(PREVIOUS);
    expect(missedStartMinutes(windows(current)[type])).toEqual([]);
  });

  it.each(TYPES)("%s still reaches every start minute when the run is 4 minutes late", (type) => {
    expect(missedStartMinutes(windows(current)[type], 4)).toEqual([]);
  });

  // 1_day says "starts tomorrow", not a count of hours, so it is not here.
  it.each([
    ["3_hours", 3 * 60],
    ["1_hour", 60],
  ] as const)("%s sends within 35 minutes of the lead its email names", (type, nominal) => {
    const [lo, hi] = windows(current)[type];
    expect(nominal - lo).toBeLessThanOrEqual(35);
    expect(hi - nominal).toBeLessThanOrEqual(35);
  });
});

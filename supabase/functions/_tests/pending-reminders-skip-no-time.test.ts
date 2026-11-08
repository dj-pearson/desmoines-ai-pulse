/**
 * WEB-FEAT-058. get_pending_reminders must not return 3_hours or 1_hour
 * reminders for an event stored at the no-time ingest sentinel.
 *
 * Those rows sit at 19:31:58 Central because the source gave a day and no
 * time, and the hour-level windows timed against that made-up instant sent
 * emails at 16:31 and 18:31. The fix is in SQL; this pins the migration
 * source, the sentinel literal against eventDateTime.ts, and that the newest
 * definition of the function is the one that carries the exclusion (a later
 * CREATE OR REPLACE copied from an older body would silently undo it).
 *
 * The behaviour itself was checked against Postgres 16 with a frozen clock:
 * before, a sentinel row returned at 3h and 1h out in both CST and CDT; after,
 * only the 1_day reminder and the real 7:30 PM show's reminders come back.
 */

import { assert } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));
const MIGRATION = 'supabase/migrations/20261108000040_pending_reminders_skip_no_time_events.sql';

const compact = (s: string) => s.replace(/\s+/g, ' ');

Deno.test('hour-level reminders on a sentinel row are excluded', async () => {
  const sql = compact(await read(MIGRATION));
  assert(
    sql.includes(
      "AND NOT ( r.reminder_type IN ('3_hours', '1_hour') AND (COALESCE(e.event_start_utc, e.date) AT TIME ZONE 'America/Chicago')::time = '19:31:58'::time )",
    ),
    'the exclusion must test the Central wall clock of the same instant the windows use',
  );
  // 1_day only needs the day, which a sentinel row has, so it keeps its window.
  assert(
    sql.includes("(r.reminder_type = '1_day' AND COALESCE(e.event_start_utc, e.date) BETWEEN now() + INTERVAL '23 hours' AND now() + INTERVAL '25 hours')"),
    '1_day must still be sent for sentinel rows',
  );
});

Deno.test('the SQL literal matches NO_TIME_MARKER', async () => {
  const src = await read('supabase/functions/_shared/eventDateTime.ts');
  const m = src.match(/export const NO_TIME_MARKER = "([^"]+)";/);
  assert(m, 'NO_TIME_MARKER not found');
  const sql = await read(MIGRATION);
  assert(sql.includes(`'${m[1]}'::time`), `sentinel drifted: eventDateTime.ts says ${m[1]}`);
});

Deno.test('signature and return shape are unchanged', async () => {
  const sql = compact(await read(MIGRATION));
  assert(sql.includes("create or replace function public.get_pending_reminders(reminder_window text default '1_hour'::text)"));
  assert(
    sql.includes(
      'returns table( reminder_id uuid, user_id uuid, user_email text, event_id uuid, event_title text, event_date timestamp with time zone, event_start_utc timestamp with time zone, event_venue text, event_location text, reminder_type text, time_until_event interval )',
    ),
    'send-event-reminders reads these columns; the shape must not change',
  );
  assert(sql.includes('security definer'));
  assert(sql.includes("set search_path to 'public', 'pg_temp'"));
  assert(sql.includes('u.email::text as user_email'), 'auth.users.email is varchar(255); the cast is load-bearing (20260830000001)');
  assert(!/\b(grant|revoke)\b/i.test(sql.replace(/--.*$/gm, '')), 'grants stay as 20261015000006 left them');
});

Deno.test('no later migration redefines get_pending_reminders without the exclusion', async () => {
  const name = MIGRATION.split('/').pop()!;
  const later: string[] = [];
  for await (const e of Deno.readDir(new URL('supabase/migrations/', REPO))) {
    if (!e.isFile || !e.name.endsWith('.sql') || e.name <= name) continue;
    const sql = await read(`supabase/migrations/${e.name}`);
    if (/function\s+public\.get_pending_reminders\s*\(/i.test(sql) && !sql.includes("'19:31:58'::time")) {
      later.push(e.name);
    }
  }
  assert(later.length === 0, `redefined without the no-time exclusion: ${later.join(', ')}`);
});

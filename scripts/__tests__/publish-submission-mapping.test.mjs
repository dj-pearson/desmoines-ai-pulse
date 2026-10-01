#!/usr/bin/env node
/**
 * Publishing a submission carries EVERY field the organizer filled in
 * (WEB-ADS-008 AC5).
 *
 * THE BUG THIS EXISTS FOR IS A COUNT. triage-event-submission's inline insert
 * mapped ten columns. user_submitted_events has sixteen that carry the
 * organizer's own data, so start_time, end_time, address, contact_email,
 * contact_phone and tags were silently dropped - and nothing was wrong with
 * the insert: it succeeded, the event appeared, and only the organizer knew
 * their start time had gone. A field added to the form later would go the same
 * way, quietly, which is why this compares the two lists rather than checking
 * for six named columns.
 *
 * WHAT THIS CANNOT DO. There is no Postgres in this container, so the function
 * is not executed here - the mapping is read out of the migration's own INSERT.
 * check-migrations-parse already runs every migration through the real Postgres
 * grammar, so the syntax is covered; what is NOT covered anywhere is whether
 * the function does the right thing at runtime, and that needs the owner to
 * apply it. Said plainly rather than implied.
 */
import { readFileSync } from 'node:fs';

const MIGRATION = 'supabase/migrations/20260920000001_publish_submission.sql';
const sql = readFileSync(MIGRATION, 'utf8');
// SQL line comments start with `--`, and this migration's header discusses the
// dropped columns by name. A check that matched them in the prose explaining
// the bug would pass with the INSERT gutted.
const code = sql.replace(/^\s*--[^\n]*$/gm, '');
const types = readFileSync('src/integrations/supabase/types.ts', 'utf8');

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

/** The Row keys of a table in the generated types. */
function rowColumns(table) {
  const start = types.indexOf(`      ${table}: {`);
  const rowStart = types.indexOf('Row: {', start);
  const rowEnd = types.indexOf('Insert:', rowStart);
  return [...types.slice(rowStart, rowEnd).matchAll(/^\s{10}([a-z_]+):/gm)].map((m) => m[1]);
}

/**
 * Columns that are the WORKFLOW's, not the organizer's: identity, review state
 * and triage bookkeeping. Each has a reason to be here; a new column is NOT
 * added to this list to make the check pass.
 */
const NOT_CONTENT = new Set([
  'id',                 // becomes events.submission_id
  'user_id',            // becomes events.submitted_by
  'status',             // set by publish_submission itself
  'admin_notes',        // the reviewer's, not the organizer's
  'admin_reviewed_at',
  'admin_reviewed_by',
  'auto_decided',       // triage bookkeeping
  'quality_score',
  'triage_reasons',
  'triaged_at',
  'created_at',
  'updated_at',
  'submitted_at',
]);

console.log('\nevery field the organizer filled in reaches the listing');

const submissionColumns = rowColumns('user_submitted_events');
check('the submission columns were read', submissionColumns.length > 10, String(submissionColumns.length));

// Everything the migration reads off the submission row.
const mapped = new Set([...code.matchAll(/\bs\.([a-z_]+)\b/g)].map((m) => m[1]));

const content = submissionColumns.filter((c) => !NOT_CONTENT.has(c));
const dropped = content.filter((c) => !mapped.has(c));
check(
  `all ${content.length} content columns are mapped`,
  dropped.length === 0,
  dropped.length ? `dropped: ${dropped.join(', ')}` : '',
);

// The six the inline insert lost, named so a regression says which.
for (const column of ['start_time', 'end_time', 'address', 'contact_email', 'contact_phone', 'tags']) {
  check(`  ${column} survives`, mapped.has(column));
}

console.log('\nprovenance, idempotency and authorization');
{
  check('the events row points back at the submission', /s\.id,?\s*$/m.test(code) && /submission_id/.test(code));
  check('and at the submitter', /submitted_by/.test(code) && mapped.has('user_id'));
  check('one published event per submission', /CREATE UNIQUE INDEX[\s\S]*?events_submission_id_unique/.test(code));
  check(
    're-approving updates the live listing instead of adding a second one',
    /ON CONFLICT \(submission_id\)[\s\S]*?DO UPDATE SET/.test(code),
  );
  check(
    'a re-approved listing comes back from hidden or archived',
    /is_hidden = false/.test(code) && /archived_at = NULL/.test(code),
  );
  // The organizer must not be able to publish their own submission.
  check(
    'only an admin or the service role may publish',
    /auth\.role\(\), ''\) = 'service_role' OR public\.is_admin\(\)/.test(code),
  );
  check('and the function refuses rather than returning quietly', /RAISE EXCEPTION 'publish_submission: not authorized'/.test(code));
  check('anon cannot execute it', /REVOKE ALL ON FUNCTION public\.publish_submission\(uuid, text\) FROM anon/.test(code));
}

console.log('\nthe time convention matches the one every ingestion path uses');
{
  const dt = readFileSync('supabase/functions/_shared/eventDateTime.ts', 'utf8');
  const marker = /NO_TIME_MARKER = "([\d:]+)"/.exec(dt)?.[1];
  check('eventDateTime still declares a marker', !!marker, String(marker));
  // A submission with no start time must be stamped with the SAME sentinel the
  // scrapers use, or the dedup tiers see two different "no time" values.
  check(`the migration uses that marker (${marker})`, code.includes(`'${marker}'`), marker);
  check('and stamps America/Chicago, not the server zone', /AT TIME ZONE 'America\/Chicago'/.test(code));
  check('event_start_local holds the wall clock', /event_start_local/.test(code));
}

console.log('\nboth approve paths go through it');
{
  const triage = readFileSync('supabase/functions/triage-event-submission/index.ts', 'utf8');
  check('the AI path calls the function', /rpc\('publish_submission'/.test(triage));
  check(
    'and no longer inserts into events itself',
    !/from\('events'\)\.insert/.test(triage.replace(/\s+/g, '')),
  );

  const manager = readFileSync('src/components/admin/EventSubmissionsManager.tsx', 'utf8');
  check('the human approve button calls it', /rpc\("publish_submission" as never/.test(manager));
  check(
    'a submission that failed to publish is NOT marked approved',
    /const idsToPatch = next === "approved" \? published : ids;/.test(manager),
  );
  check(
    'the panel no longer sends admins to a workflow that cannot publish',
    !/promote them to\s*\n\s*live events from the existing \/admin\/content workflow/.test(manager),
  );
}

console.log('\nan edit after approval takes the listing down until it is re-reviewed (AC3)');
{
  check('unpublish_submission exists', /CREATE OR REPLACE FUNCTION public\.unpublish_submission\(p_submission_id uuid\)/.test(code));
  check('it hides rather than deletes, so the URL survives a re-approval', /SET is_hidden = true/.test(code) && !/DELETE FROM public\.events/.test(code));
  check('the submitter may take their OWN listing down', /auth\.uid\(\) = v_owner/.test(code));
  check('and nobody else can', /RAISE EXCEPTION 'unpublish_submission: not authorized'/.test(code));
  check('anon cannot execute it', /REVOKE ALL ON FUNCTION public\.unpublish_submission\(uuid\) FROM anon/.test(code));

  const hook = readFileSync('src/hooks/useUserSubmittedEvents.ts', 'utf8');
  check('the edit path calls it', /rpc\(\s*'unpublish_submission' as never/.test(hook));
  // Only when the edit re-pends. An admin patching a field must not knock a
  // live listing off the site as a side effect.
  check('but only when the edit re-pends the submission', /if \(eventData\.status === 'pending'\)/.test(hook));
  check(
    'and a failure there does not roll back the edit',
    /unpublishError && import\.meta\.env\.DEV/.test(hook),
  );
}

console.log('\nthe wall clock is built from the Central date, not timestamptz text (account WP4 item 3)');
{
  const FIX = 'supabase/migrations/20260926000002_publish_submission_central_date.sql';
  const fix = readFileSync(FIX, 'utf8').replace(/^\s*--[^\n]*$/gm, '');

  // The LAST migration that defines the function is the one production runs,
  // so the mapping guarantees above have to hold for it too.
  check(
    'it replaces the same function with the same signature',
    /CREATE OR REPLACE FUNCTION public\.publish_submission\(\s*p_submission_id uuid,\s*p_admin_notes text DEFAULT NULL\s*\)\s*RETURNS uuid/.test(fix),
  );
  const fixMapped = new Set([...fix.matchAll(/\bs\.([a-z_]+)\b/g)].map((m) => m[1]));
  const fixDropped = content.filter((c) => !fixMapped.has(c));
  check(
    `and still maps all ${content.length} content columns`,
    fixDropped.length === 0,
    fixDropped.length ? `dropped: ${fixDropped.join(', ')}` : '',
  );
  check('it keeps the admin-or-service-role gate', /auth\.role\(\), ''\) = 'service_role' OR public\.is_admin\(\)/.test(fix));
  check('anon still cannot execute it', /REVOKE ALL ON FUNCTION public\.publish_submission\(uuid, text\) FROM anon/.test(fix));
  check('it still upserts on submission_id', /ON CONFLICT \(submission_id\)[\s\S]*?DO UPDATE SET/.test(fix));
  check(
    'the day is read in America/Chicago',
    /v_local_date := \(s\.date AT TIME ZONE 'America\/Chicago'\)::date;/.test(fix),
  );
  check('no timestamptz is concatenated as text', !/s\.date::text\s*\|\|/.test(fix));
  check(
    'start and end are both built from that day',
    /v_start_local := \(v_local_date::text \|\|/.test(fix) && /\(v_local_date::text \|\| ' ' \|\| s\.end_time::text\)::timestamp/.test(fix),
  );

  // There is no Postgres here, so both expressions are modelled on a real
  // timestamptz input: what the form stores for "Oct 1" picked in a Central
  // browser is local midnight through toISOString().
  const TIMESTAMP_LITERAL = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/;
  /** timestamptz::text in a UTC session, which is what Supabase runs. */
  const timestamptzText = (iso) => new Date(iso).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '+00');
  /** (ts AT TIME ZONE 'America/Chicago')::date */
  const centralDate = (iso) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(iso));
  const oldExpr = (iso, time) => `${timestamptzText(iso)} ${time || '19:31:58'}`;
  const newExpr = (iso, time) => `${centralDate(iso)} ${time || '19:31:58'}`;

  const cdtMidnight = '2026-10-01T05:00:00.000Z';
  check(
    'model: the old expression is not a timestamp Postgres can parse',
    !TIMESTAMP_LITERAL.test(oldExpr(cdtMidnight, '19:00')),
    oldExpr(cdtMidnight, '19:00'),
  );
  check(
    'model: the new one is, on the day picked (CDT)',
    newExpr(cdtMidnight, '19:00') === '2026-10-01 19:00',
    newExpr(cdtMidnight, '19:00'),
  );
  check(
    'model: and in winter (CST midnight is 06:00Z)',
    newExpr('2026-12-05T06:00:00.000Z', '') === '2026-12-05 19:31:58',
    newExpr('2026-12-05T06:00:00.000Z', ''),
  );
  check(
    'model: a Pacific browser lands on the same day',
    newExpr('2026-10-01T07:00:00.000Z', '18:30') === '2026-10-01 18:30',
    newExpr('2026-10-01T07:00:00.000Z', '18:30'),
  );
  // Known and written down in the migration header: an Eastern browser's
  // midnight is 23:00 Central the day before. Pinned so a change to that is
  // deliberate, and so nobody reads the three checks above as "every zone".
  check(
    'model: an Eastern browser still lands a day early, as the header says',
    centralDate('2026-10-01T04:00:00.000Z') === '2026-09-30' && /east of Central/.test(readFileSync(FIX, 'utf8')),
  );
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);

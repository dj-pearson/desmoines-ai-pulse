#!/usr/bin/env node
/**
 * The both-or-neither rule for events' two unpublish switches (WEB-BE-034 AC3).
 *
 *   npx tsx scripts/__tests__/event-unpublish-filters.test.mjs
 *
 * The rule is the ASYMMETRY. A query that filters one switch has already
 * decided it cares about visibility, so forgetting the other is provably a
 * mistake; a query that filters neither is an admin view and is none of this
 * check's business. Getting that distinction wrong in either direction breaks
 * the check: too strict and 94 legitimate queries fail, too loose and it
 * reports nothing.
 */
import { scanSource } from '../check-event-unpublish-filters.mjs';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ' :: ' + detail : ''}`);
  }
};

console.log('[event-unpublish] the both-or-neither rule');

// 1. The two halves of the real defect.
check(
  'is_hidden without archived_at is reported',
  scanSource(`supabase.from('events').select('id').neq('is_hidden', true)`)[0]?.missing === 'archived_at',
);
check(
  'archived_at without is_hidden is reported',
  scanSource(`supabase.from("events").select("id").is("archived_at", null)`)[0]?.missing === 'is_hidden',
);

// 2. Both, and neither, are silent.
check('both filters is silent', scanSource(`supabase.from('events').select('id').neq('is_hidden', true).is('archived_at', null)`).length === 0);
check('neither filter is silent', scanSource(`supabase.from('events').select('id').gte('date', today)`).length === 0);

// 3. A WRITE is not a reader. The archive sweep's own UPDATE filters
//    archived_at because that is its job.
check(
  'an update filtering archived_at is skipped',
  scanSource(`supabase.from("events").update({ archived_at: now }).eq("id", id).is("archived_at", null)`).length === 0,
);
check(
  'an insert is skipped',
  scanSource(`supabase.from("events").insert({ is_hidden: false })`).length === 0,
);
check(
  'a delete is skipped',
  scanSource(`supabase.from("events").delete().lt("date", cutoff).eq("is_hidden", true)`).length === 0,
);

// 4. THE BOUND. Without terminating the chain at the next query, one read
//    absorbs the next one's filters and an asymmetric query goes unreported -
//    the same defect check-schema-usage had to fix twice.
{
  const two = `
    const a = await supabase.from('events').select('id').neq('is_hidden', true);
    const b = await supabase.from('events').select('id').is('archived_at', null);
  `;
  const found = scanSource(two);
  check('two adjacent queries are judged separately', found.length === 2, JSON.stringify(found.map((f) => f.missing)));
  check('and each is missing the other switch', found[0]?.missing === 'archived_at' && found[1]?.missing === 'is_hidden');
}

// 5. Line numbers point at the query, not at the file start.
{
  const src = `line one\nline two\nsupabase.from('events').select('id').neq('is_hidden', true)`;
  check('the reported line is the query line', scanSource(src, 'x.ts')[0]?.line === 3, JSON.stringify(scanSource(src, 'x.ts')[0]));
}

// 6. The checked-in baseline only ever excuses a job that owns a switch.
{
  const { readFileSync } = await import('node:fs');
  const baseline = JSON.parse(readFileSync('.github/event-unpublish-baseline.json', 'utf8'));
  check('the baseline is non-empty', (baseline.allowed ?? []).length > 0);
  const noReason = (baseline.allowed ?? []).filter((a) => !a.site || !a.reason);
  check('every entry carries a site and a reason', noReason.length === 0, JSON.stringify(noReason));
  // A reader surface in here would be the check excusing the very thing it
  // exists to catch.
  const readers = (baseline.allowed ?? []).filter((a) =>
    /sitemap|digest|alerts|poster|EventsPage|Hub|pages\//i.test(a.site),
  );
  check('no reader surface is baselined', readers.length === 0, JSON.stringify(readers.map((r) => r.site)));
}

if (failures > 0) {
  console.error(`[event-unpublish] ${failures} failure(s)`);
  process.exit(1);
}
console.log('[event-unpublish] all checks passed');

#!/usr/bin/env node
/**
 * The weekly dependency agent's selection rules (WEB-QUAL-011).
 *
 *   npx tsx scripts/__tests__/dep-update-plan.test.mjs
 *
 * These rules used to live in a heredoc inside
 * .github/workflows/dependency-update.yml, where they were exercised once a
 * week, in production, with nothing asserting anything. Two of them were wrong
 * for ten weeks and the workflow reported success anyway.
 */
import { planUpdates, compareVersions, loadHolds } from '../plan-dep-updates.mjs';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ' :: ' + detail : ''}`);
  }
};

console.log('[dep-update-plan] selection rules');

const HOLDS = [
  { name: '@supabase/supabase-js', firstBadVersion: '2.85.0', reason: 'TS2589', story: 'WEB-QUAL-012' },
  { name: 'three', reason: 'moves with fiber 9', story: 'WEB-QUAL-015' },
];

// 1. An ordinary same-major bump is applied.
{
  const { nonBreaking, majors, held } = planUpdates(
    { '@sentry/react': { current: '10.47.0', wanted: '10.75.0', latest: '10.75.0' } },
    HOLDS,
  );
  check('same-major bump lands', nonBreaking.length === 1 && nonBreaking[0].wanted === '10.75.0');
  check('and is not counted as a major or a hold', majors.length === 0 && held.length === 0);
}

// 2. A major is escalated, never installed.
{
  const { nonBreaking, majors } = planUpdates(
    { react: { current: '18.3.1', wanted: '18.3.1', latest: '19.3.0' } },
    HOLDS,
  );
  check('major escalates', majors.length === 1 && majors[0].latest === '19.3.0');
  check('major is not installed', nonBreaking.length === 0);
}

// 3. THE RULE THAT WAS MISSING. A held package is withheld from the batch so
//    the other sixty can still land.
{
  const { nonBreaking, held } = planUpdates(
    {
      '@supabase/supabase-js': { current: '2.84.0', wanted: '2.116.0', latest: '2.116.0' },
      '@sentry/react': { current: '10.47.0', wanted: '10.75.0', latest: '10.75.0' },
    },
    HOLDS,
  );
  check('held package is withheld', held.length === 1 && held[0].name === '@supabase/supabase-js');
  check('the hold carries its owning story', held[0].story === 'WEB-QUAL-012');
  check('the rest of the batch still lands', nonBreaking.length === 1 && nonBreaking[0].name === '@sentry/react');
}

// 4. firstBadVersion is a floor, not a blanket ban: a patch release BELOW it
//    still lands, so a hold does not freeze a package's whole minor line.
{
  const { nonBreaking, held } = planUpdates(
    { '@supabase/supabase-js': { current: '2.84.0', wanted: '2.84.3', latest: '2.84.3' } },
    HOLDS,
  );
  check('a target below firstBadVersion still lands', held.length === 0 && nonBreaking.length === 1);

  const bad = planUpdates(
    { '@supabase/supabase-js': { current: '2.84.0', wanted: '2.85.0', latest: '2.85.0' } },
    HOLDS,
  );
  check('the first bad version itself is held', bad.held.length === 1 && bad.nonBreaking.length === 0);
}

// 5. A hold with no belowVersion blocks every version.
{
  const { held } = planUpdates({ three: { current: '0.160.1', wanted: '0.186.0', latest: '0.186.0' } }, HOLDS);
  check('an open-ended hold blocks any target', held.length === 1 && held[0].name === 'three');
}

// 6. Never move backwards. npm's `latest` for @types/dompurify is 3.0.5, the
//    deprecation stub, against an installed 3.2.0.
{
  const { nonBreaking, held, majors } = planUpdates(
    { '@types/dompurify': { current: '3.2.0', wanted: '3.0.5', latest: '3.0.5' } },
    HOLDS,
  );
  check('a backwards `latest` is skipped', nonBreaking.length === 0 && held.length === 0 && majors.length === 0);
}

// 7. compareVersions ignores range prefixes and short versions.
{
  check('^ prefix ignored', compareVersions('^2.116.0', '2.85.0') > 0);
  check('missing patch is zero', compareVersions('1.2', '1.2.0') === 0);
  check('equal is zero', compareVersions('2.84.0', '2.84.0') === 0);
}

// 8. The checked-in hold file parses and every entry carries a reason.
{
  const holds = loadHolds('.github/dependency-update-holds.json');
  check('hold file is non-empty', holds.length > 0, `got ${holds.length}`);
  const missing = holds.filter((h) => !h.name || !h.reason);
  check('every hold names a package and a reason', missing.length === 0, JSON.stringify(missing));
  const undated = holds.filter((h) => !h.review);
  check('every hold carries a review date', undated.length === 0, undated.map((h) => h.name).join(', '));
  const supa = holds.find((h) => h.name === '@supabase/supabase-js');
  check('supabase-js is held from 2.85.0 up', Boolean(supa) && supa.firstBadVersion === '2.85.0');
}

if (failures > 0) {
  console.error(`[dep-update-plan] ${failures} failure(s)`);
  process.exit(1);
}
console.log('[dep-update-plan] all checks passed');

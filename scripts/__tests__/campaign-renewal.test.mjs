#!/usr/bin/env node
/**
 * Renewing a campaign (WEB-ADS-011 AC3), and the drift trap that comes with
 * replacing a function a test already reads.
 *
 * TWO THINGS ARE CHECKED HERE AND THE SECOND IS THE ONE WITH TEETH.
 *
 * 1. renewal_eligible is flagged seven days BEFORE the end. It used to be
 *    written on completion only, by which time renewing buys a gap - the ads
 *    stop and start again whenever the advertiser gets round to it.
 *
 * 2. THE NEWEST DEFINITION IS THE ONE THAT RUNS. campaign-lifecycle-contract
 *    .test.ts reads process_campaign_lifecycle out of a migration by path. A
 *    CREATE OR REPLACE in a later file leaves that test validating a definition
 *    the database no longer has: green, and measuring nothing. This file fails
 *    when any migration NEWER than the one that test reads redefines the
 *    function, so the next person to replace it is told to repoint the test
 *    rather than finding out later.
 *
 * NO POSTGRES HERE, so nothing is executed. check-migrations-parse puts every
 * migration through the real Postgres grammar; behaviour needs the owner.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'supabase/migrations';
const CONTRACT = 'supabase/functions/_tests/campaign-lifecycle-contract.test.ts';
const DEF = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.process_campaign_lifecycle\s*\(/i;

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`); }
};

/** SQL line comments stripped: these files explain the old behaviour in prose. */
const codeOf = (file) =>
  readFileSync(join(DIR, file), 'utf8').replace(/^\s*--[^\n]*$/gm, '');

const migrations = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
const definers = migrations.filter((f) => DEF.test(codeOf(f)));

console.log('\nwhichever definition is newest is the one that runs');
{
  check('some migration defines process_campaign_lifecycle', definers.length > 0);
  const newest = definers[definers.length - 1];
  console.log(`        newest definer: ${newest}`);

  const contract = readFileSync(CONTRACT, 'utf8');
  const readPaths = [...contract.matchAll(/supabase\/migrations\/([0-9a-z_]+\.sql)/g)].map((m) => m[1]);
  check('the contract test names the migrations it reads', readPaths.length > 0, JSON.stringify(readPaths));

  // THE ASSERTION. If the contract test does not read the newest definer, it is
  // asserting about a definition the database has replaced.
  check(
    `the contract test reads the newest definer (${newest})`,
    readPaths.includes(newest),
    `it reads ${JSON.stringify(readPaths)} - repoint it, or this check is measuring nothing`,
  );
}

console.log('\nthe renewal window is seven days before the end, not after it');
{
  const sql = codeOf('20260920000004_campaign_renewal.sql');
  check('the lifecycle job flags the window', /end_date::date <= CURRENT_DATE \+ 7/.test(sql));
  check('  only for campaigns that are running', /status::text = 'active'/.test(sql));
  // A paused campaign's end_date moves when it resumes, so a date seven days
  // out means nothing yet.
  check('  and not for paused ones', !/status::text IN \('active', 'paused'\)/.test(sql));
  // The column is on a table created outside migrations - the same guard the
  // completion write already uses.
  check('  guarded on the column existing', /column_name = 'renewal_eligible'/.test(sql));
  check('  and it does not re-flag every night', /renewal_eligible IS NOT TRUE/.test(sql));
  check('the count is reported', /'renewal_window', renewal_window_count/.test(sql));
  // The completion write from 20260902000003 must survive the replacement.
  check('completion still flags too', /UPDATE public\.campaigns SET renewal_eligible = true WHERE id = ANY\(\$1\)/.test(sql));
  check('and activation still goes through activate_campaign', /PERFORM public\.activate_campaign\(r\.id\)/.test(sql));
  check('the job still never sets active itself', !/SET status = 'active'/.test(sql));
}

console.log('\nrenewing clones the campaign and NOT its price');
{
  const sql = codeOf('20260920000004_campaign_renewal.sql');
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.renew_campaign(');
  const fn = sql.slice(start, sql.indexOf('\n$$;', start));
  check('renew_campaign exists', start !== -1);

  // THE MONEY ASSERTION. The clone inserts placement_type and nothing else;
  // trg_campaign_placement_pricing fills days_count, daily_cost and total_cost
  // from the rate card for the NEW dates. Copying the old totals would carry a
  // stale price into a new charge.
  check(
    'placements are cloned by TYPE only',
    /INSERT INTO public\.campaign_placements \(campaign_id, placement_type\)/.test(fn),
    'a price column here is last quarter\'s rate card',
  );
  check('  no cost is copied', !/total_cost/.test(fn) && !/daily_cost/.test(fn));
  check('  and no day count is copied', !/days_count/.test(fn));
  check('the clone starts unpaid', /'draft',/.test(fn));
  check('it points back at the original', /original_campaign_id/.test(fn));
  check('the new window is the same length', /v_days := greatest\(1, \(c\.end_date::date - c\.start_date::date\) \+ 1\)/.test(fn));
  check('and starts after the original ends', /v_start := greatest\(current_date, c\.end_date::date \+ 1\)/.test(fn));
  // A function that takes dates lets the caller choose the window; here the
  // window is derived, and the draft is editable afterwards like any other.
  check('it takes no dates', /renew_campaign\(p_campaign_id uuid\)/.test(sql));
  check('only a campaign that ran can be renewed', /NOT IN \('active', 'paused', 'completed'\)/.test(fn));
  check('the source stops prompting once renewed', /SET renewal_eligible = false/.test(fn));
  check('owner or admin only', /public\.is_admin\(\) OR \(auth\.uid\(\) IS NOT NULL AND auth\.uid\(\) = c\.user_id\)/.test(fn));
  check('anon cannot execute it', /REVOKE ALL ON FUNCTION public\.renew_campaign\(uuid\) FROM anon/.test(sql));
}

console.log('\nthe dashboard offers it');
{
  const hook = readFileSync('src/hooks/useCampaigns.ts', 'utf8');
  check('the hook calls renew_campaign', /'renew_campaign'/.test(hook));
  const dashboard = readFileSync('src/pages/CampaignDashboard.tsx', 'utf8');
  check('the dashboard has a Renew action', /renewCampaign\(campaign\.id\)/.test(dashboard));
  check('  shown when the campaign is in its renewal window', /renewal_eligible/.test(dashboard));
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);

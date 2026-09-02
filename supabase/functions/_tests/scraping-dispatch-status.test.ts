/**
 * Scraping dispatch status contract (WEB-BE-035).
 *
 * The pg_cron dispatcher flipped scraping_jobs.status to 'running' before an
 * asynchronous POST, and scrape-events only looked for 'idle', so a dispatched
 * job was never found and every row ended up stuck. The two halves of the fix
 * live in different languages and different deploy paths (a migration and an
 * edge function), which is exactly how they drifted. This test holds them
 * together.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  acceptedJobStatuses,
  JOB_STATUS_IDLE,
  JOB_STATUS_RUNNING,
} from '../_shared/scrapingJobStatus.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));

Deno.test('a job named by id is found whether it is idle or running', () => {
  const statuses = acceptedJobStatuses('6f1c3a10-0000-4000-8000-000000000001');
  assert(statuses.includes(JOB_STATUS_RUNNING), 'a dispatched job may still carry the old running flag');
  assert(statuses.includes(JOB_STATUS_IDLE));
});

Deno.test('the unnamed path (process whatever is due) keeps the idle-only filter', () => {
  assertEquals(acceptedJobStatuses(null), [JOB_STATUS_IDLE]);
  assertEquals(acceptedJobStatuses(undefined), [JOB_STATUS_IDLE]);
  assertEquals(acceptedJobStatuses(''), [JOB_STATUS_IDLE]);
});

Deno.test('scrape-events uses the shared contract and resets status on completion', async () => {
  const src = await read('supabase/functions/scrape-events/index.ts');
  assert(/from ["']\.\.\/_shared\/scrapingJobStatus\.ts["']/.test(src), 'must import the shared contract');
  assert(/\.in\("status", acceptedJobStatuses\(jobId\)\)/.test(src), 'the job lookup must filter through acceptedJobStatuses');
  assert(!/\.eq\("status", "idle"\)/.test(src), 'no hardcoded idle-only lookup may remain');
  // The completion write is the ONLY status writer left in the system.
  assert(
    /status: JOB_STATUS_IDLE,\s*\n\s*last_run: new Date\(\)\.toISOString\(\),/.test(src),
    'finishing a job must write status idle together with last_run',
  );
});

Deno.test('the dispatcher never writes status or last_run, and raises without a key', async () => {
  const sql = await read('supabase/migrations/20260902000005_scraping_dispatch_status.sql');
  const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.run_scraping_jobs\(\)[\s\S]*?\n\$\$;/);
  assert(fn, 'run_scraping_jobs must be restated');
  const body = fn[0];
  assert(!/SET status = 'running'/.test(body), 'the dispatcher must not flip status to running');
  assert(!/status = 'idle'/.test(body), 'the dispatcher must not write status at all');
  assert(!/last_run\s*=/.test(body), 'last_run belongs to scrape-events');
  assert(!/WHERE status/.test(body), 'dispatch must not depend on status: nothing maintains it for the dispatcher');
  assert(/public\.app_secret\('service_role_key'\)/.test(body), 'credentials come from Vault');
  assert(/RAISE EXCEPTION 'run_scraping_jobs not run: vault secret service_role_key is missing'/.test(body));
  assert(!/vault\.get_secret|Bearer eyJ/.test(body), 'no dead credential path');
  assert(/url\s*:=\s*function_url::text/.test(body), 'pg_net needs a text url');
  assert(/SET next_run = next_run_time/.test(body), 'next_run must still advance');
});

Deno.test('the duplicate dispatcher is unscheduled and stuck rows are repaired', async () => {
  const sql = await read('supabase/migrations/20260902000005_scraping_dispatch_status.sql');
  assert(/cron\.unschedule\('auto-trigger-scraping-jobs'\)/.test(sql), 'the 10-minute dispatcher must be unscheduled');
  assert(!/DROP FUNCTION/.test(sql), 'nothing is dropped');
  assert(/SET status = 'idle', updated_at = NOW\(\)\s+WHERE status = 'running'/.test(sql), 'the repair resets running to idle');
  assert(/RAISE NOTICE 'WEB-BE-035 repair/.test(sql), 'the repair count must be reported');
});

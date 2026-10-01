/**
 * The restaurant-opening scraper fails loudly when every source fails
 * (WEB-BE-041 AC5).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/restaurant-opening-run-summary.test.ts
 *
 * WHAT THIS IS PROTECTING. index.ts returned `{ success: true }` and HTTP 200
 * on every path. It hardcoded `model: 'claude-3-5-sonnet-20241022'`, which is
 * retired, so the API answered not_found for every source on every run - and
 * the function still reported success. pg_cron's job_run_details records the
 * POST as succeeded regardless (WEB-OPS-007), so nothing anywhere could tell a
 * total failure from a clean run.
 *
 * node:assert rather than std/assert deliberately: it needs no network, so this
 * runs in a container where deno.land is unreachable as well as in CI.
 */

import { strict as assert } from 'node:assert';
import { summarizeRun, type SourceOutcome } from '../restaurant-opening-scraper/summary.ts';

const source = (over: Partial<SourceOutcome> = {}): SourceOutcome => ({
  name: 'Example',
  url: 'https://example.com',
  ok: false,
  found: 0,
  inserted: 0,
  updated: 0,
  ...over,
});

Deno.test('every source failing is a non-2xx', () => {
  const summary = summarizeRun([
    source({ name: 'A', error: 'model call failed (404, model claude-3-5-sonnet-20241022)' }),
    source({ name: 'B', error: 'model call failed (404, model claude-3-5-sonnet-20241022)' }),
  ]);

  assert.equal(summary.status, 502);
  assert.equal(summary.body.success, false);
  assert.equal(summary.body.sourcesSucceeded, 0);
  // The reason has to survive into the body. The old code built an errors array
  // and then reported success anyway, so the information existed and reached
  // nobody.
  assert.equal(summary.body.errors?.length, 2);
  assert.ok(summary.body.errors?.[0].includes('404'));
});

Deno.test('no sources at all is a failure, not a vacuous success', () => {
  // An empty source list means the job is misconfigured. "Nothing to do" is
  // the answer a broken config gives, and 200 would hide it forever.
  const summary = summarizeRun([]);
  assert.equal(summary.status, 502);
  assert.equal(summary.body.success, false);
  assert.equal(summary.body.sourcesAttempted, 0);
});

Deno.test('a source that succeeded and found nothing is a success', () => {
  // Restaurants do not open every day. Treating a quiet day as an outage makes
  // the alert meaningless within a week.
  const summary = summarizeRun([source({ ok: true, found: 0 })]);
  assert.equal(summary.status, 200);
  assert.equal(summary.body.success, true);
  assert.equal(summary.body.totalFound, 0);
  assert.equal(summary.body.errors, undefined);
});

Deno.test('a partial failure is 200 and names the source that failed', () => {
  // Failing the whole run on one dead URL turns the job permanently red and
  // teaches everyone to ignore it - the WEB-CI-020 / WEB-CI-021 failure mode.
  const summary = summarizeRun([
    source({ name: 'Live', ok: true, found: 3, inserted: 2, updated: 1 }),
    source({ name: 'Dead', error: 'scrape failed: 403' }),
  ]);

  assert.equal(summary.status, 200);
  assert.equal(summary.body.success, true);
  assert.equal(summary.body.sourcesSucceeded, 1);
  assert.equal(summary.body.sourcesAttempted, 2);
  assert.equal(summary.body.errors?.length, 1);
  assert.ok(summary.body.errors?.[0].startsWith('Dead: '));
});

Deno.test('totals are summed across sources, not per source', () => {
  const summary = summarizeRun([
    source({ ok: true, found: 3, inserted: 2, updated: 1 }),
    source({ ok: true, found: 4, inserted: 0, updated: 4 }),
  ]);

  assert.equal(summary.body.totalFound, 7);
  assert.equal(summary.body.inserted, 2);
  assert.equal(summary.body.updated, 5);
});

Deno.test('the per-source breakdown reaches the caller', () => {
  // The old body carried three integers and could not say which source
  // produced them, so a source that had rotted was invisible until someone
  // read the logs.
  const summary = summarizeRun([
    source({ name: 'Register', error: 'no usable content (12 chars)' }),
    source({ name: 'Eater', ok: true, found: 2, inserted: 2 }),
  ]);

  assert.equal(summary.body.perSource.length, 2);
  assert.equal(summary.body.perSource[0].name, 'Register');
  assert.equal(summary.body.perSource[0].ok, false);
  assert.equal(summary.body.perSource[1].inserted, 2);
});

Deno.test('index.ts no longer hardcodes a model id', async () => {
  // AC2. The point of routing through buildClaudeRequest is that the model is
  // configured in ONE place; a future edit that pastes an id back in is the
  // regression, and it would be invisible in review.
  const src = await Deno.readTextFile(
    new URL('../restaurant-opening-scraper/index.ts', import.meta.url),
  );
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  assert.ok(
    !/model:\s*['"]claude-/.test(code),
    'index.ts hardcodes a Claude model id; it must come from buildClaudeRequest',
  );
  assert.ok(
    code.includes('buildClaudeRequest'),
    'index.ts must build its request through _shared/aiConfig.ts',
  );
  assert.ok(
    code.includes('getClaudeHeaders'),
    'index.ts must take anthropic-version from _shared/aiConfig.ts',
  );
});

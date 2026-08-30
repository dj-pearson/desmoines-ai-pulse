#!/usr/bin/env node
/**
 * Runs every offline test suite, discovered rather than listed.
 *
 * WHY DISCOVERY RATHER THAN A LIST. `test:offline` was a hand-maintained chain
 * of four `npm run` calls. Audited 2026-08-28: ten suites exist and only four
 * were in it. Two had never run in CI at all -
 *
 *   functions/__tests__/middleware-canonical.test.mjs
 *   scripts/__tests__/list-edge-deploys.test.mjs
 *
 * and the first is the only guard on the WEB-SEO-006 canonical rewrite, which
 * that story says cannot be verified any other way: the transform runs inside
 * Cloudflare's HTMLRewriter, which does not exist outside the Workers runtime,
 * so the suite asserts the surrounding property instead. It had been asserting
 * it to nobody.
 *
 * The other four were reachable only because they had been added as their own
 * CI steps, which is how a list drifts: the next person adds a step instead of
 * an entry, and the aggregator quietly stops meaning "all of them".
 *
 * SO THE FILE SYSTEM IS THE LIST. Adding scripts/__tests__/foo.test.mjs makes
 * it run, with no second edit and nothing to forget.
 *
 * These are plain scripts, not vitest: each prints its own checks and exits
 * non-zero on failure (see any of them for the shape). vitest owns src/**,
 * runs under `npm run test:unit`, and is not touched here.
 *
 * Run with tsx, not node - several suites import a TypeScript module by design.
 *
 *   npm run test:offline
 *   npm run test:offline -- --list    # show what would run and exit
 */
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const SUITE_DIRS = ['scripts/__tests__', 'functions/__tests__'];

const suites = SUITE_DIRS.flatMap((dir) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith('.test.mjs'))
        .sort()
        .map((f) => join(dir, f))
    : [],
);

if (suites.length === 0) {
  // A discovery runner that finds nothing must fail loudly. Exiting 0 here
  // would report "all suites passed" for a glob that had stopped matching.
  console.error('[offline-suites] no *.test.mjs found under ' + SUITE_DIRS.join(', ') + ' - refusing to pass.');
  process.exit(1);
}

if (process.argv.includes('--list')) {
  suites.forEach((s) => console.log(s));
  process.exit(0);
}

console.log(`[offline-suites] ${suites.length} suite(s) discovered under ${SUITE_DIRS.join(', ')}\n`);

const failed = [];
for (const suite of suites) {
  // tsx, not node: several suites import a .ts module. Inherit stdio so a
  // failing suite prints its own diagnostics rather than being summarised away.
  const r = spawnSync(process.execPath, [...process.execArgv, suite], {
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
  });
  const ok = r.status === 0;
  if (!ok) {
    failed.push(suite);
    process.stdout.write(r.stdout ?? '');
  }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${suite}`);
}

console.log(`\n[offline-suites] ${suites.length - failed.length}/${suites.length} passed.`);
if (failed.length) {
  console.error('Failed:\n  ' + failed.join('\n  '));
  process.exit(1);
}

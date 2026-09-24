#!/usr/bin/env node
/**
 * Every Playwright spec must be run by some CI lane (WEB-CI-028).
 *
 * WHAT THIS EXISTS FOR. `playwright.config.ts` has `testDir: './tests'`, so
 * locally `npm test` runs everything and a spec looks wired up. No CI workflow
 * uses that config. The lanes name their specs explicitly - e2e.yml lists four
 * by path, and the smoke and a11y configs each carry a `testMatch` regex - so a
 * spec nobody adds to one of those is written, committed, and never executed
 * again.
 *
 * THE STORY SAYS FOUR SPECS RUN NOWHERE. When this was written there were NINE:
 * the four it names (search-filters, sticky-filter-chips, url-filter-state,
 * visual-regression) plus add-to-calendar-card, getting-around,
 * restaurant-dietary-filter, restaurant-reservations and weather-aware-events,
 * each added since and each orphaned the same way. That is the argument for a
 * check rather than a cleanup: the list grows quietly, because writing the spec
 * feels like the work and wiring it up is a separate file.
 *
 * IT IS A RATCHET, NOT A GATE. Promoting an orphan means knowing it passes
 * against a production build, which is a judgement about that spec, not
 * something this script can make. So the current orphans are baselined and only
 * a NEW one fails. The list must only ever shrink.
 *
 * Exit 0 when no spec was orphaned that was not already, 1 otherwise.
 * `--write` re-baselines.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const TESTS = join(ROOT, 'tests');
const WORKFLOWS = join(ROOT, '.github', 'workflows');
const BASELINE = join(ROOT, '.github', 'e2e-lane-baseline.json');
const WRITE = process.argv.includes('--write') || process.argv.includes('--update');

if (!existsSync(TESTS)) {
  console.log('check-e2e-lanes: no tests directory, nothing to check.');
  process.exit(1);
}

const specs = readdirSync(TESTS)
  .filter((f) => f.endsWith('.spec.ts'))
  .map((f) => f.replace(/\.spec\.ts$/, ''))
  .sort();

if (specs.length === 0) {
  console.error('[e2e-lanes] found 0 spec files. That is not a pass.');
  process.exit(1);
}

/*
 * Everything a lane could name a spec in: the workflow files, and the
 * Playwright configs the workflows actually use. playwright.config.ts is
 * EXCLUDED deliberately - its testDir sweeps the whole directory, so counting
 * it would make every spec look wired and the check would assert nothing.
 */
const LANE_FILES = [
  ...readdirSync(WORKFLOWS).filter((f) => f.endsWith('.yml')).map((f) => join(WORKFLOWS, f)),
  join(ROOT, 'playwright.smoke.config.ts'),
  join(ROOT, 'playwright.a11y.config.ts'),
  join(ROOT, 'playwright.screenshots.config.ts'),
].filter((f) => existsSync(f));

const laneText = LANE_FILES.map((f) => readFileSync(f, 'utf8')).join('\n');

const orphans = specs.filter((name) => {
  // A lane names a spec either by path (tests/foo.spec.ts) or inside a
  // testMatch alternation. Both reduce to the bare name appearing
  // somewhere in these files, which is deliberately loose: a false NEGATIVE
  // here means a spec looks wired when it is not, and that is the failure this
  // check exists to prevent, so the bar for "wired" stays low and honest.
  //
  // The name is bounded by anything but a word character OR a hyphen. \b alone
  // treats "-" as a boundary, so `restaurants-hub` counted as wired because a
  // workflow names restaurants-hub-payload.test.ts - a Deno test, not the spec.
  const escaped = name.replace(/[-]/g, '\\-');
  return !new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`).test(laneText);
});

if (WRITE) {
  writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        _comment:
          'Playwright specs that no CI lane runs (WEB-CI-028). They still run locally via ' +
          'playwright.config.ts, which sweeps tests/ - that is why they look wired up. This ' +
          'list must only ever SHRINK. See scripts/check-e2e-lanes.mjs.',
        generated: new Date().toISOString().slice(0, 10),
        orphans,
      },
      null,
      2
    ) + '\n'
  );
  console.log(`[e2e-lanes] baseline written: ${orphans.length} spec(s) run by no lane.`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error(`[e2e-lanes] no baseline at ${relative(ROOT, BASELINE)}. Write one with --write.`);
  process.exit(1);
}

const base = new Set(JSON.parse(readFileSync(BASELINE, 'utf8')).orphans || []);
const added = orphans.filter((s) => !base.has(s));
const promoted = [...base].filter((s) => !orphans.includes(s) && specs.includes(s));
const deleted = [...base].filter((s) => !specs.includes(s));

if (added.length > 0) {
  console.error(`\n[e2e-lanes] ${added.length} spec(s) are run by no CI lane:\n`);
  for (const s of added) console.error(`  tests/${s}.spec.ts`);
  console.error(
    '\nplaywright.config.ts sweeps tests/, so these pass locally and look wired up. No\n' +
      'workflow uses that config: the lanes name their specs in e2e.yml or in a\n' +
      "testMatch. Add it to one, or say in the baseline why it does not run in CI."
  );
  process.exit(1);
}

console.log(
  `[e2e-lanes] ${specs.length} spec(s); ${orphans.length} run by no lane, all already in the baseline.`
);
if (promoted.length > 0 || deleted.length > 0) {
  console.log('Down from the baseline - re-baseline with --write:');
  for (const s of promoted) console.log(`  ${s} (now run by a lane)`);
  for (const s of deleted) console.log(`  ${s} (spec deleted)`);
}

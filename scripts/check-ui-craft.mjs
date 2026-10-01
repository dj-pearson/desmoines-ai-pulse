#!/usr/bin/env node
/**
 * WEB-UX-034: the craft floor in CLAUDE.md, enforced rather than aspirational.
 *
 * CLAUDE.md lists the tells that make a frontend read as generated - a thick
 * coloured border-left on a card, purple/violet gradients, gradient text,
 * bounce easing, Inter as the type CHOICE - and says to run
 * `npx impeccable detect` rather than assert a UI is clean. Nothing ran it. No
 * npm script, no hook, no CI job, so the count moved only when somebody
 * remembered, and 48 findings had accumulated.
 *
 * A RATCHET, NOT A GATE, for the reason AC2 gives: not every finding is a
 * defect. categoryColors.ts and categoryStyles.ts use violet, indigo and purple
 * as CATEGORY-DISTINGUISHING hues with contrast ratios measured in the file
 * header - those are a decision, not a tell. Several border-b-2 hits are
 * hand-rolled `animate-spin rounded-full border-b-2` spinners, where the fix is
 * a shared spinner component rather than a colour change. Deciding those is the
 * work; what was missing is anything stopping the number going UP while it
 * happens. A file may lose findings freely. It may not gain one.
 *
 * IT SKIPS RATHER THAN FAILS WHEN THE DETECTOR CANNOT RUN. impeccable is
 * fetched by npx, so an offline machine or a blocked registry would otherwise
 * turn every local `npm run validate` red for a reason that has nothing to do
 * with the change in front of you - and a check that fails for unrelated
 * reasons is a check people learn to ignore. CI has network; that is where it
 * bites.
 *
 * WHAT THIS DOES NOT MEASURE. The story also counts "~230 off-brand colour
 * tokens across 72 files", including 21 on Index.tsx. That is a different,
 * hand-rolled count: the detector does not flag Index.tsx at all. Two measures,
 * one of which this script tracks.
 *
 *   node scripts/check-ui-craft.mjs           # check
 *   node scripts/check-ui-craft.mjs --write   # re-baseline (downward only)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, '.github', 'ui-craft-baseline.json');
const WRITE = process.argv.includes('--write');

/**
 * THE DETECTOR EXITS NON-ZERO WHEN IT FINDS ANYTHING - 2 in practice, which its
 * own --help does not document (it lists 0 and 1). execFileSync throws on any
 * non-zero exit, so the first version of this script reported "could not run
 * the detector" on every run that had findings, i.e. always. The JSON is on
 * stdout either way, so the exit code is not the signal: whether stdout parses
 * is.
 */
let raw = '';
try {
  raw = execFileSync('npx', ['--yes', 'impeccable', 'detect', 'src', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 5 * 60 * 1000,
  });
} catch (error) {
  // Findings present, or a genuine failure. stdout tells them apart.
  raw = typeof error.stdout === 'string' ? error.stdout : '';
  if (!raw.trim()) {
    console.log(
      `[ui-craft] could not run the detector (${error.code ?? 'error'}) - skipping.\n` +
        '  impeccable is fetched by npx, so this is expected offline. CI has network.',
    );
    process.exit(0);
  }
}

let findings;
try {
  findings = JSON.parse(raw);
} catch {
  console.log('[ui-craft] detector produced no parseable JSON - skipping rather than guessing.');
  process.exit(0);
}

if (!Array.isArray(findings)) {
  console.log('[ui-craft] unexpected detector output shape - skipping.');
  process.exit(0);
}

const counts = {};
const byRule = {};
for (const f of findings) {
  const file = relative(ROOT, f.file).replace(/\\/g, '/');
  counts[file] = (counts[file] ?? 0) + 1;
  byRule[f.antipattern] = (byRule[f.antipattern] ?? 0) + 1;
}
const total = findings.length;

if (WRITE) {
  writeFileSync(
    BASELINE,
    `${JSON.stringify(
      {
        _comment:
          'UI anti-patterns per file, from `npx impeccable detect src --json` (WEB-UX-034). CLAUDE.md mandates the detector; nothing ran it. This list must only ever SHRINK. Not every finding is a defect - see WEB-UX-034 AC2 - so it is a ratchet, not a gate.',
        generated: new Date().toISOString().slice(0, 10),
        total,
        byRule,
        files: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`[ui-craft] baseline written: ${total} finding(s) across ${Object.keys(counts).length} file(s).`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error('[ui-craft] no baseline. Run: node scripts/check-ui-craft.mjs --write');
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const known = baseline.files ?? {};

const grown = [];
for (const [file, n] of Object.entries(counts)) {
  const was = known[file] ?? 0;
  if (n > was) grown.push({ file, was, now: n });
}

console.log(
  `[ui-craft] ${total} UI anti-pattern(s) across ${Object.keys(counts).length} file(s) ` +
    `(baseline ${baseline.total}).`,
);

if (grown.length === 0) {
  if (total < baseline.total) {
    console.log(`OK Down ${baseline.total - total} from the baseline. Re-baseline with --write.`);
  } else {
    console.log('OK No file gained a UI anti-pattern.');
  }
  process.exit(0);
}

console.error('\nX A file gained a UI anti-pattern:\n');
for (const g of grown) {
  console.error(`  ${g.file}  ${g.was} -> ${g.now}`);
  for (const f of findings.filter((x) => relative(ROOT, x.file).replace(/\\/g, '/') === g.file)) {
    console.error(`    line ${f.line}: [${f.antipattern}] ${f.snippet ?? ''}`);
  }
}
console.error(
  '\nCLAUDE.md lists these as the category defaults rather than as bans: the\n' +
    "brief's own words can earn any of them, but reaching for one on a free axis\n" +
    'means you were not deciding. `npx impeccable detect <path>` explains each\n' +
    'rule; the /impeccable skill makes the judgement calls it cannot.\n' +
    '\nIf the finding is deliberate, say so where the detector can read it - an\n' +
    'inline impeccable-disable comment carrying the reason - rather than adding\n' +
    'the file to the baseline.\n',
);
process.exit(1);

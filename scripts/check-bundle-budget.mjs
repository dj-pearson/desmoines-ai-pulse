#!/usr/bin/env node
/**
 * Critical-path JS budget ratchet (WEB-PERF-020 AC4).
 *
 * CLAUDE.md sets a 200 KB gzipped budget for the critical path. The measured
 * figure has been three times that, so a hard gate at 200 KB would fail on day
 * one and be switched off within a week - the fate of every other inert guard
 * catalogued in this backlog. This ratchets instead: it fails when the critical
 * path GROWS past the recorded baseline, and prints the remaining distance to
 * the real target on every run so the gap stays visible.
 *
 * WHAT "CRITICAL PATH" MEANS HERE: the gzipped total of every JS chunk that
 * dist/index.html references directly. Those are what the browser fetches
 * before it can render; everything else is behind a dynamic import.
 *
 * MEASURE TOTALS, NOT NAMED CHUNKS. Rollup names a shared chunk after a
 * representative module, so when module-to-chunk assignment shifts, names
 * reshuffle and a per-name diff reads that churn as growth or as a win. A
 * previous pass on this story recorded a "+23 KB regression" that did not
 * exist, for exactly that reason. Chunk names are reported for context and
 * nothing is asserted about them.
 *
 * Run against the output of `vite build` (NOT `npm run build`, which also runs
 * the sitemap generator and the prerenderer - both need real credentials, and
 * the prerenderer rewrites index.html, which changes what counts as critical).
 *
 * Usage:
 *   npx vite build && node scripts/check-bundle-budget.mjs
 *   node scripts/check-bundle-budget.mjs --update   # re-baseline (must shrink)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const INDEX = join(DIST, 'index.html');
const BASELINE = join(ROOT, 'bundle-budget-baseline.json');
const UPDATE = process.argv.includes('--update');

/** CLAUDE.md, Quality Standards. The goal, not the current gate. */
const TARGET_KB = 200;

/**
 * Growth allowance, in bytes. Absorbs zlib-version jitter between machines, and
 * the fact that VITE_* values are inlined into the bundle - a build with real
 * credentials differs from one with placeholders by tens of bytes. It does not
 * absorb a real regression: a lazily-loaded component pulled onto the critical
 * path costs kilobytes. Measured: restoring ONE static legal-page import moved
 * the total 8.4 KB.
 */
const TOLERANCE = 2048;

if (!existsSync(INDEX)) {
  console.error(
    `[bundle-budget] no dist/index.html. Build first:\n` +
      `  VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npx vite build`,
  );
  process.exit(1);
}

const html = readFileSync(INDEX, 'utf8');
const referenced = [...new Set([...html.matchAll(/\/assets\/([A-Za-z0-9_.\-]+\.js)/g)].map((m) => m[1]))];

if (referenced.length === 0) {
  console.error('[bundle-budget] dist/index.html references no JS chunks. Did the build succeed?');
  process.exit(1);
}

const chunks = [];
for (const name of referenced) {
  const path = join(DIST, 'assets', name);
  if (!existsSync(path)) {
    console.error(`[bundle-budget] dist/index.html references ${name}, which was not emitted.`);
    process.exit(1);
  }
  chunks.push({ name, gzip: gzipSync(readFileSync(path), { level: 9 }).length });
}
chunks.sort((a, b) => b.gzip - a.gzip);

const total = chunks.reduce((sum, c) => sum + c.gzip, 0);
const allJs = readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.js'));
const kb = (bytes) => (bytes / 1024).toFixed(1);

console.log(`[bundle-budget] critical path: ${kb(total)} KB gz across ${chunks.length} chunk(s) (of ${allJs.length} emitted)`);
for (const c of chunks) console.log(`               ${kb(c.gzip).padStart(7)} KB  ${c.name}`);

if (UPDATE) {
  if (existsSync(BASELINE)) {
    const prev = JSON.parse(readFileSync(BASELINE, 'utf8'));
    if (total > prev.criticalPathBytes) {
      console.error(
        `\n[bundle-budget] refusing to re-baseline upward: ${kb(total)} KB > ${kb(prev.criticalPathBytes)} KB.\n` +
          `A baseline that can grow is not a ratchet. Make the bundle smaller, or change this file deliberately in a reviewed commit.`,
      );
      process.exit(1);
    }
  }
  writeFileSync(
    BASELINE,
    `${JSON.stringify({ criticalPathBytes: total, targetKb: TARGET_KB, chunks }, null, 2)}\n`,
  );
  console.log(`\n[bundle-budget] baseline written: ${kb(total)} KB gz.`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error('\n[bundle-budget] no baseline. Create one with --update.');
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const over = total - baseline.criticalPathBytes;
const toTarget = total - TARGET_KB * 1024;

if (toTarget > 0) {
  console.log(`\n[bundle-budget] ${kb(toTarget)} KB above the ${TARGET_KB} KB target in CLAUDE.md. Ratcheting, not gating.`);
} else {
  console.log(`\n[bundle-budget] under the ${TARGET_KB} KB target. Consider gating on the target instead of the baseline.`);
}

if (over > TOLERANCE) {
  console.error(
    `\n[bundle-budget] REGRESSION: critical path grew ${kb(over)} KB over the baseline ` +
      `(${kb(total)} KB vs ${kb(baseline.criticalPathBytes)} KB).\n\n` +
      `Something that used to be lazily loaded is now reachable from the entry chunk. ` +
      `Find it by diffing the chunk list above against bundle-budget-baseline.json, ` +
      `then either restore the dynamic import or, if the growth is deliberate and justified, ` +
      `run this with --update in the same commit and say why.`,
  );
  process.exit(1);
}

if (over < -TOLERANCE) {
  console.log(`\n[bundle-budget] improved by ${kb(-over)} KB. Run with --update to lock it in.`);
}

console.log('\n[bundle-budget] OK.');
process.exit(0);

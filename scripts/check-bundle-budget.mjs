/**
 * Critical-path JS budget ratchet (WEB-PERF-020 AC4).
 *
 * CLAUDE.md sets a 200 KB gzipped budget for the critical path. When this was
 * written the measured figure was 369.9 KB, so a gate that enforced 200 KB
 * outright would have been red on day one -- and this repo has already learned
 * twice what that produces:
 * WEB-CI-021's accessibility lane and WEB-CI-020's unit lane were both left
 * on continue-on-error precisely because they failed from the start, and
 * scripts/strict-ratchet.mjs's own header puts it plainly: "a gate that always
 * fails teaches everyone to ignore it".
 *
 * So this is a RATCHET, matching strict-baseline.json / schema-baseline.json /
 * app-type-baseline.json. It fails when the critical path grows past the
 * recorded baseline, and it reports the distance to the real 200 KB goal on
 * every run so the target does not quietly disappear.
 *
 * WHAT "CRITICAL PATH" MEANS HERE: the JS chunks dist/index.html references
 * directly, gzipped. Not every emitted chunk (1883 KB across 120 files, most
 * of it lazily loaded and irrelevant to first paint), and not the raw byte
 * size (the wire cost is what the budget is about). This is the same
 * definition WEB-PERF-020's measurements used, so its numbers remain
 * comparable.
 *
 * A NOTE ON WHY THE TOTAL, NOT PER-CHUNK: rollup renames and re-splits shared
 * chunks between builds, so a per-chunk baseline churns constantly and reports
 * regressions that are only chunk-boundary movement. WEB-PERF-020 recorded
 * exactly that false alarm -- a "+23 KB regression" that turned out to be a
 * shared chunk changing names. The total is stable across that churn.
 *
 * THE GOAL IS NOW MET (196.7 KB, 2026-08-27), so the ratchet's job has changed:
 * it is no longer closing a gap, it is holding a budget that is finally inside
 * its limit. It stays a ratchet rather than becoming a hard 200 KB gate because
 * the baseline is the tighter of the two numbers, and a gate at 200 would
 * silently permit 3.3 KB of regression.
 *
 *   node scripts/check-bundle-budget.mjs            # check
 *   node scripts/check-bundle-budget.mjs --update   # re-baseline
 *
 * Requires a build first: dist/index.html must exist.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const BASELINE = join(ROOT, 'bundle-budget-baseline.json');
const UPDATE = process.argv.includes('--update');

/** CLAUDE.md, Quality Standards: "<500KB gzipped target, <200KB critical path". */
const GOAL_KB = 200;

/**
 * Allow a little headroom so ordinary dependency churn does not fail a PR that
 * has nothing to do with bundle size. Anything above this is a real regression
 * worth a conversation.
 */
const TOLERANCE_KB = 5;

export function criticalPathChunks(distDir) {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8');
  // Both <script src> and <link href> -- a modulepreload is still critical
  // path, it is fetched before first paint.
  const refs = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]))];
  const out = [];
  for (const ref of refs.sort()) {
    const p = join(distDir, ref.replace(/^\//, ''));
    if (!existsSync(p)) continue;
    out.push({ ref, gzipKb: gzipSync(readFileSync(p), { level: 9 }).length / 1024 });
  }
  return out;
}

function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('[bundle-budget] dist/index.html not found - run npm run build first. Skipping.');
    process.exit(0);
  }

  const chunks = criticalPathChunks(DIST);
  if (chunks.length === 0) {
    // index.html referencing no JS means the parse broke, not that the bundle
    // is free. Failing loudly beats reporting 0 KB as a pass.
    console.error('[bundle-budget] index.html references no JS chunks - refusing to report a pass.');
    process.exit(1);
  }

  const totalKb = chunks.reduce((n, c) => n + c.gzipKb, 0);
  const round = (n) => Math.round(n * 10) / 10;

  console.log(`[bundle-budget] critical path: ${round(totalKb)} KB gz across ${chunks.length} chunks`);
  for (const c of chunks.sort((a, b) => b.gzipKb - a.gzipKb)) {
    console.log(`  ${String(round(c.gzipKb)).padStart(7)} KB  ${c.ref}`);
  }

  if (UPDATE) {
    writeFileSync(
      BASELINE,
      `${JSON.stringify({ $comment: 'WEB-PERF-020 AC4. Critical-path gzipped JS. Lower is better; the goal is ' + GOAL_KB + ' KB. Re-baseline with: node scripts/check-bundle-budget.mjs --update', generated: new Date().toISOString().slice(0, 10), goalKb: GOAL_KB, toleranceKb: TOLERANCE_KB, criticalPathKb: round(totalKb) }, null, 2)}\n`,
    );
    console.log(`[bundle-budget] baseline written: ${round(totalKb)} KB gz`);
    return;
  }

  if (!existsSync(BASELINE)) {
    console.error('[bundle-budget] no baseline. Create one with --update.');
    process.exit(1);
  }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const delta = totalKb - base.criticalPathKb;
  const overGoal = totalKb - GOAL_KB;

  console.log(
    `[bundle-budget] baseline ${base.criticalPathKb} KB, now ${round(totalKb)} KB ` +
      `(${delta >= 0 ? '+' : ''}${round(delta)} KB). ` +
      (overGoal > 0
        ? `Goal ${GOAL_KB} KB, still ${round(overGoal)} KB over.`
        : `Goal ${GOAL_KB} KB, met with ${round(-overGoal)} KB to spare.`),
  );

  if (delta > TOLERANCE_KB) {
    console.error(
      `\n❌ critical-path JS grew by ${round(delta)} KB, past the ${TOLERANCE_KB} KB tolerance.\n` +
        '   Either lazy-load what you added, or if the growth is deliberate re-baseline with:\n' +
        '     node scripts/check-bundle-budget.mjs --update',
    );
    process.exit(1);
  }

  if (delta < -TOLERANCE_KB) {
    // Not a failure. Saying so is what stops the baseline drifting upward as
    // the only direction anyone ever records.
    console.log(
      `\n✅ improved by ${round(-delta)} KB. Lock it in:\n` +
        '     node scripts/check-bundle-budget.mjs --update',
    );
    return;
  }

  console.log('\n✅ critical-path JS is within tolerance of the baseline.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

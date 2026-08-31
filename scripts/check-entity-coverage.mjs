#!/usr/bin/env node
/**
 * Every sitemapped entity URL must ship prerendered HTML (WEB-SEO-006 AC5).
 *
 * WHAT THIS GUARDS THAT NOTHING ELSE DOES. prerender.mjs has a strict gate that
 * refuses to write a page that did not render as itself, and
 * check-prerender-content asserts absolute properties of the pages that DO get
 * written. Neither can see a URL that was never attempted.
 *
 * That is not hypothetical. Two builds of the same tree on the same machine:
 *
 *     build A   1136 entities prerendered, 0 over budget, 413s
 *     build B    868 entities prerendered, 268 over budget, 449s
 *
 * The entity pass is a wall-clock race against PRERENDER_ENTITY_BUDGET_SECONDS
 * (default 420) and the build EXITS 0 when it loses. So 268 URLs that are in the
 * sitemap shipped an SPA shell, and the only trace was one advisory line in a
 * 449-second log. Build B silently dropped every month page.
 *
 * This is the Cloudflare Pages build too, which means which URLs a JS-less
 * crawler - GPTBot, PerplexityBot, ClaudeBot, OAI-SearchBot - can read is decided
 * by how busy the runner was, and can differ between two deploys of identical
 * code.
 *
 * WHY A RATCHET RATHER THAN A HARD REQUIREMENT. Demanding 100% would fail every
 * build until the budget is raised, and the right budget depends on the host's
 * build timeout, which is the owner's call. A ratchet makes the number visible,
 * lets it improve, and fails only when it goes BACKWARDS - the same shape as
 * check-bundle-budget and check-edge-deploys.
 *
 *   node scripts/check-entity-coverage.mjs            # check
 *   node scripts/check-entity-coverage.mjs --update   # re-baseline deliberately
 *
 * Requires a build first: it reads public/sitemap-*.xml and dist/.
 *
 * IT MEASURES dist/ ON DISK, NOT THE LAST RUN. prerender.mjs writes pages and
 * never removes them, so running it twice locally without clearing dist/ leaves
 * the union of both passes and this check reports the better number. Verified:
 * a deliberate 25-second budget rendered 35 entities and this still read 870,
 * because the earlier full pass was still on disk.
 *
 * That is correct for CI, which builds from a fresh checkout every time, and a
 * trap locally. `rm -rf dist` before a run you intend to measure.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prerenderOutputPath } from './prerender-output.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PUBLIC = join(ROOT, 'public');
const BASELINE = join(ROOT, 'entity-coverage-baseline.json');
const UPDATE = process.argv.includes('--update');

/**
 * The shell's own title. A route that was never prerendered is served the shell
 * by the SPA fallback, so a file whose title is this one is not a rendered page
 * even though it exists on disk.
 */
const SHELL_TITLE = 'Des Moines Insider | Events, Restaurants and What to Do in Des Moines';

/** Sitemaps describing entity URLs. The hub sitemap is covered by other checks. */
const ENTITY_SITEMAPS = /^sitemap-(events|restaurants|attractions|playgrounds|articles|guides|pseo)\.xml$/;

if (!existsSync(DIST)) {
  console.error('[entity-coverage] dist/ is missing. Run `npm run build` first.');
  process.exit(1);
}

const sitemaps = readdirSync(PUBLIC).filter((f) => ENTITY_SITEMAPS.test(f));
if (sitemaps.length === 0) {
  console.error('[entity-coverage] no entity sitemaps in public/. Did generate-sitemaps run?');
  process.exit(1);
}

const groups = new Map();
/** pathname -> did it ship real prerendered HTML. Filled by the scoring loop below. */
const renderedByPath = new Map();
for (const file of sitemaps) {
  const xml = readFileSync(join(PUBLIC, file), 'utf8');
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  // An empty sitemap is a generator failure, not full coverage. Counting it as
  // 0-of-0 would read as 100% and bank a regression as a pass.
  if (urls.length === 0) {
    console.error(`[entity-coverage] ${file} contains no <loc> entries. Refusing to score it.`);
    process.exit(1);
  }
  let rendered = 0;
  const missing = [];
  for (const url of urls) {
    const path = new URL(url).pathname.replace(/\/+$/, '');
    const file2 = prerenderOutputPath(DIST, path);
    if (!existsSync(file2)) {
      missing.push(path);
      renderedByPath.set(path, false);
      continue;
    }
    const html = readFileSync(file2, 'utf8');
    const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] ?? '';
    if (title.trim() === SHELL_TITLE) {
      missing.push(path);
      renderedByPath.set(path, false);
      continue;
    }
    renderedByPath.set(path, true);
    rendered += 1;
  }
  groups.set(file.replace(/^sitemap-|\.xml$/g, ''), { total: urls.length, rendered, missing });
}

/**
 * SEO-027 AC6: THE HEAD OF THE RANKING MUST BE RENDERED, AND THIS ONE IS NOT A
 * RATCHET.
 *
 * The ratchet below is deliberately loose because the TOTAL is a wall-clock race,
 * and policing variance produces a flaky gate that somebody eventually switches
 * off - this repo has WEB-CI-020 and WEB-CI-021 as evidence. That reasoning does
 * not apply here. scripts/prerender-order.mjs renders in measured-impression
 * order, so the top of that ranking is rendered FIRST, by construction, on every
 * build. Its absence is not a slow runner. It means the ranking file is missing,
 * the ordering is broken, the strict gate is rejecting the head, or the entity
 * pass did not run.
 *
 * So this asserts an absolute property, the way check-prerender-content does:
 * the pages that actually earn impressions are readable by a crawler that runs
 * no JavaScript. Those are the pages the whole story is about - measured
 * 2026-08-31, restaurant entity URLs drew 87,371 of 93,272 impressions while 335
 * of 477 of them shipped an SPA shell, because coverage was decided
 * alphabetically and /restaurants/the-pizza-bar is 421st of 477.
 *
 * Sized to be true with room to spare rather than to be tight: the top 100 by
 * impressions land inside the first ~133 slots at fairness-every-4, and a local
 * build reached 216 while production reaches 267. A build that cannot render 133
 * entity URLs is broken, not slow.
 */
const HEAD_SIZE = Number(process.env.ENTITY_COVERAGE_HEAD || 100);
/**
 * How much of the head may be missing before this fails, as a percentage.
 *
 * NOT the loose ratchet's reasoning, and not zero either. There are two ways a
 * head page goes missing and they deserve different answers:
 *
 *   systemic   the ranking file is gone, the order broke, the entity pass did not
 *              run. These take out the WHOLE head - 100 of 100 - so any threshold
 *              below 100% catches them decisively.
 *   a race     the page was attempted and the strict gate refused it. Measured on
 *              a local build 2026-08-31 that ran alongside lint and the test suite:
 *              7 of the top 100 were refused for `no canonical`, all of them
 *              restaurant detail pages that also reported no queries-settled
 *              signal. On an idle run of the same tree, 100 of 100 rendered.
 *
 * A zero-tolerance gate would therefore fail on a busy runner, and this repo has
 * WEB-CI-020 and WEB-CI-021 as evidence of what happens to a flaky gate: it gets
 * switched off and then catches nothing. So one lost page WARNS, with the page
 * named, and a collapse FAILS.
 *
 * The race is a real defect and the warning is how it stays visible -
 * /restaurants/bonchon is the site's highest-impression page and it is one of the
 * seven. Fixing it belongs at the source, not by loosening this number.
 */
const HEAD_TOLERANCE_PCT = Number(process.env.ENTITY_COVERAGE_HEAD_TOLERANCE || 10);
const PRIORITY_FILE = join(ROOT, 'scripts', 'prerender-priority.json');
let headFailures = [];
let headChecked = 0;
if (!existsSync(PRIORITY_FILE)) {
  console.warn(
    '[entity-coverage] scripts/prerender-priority.json is missing, so the impression head ' +
      'cannot be checked. Regenerate it with `npm run generate-prerender-priority` (SEO-027).',
  );
} else {
  const impressions = JSON.parse(readFileSync(PRIORITY_FILE, 'utf8')).impressions ?? {};
  const head = [...renderedByPath.keys()]
    .filter((p) => (impressions[p] ?? 0) > 0)
    .sort((a, b) => (impressions[b] ?? 0) - (impressions[a] ?? 0) || (a < b ? -1 : 1))
    .slice(0, HEAD_SIZE);
  headChecked = head.length;
  headFailures = head.filter((p) => renderedByPath.get(p) === false);
  if (headChecked === 0) {
    console.warn(
      '[entity-coverage] no sitemapped entity URL has any measured impressions. The ranking ' +
        'is stale or the sitemaps changed shape; the impression head was not checked.',
    );
  }
}

const totals = [...groups.values()].reduce(
  (a, g) => ({ total: a.total + g.total, rendered: a.rendered + g.rendered }),
  { total: 0, rendered: 0 },
);

const pct = (r, t) => (t === 0 ? 0 : Math.round((1000 * r) / t) / 10);

console.log(
  `[entity-coverage] ${totals.rendered}/${totals.total} sitemapped entity URLs ship prerendered HTML ` +
    `(${pct(totals.rendered, totals.total)}%).`,
);
for (const [name, g] of groups) {
  console.log(`    ${String(g.rendered).padStart(5)}/${String(g.total).padEnd(5)} ${name}`);
}

if (UPDATE) {
  const routes = Object.fromEntries([...groups].map(([k, g]) => [k, g.rendered]));
  // Carry `floors` forward. It is set by hand, for the reason in $floors below,
  // and re-baselining is exactly when it would otherwise be silently lost.
  const prior = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
  writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        $comment: 'WEB-SEO-006 AC5. Prerendered entity URLs per sitemap. This may only go UP.',
        $floors:
          'Optional per-group override of the computed floor. The LAST sitemap in prerender.mjs ' +
          "ENTITY_SITEMAPS absorbs all of the budget's variance - every other group either fits or " +
          'does not - so its per-build number is weather, not health, and policing it fails on a slow ' +
          'runner. Set that group to 0 and let the total ratchet catch the cliff.',
        generated: new Date().toISOString().slice(0, 10),
        total: totals.rendered,
        groups: routes,
        ...(prior.floors ? { floors: prior.floors } : {}),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`[entity-coverage] baseline written: ${totals.rendered} rendered.`);
  process.exit(0);
}

const headAllowed = Math.floor((HEAD_TOLERANCE_PCT / 100) * headChecked);
if (headFailures.length > 0 && headFailures.length <= headAllowed) {
  console.warn('');
  console.warn(
    `[entity-coverage] ${headFailures.length} of the top ${headChecked} pages by measured ` +
      `impressions ship an SPA shell (tolerated: up to ${headAllowed}).`,
  );
  for (const p of headFailures) console.warn(`      shell: ${p}`);
  console.warn(
    '    Usually the strict gate refusing a page that lost its render race - check the\n' +
      '    [prerender] rejected lines. Not failed, but these are the pages that earn the\n' +
      '    impressions, so they are worth fixing at the source.',
  );
}
if (headFailures.length > headAllowed) {
  console.error('');
  console.error('The highest-impression entity URLs did NOT ship prerendered HTML (SEO-027)');
  console.error('');
  console.error(
    `  ${headFailures.length} of the top ${headChecked} pages by measured Search Console impressions`,
  );
  console.error(`  (more than the ${headAllowed} this check tolerates for the render race)`);
  console.error('  serve the SPA shell, so GPTBot, PerplexityBot, ClaudeBot and OAI-SearchBot see');
  console.error('  the homepage on them. These render FIRST by construction');
  console.error('  (scripts/prerender-order.mjs), so this is NOT the budget running out:');
  console.error('');
  for (const p of headFailures.slice(0, 15)) console.error(`      missing: ${p}`);
  if (headFailures.length > 15) console.error(`      ... and ${headFailures.length - 15} more`);
  console.error('');
  console.error('  Check that scripts/prerender-priority.json is populated, that the entity pass');
  console.error('  ran at all, and that the strict gate is not rejecting the head.');
  console.error('');
  process.exit(1);
}
if (headChecked > 0 && headFailures.length === 0) {
  console.log(`OK All ${headChecked} highest-impression entity URLs ship prerendered HTML.`);
}

if (!existsSync(BASELINE)) {
  console.error(`[entity-coverage] ${BASELINE} is missing. Create it with --update.`);
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));

/**
 * How far coverage may fall before this fails.
 *
 * DELIBERATELY LOOSE, AND THE REASON MATTERS MORE THAN THE NUMBER. The entity
 * pass is a wall-clock race, so its output moves with how busy the machine is:
 * two builds of the same tree here differed by 268 URLs, about 24%. A ratchet
 * tight enough to catch that would fail on any slow CI runner, and this repo has
 * WEB-CI-020 and WEB-CI-021 as evidence of what happens next - a flaky gate gets
 * switched off, and then it catches nothing at all.
 *
 * So this does NOT try to police the variance. It catches the cliff: entity
 * prerendering turned off, the sitemap emptied, the strict gate rejecting
 * everything, a route pattern renamed. Those halve the number or worse. The
 * exact coverage is printed on every run either way, which is where the variance
 * is visible.
 */
const FLOOR = 0.5;

/**
 * The floor for one group. An explicit `floors` entry wins, including 0.
 *
 * Zero does not mean "give up on this group". The LAST sitemap in prerender.mjs
 * ENTITY_SITEMAPS is the only one whose number moves with how busy the machine
 * was - the ones ahead of it either fit inside the budget or the build is
 * broken - so its per-build count measures the runner, not the site. Policing it
 * fails on a slow runner and teaches everyone to ignore this check. The total
 * ratchet below is what catches a real collapse, and it catches one in this
 * group too.
 */
const floorFor = (name, before) =>
  baseline.floors?.[name] !== undefined ? baseline.floors[name] : Math.floor(before * FLOOR);

const drops = [];
for (const [name, g] of groups) {
  const before = baseline.groups?.[name];
  if (before === undefined) continue;
  if (g.rendered < floorFor(name, before)) {
    drops.push({ name, before, now: g.rendered, missing: g.missing });
  }
}

// The total, at the same loose floor. Without it, zeroing a group's floor would
// leave that group unpoliced outright; with it, entity prerendering breaking
// still fails the build whichever group it broke in.
if (typeof baseline.total === 'number' && totals.rendered < Math.floor(baseline.total * FLOOR)) {
  console.error(
    `\nEntity prerendering collapsed: ${totals.rendered} URLs against a baseline of ${baseline.total} (WEB-SEO-006)\n`,
  );
  console.error(
    `  That is past the ${FLOOR * 100}% floor this check tolerates for wall-clock variance, so it is\n` +
      '  the pass failing rather than the runner being slow. Check that PRERENDER_ENTITIES is not\n' +
      '  false, that the sitemaps are populated, and that the strict gate is not rejecting everything.\n',
  );
  process.exit(1);
}

const softer = [...groups].filter(([name, g]) => {
  const before = baseline.groups?.[name];
  return before !== undefined && g.rendered < before && g.rendered >= Math.floor(before * FLOOR);
});
if (softer.length > 0 && drops.length === 0) {
  console.log('\nBelow baseline but within the variance this check tolerates:');
  for (const [name, g] of softer) {
    console.log(`    ${name}: ${baseline.groups[name]} -> ${g.rendered}`);
  }
  console.log(
    '    The entity pass is a wall-clock race against PRERENDER_ENTITY_BUDGET_SECONDS;\n' +
      '    those URLs ship an SPA shell on this build. Not failed - see FLOOR in this file.',
  );
}

if (drops.length > 0) {
  console.error('\n❌ Fewer entity URLs are prerendered than the baseline (WEB-SEO-006)\n');
  for (const d of drops) {
    console.error(`  ${d.name}: ${d.before} -> ${d.now}  (${d.before - d.now} fewer)`);
    for (const m of d.missing.slice(0, 5)) console.error(`      missing: ${m}`);
    if (d.missing.length > 5) console.error(`      ... and ${d.missing.length - 5} more`);
  }
  console.error(
    '\nThese URLs are in the sitemap and now ship the SPA shell, so a crawler that\n' +
      'does not run JS sees nothing on them. The usual cause is the entity pass\n' +
      'losing its wall-clock race: raise PRERENDER_ENTITY_BUDGET_SECONDS (default\n' +
      '420) or PRERENDER_CONCURRENCY, minding the host build timeout. Re-baseline\n' +
      'with --update only if the drop is deliberate.\n',
  );
  process.exit(1);
}

console.log(`\nOK No sitemapped entity URL lost its prerendered HTML (baseline ${baseline.total}).`);

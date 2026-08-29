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
    const file2 = join(DIST, path, 'index.html');
    if (!existsSync(file2)) {
      missing.push(path);
      continue;
    }
    const html = readFileSync(file2, 'utf8');
    const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] ?? '';
    if (title.trim() === SHELL_TITLE) {
      missing.push(path);
      continue;
    }
    rendered += 1;
  }
  groups.set(file.replace(/^sitemap-|\.xml$/g, ''), { total: urls.length, rendered, missing });
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
  writeFileSync(
    BASELINE,
    JSON.stringify({ $comment: 'WEB-SEO-006 AC5. Prerendered entity URLs per sitemap. This may only go UP.', generated: new Date().toISOString().slice(0, 10), total: totals.rendered, groups: routes }, null, 2) + '\n',
  );
  console.log(`[entity-coverage] baseline written: ${totals.rendered} rendered.`);
  process.exit(0);
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

const drops = [];
for (const [name, g] of groups) {
  const before = baseline.groups?.[name];
  if (before === undefined) continue;
  if (g.rendered < Math.floor(before * FLOOR)) {
    drops.push({ name, before, now: g.rendered, missing: g.missing });
  }
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

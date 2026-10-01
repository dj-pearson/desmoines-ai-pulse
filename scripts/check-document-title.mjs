#!/usr/bin/env node
/**
 * One title source per page (WEB-SEO-028).
 *
 * THE DEFECT, MEASURED ON THE BUILT SITE rather than reasoned about. Seven
 * pages called useDocumentTitle while also rendering SEOHead or LocalSEO, and
 * the hook won:
 *
 *   /neighborhoods/ankeny   <title> "Ankeny Guide"
 *                           og:title "Ankeny Events, Restaurants & Attractions"
 *   /events/ankeny          <title> "Events in Ankeny"
 *                           og:title "Ankeny Events - Things To Do"
 *
 * One page, two titles, going to different readers: Google takes the first,
 * every social and AI crawler takes the second. Which one a PRERENDER captures
 * depends on effect-versus-render ordering, so it is not even stable between
 * builds.
 *
 * WHY A SOURCE CHECK RATHER THAN THE OUTPUT CHECK AC3 ASKS FOR. The captured
 * HTML has exactly one <title>; it cannot say which source wrote it, so
 * comparing it to "the Helmet title the page declares" means knowing the
 * declaration - which is the source. check-prerender-content already asserts
 * the captured title is present and not the shell's fallback; this asserts the
 * page has only one thing that could have written it.
 *
 * WEB-SEO-002 hit this same conflict on NeighborhoodsPage and resolved it by
 * making two title sources agree by hand, with a comment saying "keep the two
 * in sync". That lasts until someone edits one of them. This is the version
 * that does not need anyone to remember.
 *
 * Exit 0 when no page has both, 1 otherwise.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/pages', 'src/components'];

/** Head components that render a <title>. */
const HEAD_COMPONENTS = [
  'SEOHead',
  'LocalSEO',
  'EnhancedLocalSEO',
  'EnhancedEventSEO',
  'EnhancedAttractionSEO',
  'EnhancedPlaygroundSEO',
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Strip comments before matching. This file's own subject matter is named in
 * the comments of half the pages it scans - NeighborhoodsPage carries a
 * paragraph about the useDocumentTitle call it no longer has - and a checker
 * that fires on the explanation of its own fix is the single most repeated
 * mistake in this repo's tooling.
 */
function codeOnly(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<!:)\/\/.*$/gm, '');
}

const offenders = [];
/** Calls that pass a title already carrying the suffix the hook appends. */
const doubled = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const code = codeOnly(readFileSync(file, 'utf8'));
    if (!/\buseDocumentTitle\s*\(/.test(code)) continue;

    // SubmitEvent passed "Submit an Event | Des Moines Insider" and the tab
    // read "... | Des Moines Insider | Des Moines Insider". Found by reading
    // the rendered title of a page the main fix did not touch, which is the
    // argument for measuring the pages you did not change too.
    for (const m of code.matchAll(/useDocumentTitle\(\s*([`"'])([^`"']*)\1/g)) {
      if (/Des Moines Insider/i.test(m[2])) doubled.push({ file, title: m[2] });
    }

    const head = HEAD_COMPONENTS.filter((name) =>
      new RegExp(`<${name}[\\s/>]`).test(code),
    );
    const ownTitle = /<title>/.test(code);
    if (head.length > 0 || ownTitle) {
      offenders.push({ file, head: head.length > 0 ? head.join(', ') : '<title>' });
    }
  }
}

if (doubled.length > 0) {
  console.error(`\n[document-title] ${doubled.length} call(s) pass a title that already carries the suffix:\n`);
  for (const d of doubled) console.error(`  ${d.file}\n    useDocumentTitle("${d.title}") renders it twice`);
  console.error('\nThe hook appends " | Des Moines Insider". Pass the page name alone.\n');
  process.exit(1);
}

if (offenders.length > 0) {
  console.error(
    `\n[document-title] ${offenders.length} page(s) declare a title twice:\n`,
  );
  for (const o of offenders) {
    console.error(`  ${o.file}\n    useDocumentTitle() alongside ${o.head}`);
  }
  console.error(
    '\nThe hook wins, so the <title> and the og:title on these pages disagree -\n' +
      'and a prerender captures whichever ran last. Drop useDocumentTitle: the head\n' +
      'component sets the title, the canonical, the description and the OG set.\n' +
      'Keep the hook only on pages with no head component at all.\n',
  );
  process.exit(1);
}

console.log('[document-title] no page declares a title more than once.');

#!/usr/bin/env node
/**
 * SEO-003: exactly one component may emit a FAQPage block, and it must be one
 * that also RENDERS the questions.
 *
 *   node scripts/__tests__/faq-single-emitter.test.mjs
 *
 * Search Console reported 30 invalid FAQ items against 8 valid, critical issue
 * `Duplicate field "FAQPage"`. There were two independent causes and the second
 * is the one a naive fix would have missed:
 *
 *   1. DUPLICATION. EnhancedLocalSEO emitted a FAQPage into <Helmet>, and six
 *      pages also rendered <FAQSection>, which emits its own. FreeEvents and
 *      KidsEvents passed the SAME questions to both; Attractions and Playgrounds
 *      passed DIFFERENT ones, so one URL carried two contradictory FAQ blocks.
 *
 *   2. INVISIBILITY. EnhancedLocalSEO renders into <Helmet> and nothing else, so
 *      on DateNightEvents, DietaryRestaurants, EventsByLocation, EventsThisWeekend,
 *      EventsToday and OpenNowRestaurants it declared an FAQ no visitor could
 *      see. Google's FAQPage guidance requires the Q&A to be visible. That is
 *      invalid whether or not it is duplicated - so keeping the head-only
 *      emitter and dropping FAQSection's would have fixed the COUNT and left
 *      every surviving block non-compliant.
 *
 * This is a source scan, so it is checked in both directions: a positive
 * assertion that the legitimate emitters are still there, and a counter-
 * assertion proving the scan fires on a file that really does emit a block.
 */
import fs from 'node:fs';
import path from 'node:path';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`);
  }
};

const SRC = path.resolve('src');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(e.name)) out.push(full);
  }
  return out;
}

/** Strip comments so a file DISCUSSING FAQPage is not counted as emitting one. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const emitsFaqPage = (src) => /["']@type["']\s*:\s*["']FAQPage["']/.test(stripComments(src));

const files = walk(SRC);
const emitters = files.filter((f) => emitsFaqPage(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(SRC, f).replace(/\\/g, '/'));

console.log('\nFAQPage emitters in src/');
for (const e of emitters) console.log(`    ${e}`);

// The allowed set. Each of these renders the questions in the same component
// that emits the block, which is what makes "schema only when visible" true by
// construction rather than by discipline.
const ALLOWED = new Set([
  'components/FAQSection.tsx', // renders the accordion AND emits
  'components/schema/FAQSchema.tsx', // the shared schema-only component, used where the page renders its own visible FAQ
  'components/EnhancedEventSEO.tsx', // event detail pages; the FAQ renders in the page body
  'pseo/components/PseoPage.tsx', // PseoFaq renders the questions on the same page
]);

console.log('\nno unexpected emitter');
const unexpected = emitters.filter((e) => !ALLOWED.has(e));
check('every emitter is on the allowed list', unexpected.length === 0, unexpected.join(', '));

console.log('\nthe head-only emitter is gone');
check(
  'EnhancedLocalSEO.tsx no longer emits FAQPage',
  !emitters.includes('components/EnhancedLocalSEO.tsx'),
  'it renders into <Helmet> only, so its FAQ was never visible on the page',
);

console.log('\nno page composes two emitters');
// A page rendering FAQSection AND a component that emits its own block ships
// two. This is the check that would have caught the original defect.
const COMPONENT_EMITTERS = ['FAQSection', 'EnhancedLocalSEO', 'EnhancedEventSEO', 'FAQSchema'];
const stillEmitting = new Set(
  COMPONENT_EMITTERS.filter((c) => {
    const f = files.find((p) => p.endsWith(`${c}.tsx`));
    return f && emitsFaqPage(fs.readFileSync(f, 'utf8'));
  }),
);
const pages = files.filter((f) => /[\\/](pages|pseo)[\\/]/.test(f));
const doubled = [];
for (const p of pages) {
  const src = stripComments(fs.readFileSync(p, 'utf8'));
  const used = [...stillEmitting].filter((c) => new RegExp(`<${c}[\\s/>]`).test(src));
  if (used.length > 1) doubled.push(`${path.relative(SRC, p).replace(/\\/g, '/')} -> ${used.join(' + ')}`);
}
check('no page renders more than one FAQPage-emitting component', doubled.length === 0, doubled.join('; '));

console.log('\nthe six head-only pages now render a visible FAQ');
// These passed faqData to EnhancedLocalSEO and showed nothing. Each must now
// render FAQSection, or the questions are gone from the page entirely.
for (const page of [
  'DateNightEvents',
  'DietaryRestaurants',
  'EventsByLocation',
  'EventsThisWeekend',
  'EventsToday',
  'OpenNowRestaurants',
]) {
  const src = fs.readFileSync(path.join(SRC, 'pages', `${page}.tsx`), 'utf8');
  check(
    `${page} renders <FAQSection>`,
    /<FAQSection[\s/>]/.test(stripComments(src)),
    'lost its FAQ instead of making it visible',
  );
  check(
    `${page} imports FAQSection`,
    /from ["']@\/components\/FAQSection["']/.test(src),
    'uses the component without importing it - a runtime ReferenceError, which check-imports does NOT catch',
  );
}

console.log('\nthe scan is not vacuous');
// Counter-assertion. If the detector silently stopped matching, every check
// above would pass for the wrong reason.
check(
  'the detector fires on a file that really emits a FAQPage',
  emitsFaqPage('const x = { "@type": "FAQPage", mainEntity: [] };'),
);
check(
  'the detector does NOT fire on a comment merely mentioning FAQPage',
  !emitsFaqPage('// we removed the "@type": "FAQPage" block here'),
);
check('it found a non-empty set of real emitters', emitters.length > 0, 'zero emitters means the scan is broken, not that the site has no FAQ');

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: faq-single-emitter — ${failures} failing check(s)\n`);
process.exit(failures === 0 ? 0 : 1);

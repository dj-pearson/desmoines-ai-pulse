#!/usr/bin/env node
/**
 * A page title must survive Google's truncation (WEB-SEO-043 AC3).
 *
 * Google cuts the SERP title around 60 characters. Nine hub titles were over
 * when this was written, the worst at 78 - and WEB-SEO-002 had already trimmed
 * one from 84, so this is a class that came back once nothing was watching.
 *
 * WHY SOURCE AND NOT dist/. check-prerender-head.mjs reads the built pages and
 * would be the natural home, but dist/ holds over a thousand ENTITY pages whose
 * titles are made from row data - an event with a long name is not a
 * copywriting defect and must not fail a build. The hub titles are literals
 * somebody typed, which is where the decision is and where the fix belongs.
 *
 * THE BRAND SUFFIX IS PART OF THE LENGTH. Both title paths append it when the
 * literal does not already contain it:
 *   SEOHead          `${title} | ${BRAND.name}` unless title.includes(BRAND.name)
 *   useDocumentTitle `${title} | Des Moines Insider`, unconditionally
 * So a 45-character literal is a 66-character title. Measuring the literal
 * alone is how three of these passed review.
 *
 * ONLY LITERALS ARE MEASURED. A title built from an interpolation - a date, a
 * count, a row - is skipped, because its length is not knowable from source.
 * Those are covered by reading the rendered page, which is how the numbers in
 * WEB-SEO-043 were taken in the first place.
 *
 * Usage: node scripts/check-seo-title-length.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const MAX_TITLE = 60;
const BRAND = 'Des Moines Insider';
const SUFFIX = ` | ${BRAND}`;
const ROOT = 'src/pages';

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (name.endsWith('.tsx')) yield full;
  }
}

/**
 * Components whose `title` prop becomes the document title.
 *
 * SCOPED TO THESE, not to any `title=` in the file. A bare /\btitle=/ also
 * matches <FAQSection title="Des Moines Events - Frequently Asked Questions">
 * and <meta property="og:title">, and the first version of this script reported
 * fifteen of those as page titles. A section heading is not a SERP title, and a
 * check that cannot tell them apart is a check nobody will keep.
 */
const TITLE_COMPONENTS = ['SEOHead', 'EnhancedLocalSEO'];

/** The `title` prop inside one component element, when it is a plain literal. */
function* componentTitles(text) {
  for (const name of TITLE_COMPONENTS) {
    const open = new RegExp(`<${name}\\b`, 'g');
    for (const m of text.matchAll(open)) {
      // The element runs to its first `>` that closes the opening tag. Props
      // here are one per line, so a `>` inside a string is not a case that
      // occurs; a JSX expression containing one would end the slice early and
      // simply measure less, never more.
      const end = text.indexOf('>', m.index);
      if (end < 0) continue;
      const el = text.slice(m.index, end);
      const prop = el.match(/\btitle=\{?["'`]([^"'`$]*)["'`]\}?/);
      if (prop) yield { literal: prop[1], at: m.index, appendsBrand: true };
    }
  }
}

/** A literal title and how it reaches the document. */
const PATTERNS = [
  // useDocumentTitle("...")
  { re: /useDocumentTitle\(\s*["'`]([^"'`$]*)["'`]/g, appendsBrand: true },
  // A literal <title> element inside Helmet, which carries what it says.
  { re: /<title>([^<{]*)<\/title>/g, appendsBrand: false },
];

const problems = [];
let measured = 0;

for (const file of walk(ROOT)) {
  const rel = relative('.', file).split(sep).join('/');
  const text = readFileSync(file, 'utf8');

  const found = [
    ...componentTitles(text),
    ...PATTERNS.flatMap(({ re, appendsBrand }) =>
      [...text.matchAll(re)].map((m) => ({ literal: m[1], at: m.index, appendsBrand })),
    ),
  ];

  {
    for (const m of found) {
      const literal = m.literal.trim();
      const appendsBrand = m.appendsBrand;
      // Skip empties and the props of unrelated components that happen to be
      // called `title` - a real page title says where it is.
      if (literal.length < 12) continue;
      const rendered = appendsBrand && !literal.includes(BRAND) ? literal + SUFFIX : literal;
      measured += 1;
      if (rendered.length > MAX_TITLE) {
        const line = text.slice(0, m.at).split('\n').length;
        problems.push(
          `${rel}:${line} title is ${rendered.length} chars, over ${MAX_TITLE}: ${JSON.stringify(rendered)}`,
        );
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`\nX A page title will be truncated in search results:\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    `\nGoogle cuts around ${MAX_TITLE} characters, and the brand suffix "${SUFFIX.trim()}"\n` +
      'counts - both title paths append it when the literal does not already say it.\n',
  );
  process.exit(1);
}

console.log(`[seo-title-length] ${measured} literal title(s) in ${ROOT} all fit ${MAX_TITLE} characters.`);

#!/usr/bin/env node
/**
 * A page title and meta description must survive Google's truncation
 * (WEB-SEO-043 AC3).
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
/** Google cuts the SERP snippet around here; thirteen pages were over. */
const MAX_DESCRIPTION = 160;
/**
 * A description built from a count - `${events.length}+ free events` - is
 * measured with the count standing in at four digits. The empty backend in a
 * container renders "0+", so measuring what a template produces there
 * understates every one of them by three characters.
 */
const COUNT_PLACEHOLDER = '9999';
const BRAND = 'Des Moines Insider';
const SUFFIX = ` | ${BRAND}`;
const ROOT = 'src/pages';
/** index.html carries the site-wide default description. */
const EXTRA_FILES = ['index.html'];

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
      const title = el.match(/\btitle=\{?["'`]([^"'`$]*)["'`]\}?/);
      if (title) yield { literal: title[1], at: m.index, appendsBrand: true, kind: 'title' };
      const desc = el.match(/\b(?:description|pageDescription)=\{?["'`]([^"'`]*)["'`]\}?/);
      if (desc) yield { literal: desc[1], at: m.index, appendsBrand: false, kind: 'description' };
    }
  }
}

/** A literal title and how it reaches the document. */
const PATTERNS = [
  // useDocumentTitle("...")
  { re: /useDocumentTitle\(\s*["'`]([^"'`$]*)["'`]/g, appendsBrand: true, kind: 'title' },
  // A literal <title> element inside Helmet, which carries what it says.
  { re: /<title>([^<{]*)<\/title>/g, appendsBrand: false, kind: 'title' },
  // `const pageTitle = ...` IS NOT MEASURED, and the attempt is worth
  // recording. Its consumers disagree about the brand suffix - /guides renders
  // its 52-character pageTitle verbatim while others append - and on
  // /events/free and /events/kids the rendered title is 32 characters, set by
  // a different path entirely, so the const is not what reaches the document.
  // Measuring it produced two false positives out of four. The literals
  // themselves were shortened anyway; the inconsistency is its own defect.
  // `const pageDescription = "..."` / a template with interpolations.
  { re: /\bpageDescription\s*=\s*["'`]([^"'`]*)["'`]/g, appendsBrand: false, kind: 'description' },
  { re: /\bpageDescription\s*=\s*`([\s\S]*?)`/g, appendsBrand: false, kind: 'description' },
  // <meta name="description" content="...">
  { re: /<meta\s+name="description"\s+content="([^"]*)"/g, appendsBrand: false, kind: 'description' },
];

// Two patterns can match the same literal - a `pageDescription` template is
// caught by both the quoted and the backtick rule - so findings are keyed by
// file, line and kind. A check that reports the same string twice reads as two
// defects.
const seen = new Set();
const problems = [];
let measured = 0;

for (const file of [...walk(ROOT), ...EXTRA_FILES]) {
  const rel = relative('.', file).split(sep).join('/');
  const text = readFileSync(file, 'utf8');

  const found = [
    ...componentTitles(text),
    ...PATTERNS.flatMap(({ re, appendsBrand, kind }) =>
      [...text.matchAll(re)].map((m) => ({ literal: m[1], at: m.index, appendsBrand, kind })),
    ),
  ];

  {
    for (const m of found) {
      // An interpolated count stands in at four digits; any other expression
      // makes the length unknowable from source, so the string is skipped.
      const raw = m.literal
        .replace(/\$\{\s*BRAND\.name\s*\}/g, BRAND)
        .replace(/\$\{[^}]*\.length\}/g, COUNT_PLACEHOLDER);
      if (raw.includes('${')) continue;
      const literal = raw.replace(/\s+/g, ' ').trim();
      const appendsBrand = m.appendsBrand;
      // Skip empties and the props of unrelated components that happen to be
      // called `title` - a real page title says where it is.
      if (literal.length < 12) continue;
      const max = m.kind === 'title' ? MAX_TITLE : MAX_DESCRIPTION;
      const rendered = appendsBrand && !literal.includes(BRAND) ? literal + SUFFIX : literal;
      measured += 1;
      if (rendered.length > max) {
        const line = text.slice(0, m.at).split('\n').length;
        const key = `${rel}:${line}:${m.kind}`;
        if (seen.has(key)) continue;
        seen.add(key);
        problems.push(
          `${rel}:${line} ${m.kind} is ${rendered.length} chars, over ${max}: ${JSON.stringify(rendered.slice(0, 90))}`,
        );
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`\nX A page title or description will be truncated in search results:\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    `\nGoogle cuts titles around ${MAX_TITLE} characters and snippets around ${MAX_DESCRIPTION}.\n` +
      `The brand suffix "${SUFFIX.trim()}" counts - both title paths append it when\n` +
      `the literal does not already say it - and an interpolated count is measured\n` +
      `as ${COUNT_PLACEHOLDER.length} digits, because the empty backend in a container renders "0+".\n`,
  );
  process.exit(1);
}

console.log(
  `[seo-meta-length] ${measured} literal title(s) and description(s) in ${ROOT} fit ` +
    `${MAX_TITLE}/${MAX_DESCRIPTION} characters.`,
);

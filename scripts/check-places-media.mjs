#!/usr/bin/env node
/**
 * A Google Places media URL is built in one place and stored in none
 * (WEB-BE-044).
 *
 * THE DEFECT THIS REPLACES. bulk-update-restaurants assigned
 *   image_url = `https://places.googleapis.com/v1/${photo.name}/media?...`
 * under a comment claiming it stored "the photo reference name instead of the
 * full URL with API key". It stored a full media URL with the key omitted,
 * which returns 403 - so every restaurant enriched that way has been rendering
 * a broken image - and hot-linking Place photos out of a content column is
 * outside the Maps Platform terms even when it works.
 *
 * TWO RULES, both absolute rather than ratcheted: neither has a legitimate
 * instance to grandfather.
 *
 *  1. The media URL template may only appear in _shared/placesPhoto.ts. One
 *     builder means the key handling, the size parameters and the detector
 *     cannot disagree, and it makes rule 2 checkable by name instead of by
 *     pattern-matching every assignment in the repo.
 *
 *  2. No content column may be assigned one. The columns listed below are the
 *     ones that reach a page.
 *
 * Usage: node scripts/check-places-media.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOTS = ['src', 'supabase/functions', 'scripts', 'crawlers'];
const EXTS = ['.ts', '.tsx', '.js', '.mjs', '.py'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '__pycache__', '.git']);

/** The one module allowed to build the URL, and the test that asserts it. */
const BUILDERS = ['supabase/functions/_shared/placesPhoto.ts'];
const ALLOWED_TO_MENTION = [
  ...BUILDERS,
  'supabase/functions/_tests/places-photo-terms.test.ts',
  'scripts/check-places-media.mjs',
];

/** Columns whose value reaches a rendered page. */
const CONTENT_COLUMNS = [
  'image_url',
  'imageUrl',
  'featured_image_url',
  'cover_image',
  'photo_url',
  'hero_image',
  'thumbnail_url',
];

const MEDIA_TEMPLATE = /places\.googleapis\.com\/v1\/[^'"`\s]*?\/media/;
const ASSIGNS_PLACES = new RegExp(
  `(?:${CONTENT_COLUMNS.join('|')})\\s*[:=]\\s*\`?https://places\\.googleapis\\.com`,
);

/**
 * Comments are stripped before matching. Without this the rules fire on the
 * prose explaining them - this file's own header quotes the defective
 * assignment, and so do the migration and the test. A check that its own
 * docstring can fail is the same defect as one its docstring can satisfy.
 *
 * Python docstrings are left alone: the only .py files in scope use # comments,
 * and a half-correct triple-quote stripper is worse than none.
 *
 * THE LOOKBEHIND IS LOAD-BEARING. A plain /\/\/.*$/ truncates every line at
 * the "//" in "https://", which is every line this file is looking for - so the
 * first version of this check reported clean against a deliberately
 * reintroduced `image_url = \`https://places.googleapis.com/...\`` and I only
 * found out by running the control. Not matching a "//" preceded by a colon
 * keeps URLs intact and still strips comments at any indentation.
 */
function codeOnly(text, isPython) {
  if (isPython) {
    return text.split('\n').map((l) => l.replace(/#.*$/, '')).join('\n');
  }
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(?<!:)\/\/.*$/, ''))
    .join('\n');
}

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (EXTS.some((e) => name.endsWith(e))) yield full;
  }
}

const problems = [];
let scanned = 0;

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const rel = relative('.', file).split(sep).join('/');
    scanned += 1;
    if (ALLOWED_TO_MENTION.includes(rel)) continue;
    const text = codeOnly(readFileSync(file, 'utf8'), file.endsWith('.py'));

    if (MEDIA_TEMPLATE.test(text)) {
      const line = text.split('\n').findIndex((l) => MEDIA_TEMPLATE.test(l)) + 1;
      problems.push(
        `${rel}:${line} builds a Places media URL. Import placesMediaUrl from ` +
          '_shared/placesPhoto.ts instead - one builder, one place the key is handled.',
      );
    }

    const assignLine = text.split('\n').findIndex((l) => ASSIGNS_PLACES.test(l));
    if (assignLine >= 0) {
      problems.push(
        `${rel}:${assignLine + 1} assigns a Places URL to a content column. Store the photo ` +
          'RESOURCE NAME (places/<id>/photos/<ref>) and build the media URL at fetch time.',
      );
    }
  }
}

if (problems.length > 0) {
  console.error('\nX Google Places photo handling is outside the Maps Platform terms:\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error(`
Place content may be cached for at most 30 days; place IDs and photo resource
names are references rather than content and may be stored. The media URL is
built per fetch and thrown away.
`);
  process.exit(1);
}

console.log(
  `[places-media] ${scanned} file(s) scanned: the media URL is built only in ${BUILDERS[0]}, and no content column holds one.`,
);

#!/usr/bin/env node
/**
 * SEO-024 AC3: every destination in the /outdoors guide ships as its own
 * section AND as a typed Place node in the page's ItemList.
 *
 * WHY THIS EXISTS, and it is not hypothetical. The first build of the rewritten
 * /outdoors emitted two ItemLists - one for the eight guide destinations, one
 * for the mapped trails. `dedupeJsonLd` in scripts/lazy-preload-patterns.mjs
 * keeps only the LAST Helmet-managed block of any given @type, because Helmet
 * genuinely does snapshot one component at two data states and both land in the
 * DOM. It cannot tell that apart from two components emitting two different
 * lists, so it dropped the destinations list - the entire structured-data
 * deliverable of the story - and the build said so in one line among forty:
 *
 *     dropped 1 duplicate JSON-LD block(s) on /outdoors (ItemList)
 *
 * Type-check passed. Lint passed. The page looked right in the browser, because
 * the visible sections were never the thing that went missing. Only reading the
 * shipped HTML found it, which is the standing rule on this PRD.
 *
 * WHAT IT ASSERTS, all three being properties no live data can invalidate:
 *
 *   1. Each destination has an element with its anchor id, so the summary list
 *      at the top of the page links somewhere real.
 *   2. Each destination's name appears in a heading in the body.
 *   3. Each destination appears in an application/ld+json ItemList as a node
 *      typed Park or TouristAttraction, carrying an address and geo.
 *
 * THE SOURCE OF TRUTH IS src/data/outdoorsGuide.ts, read here rather than
 * restated, so adding a ninth destination extends the check without a second
 * edit - the hand-maintained-list problem this repo keeps rediscovering.
 *
 * Requires a build: it reads dist/outdoors.html.
 *
 *   node scripts/check-outdoors-guide.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const GUIDE_SOURCE = join(ROOT, 'src', 'data', 'outdoorsGuide.ts');
const PAGE = join(ROOT, 'dist', 'outdoors.html');

/** The narrower types a guide destination is allowed to declare. */
const ALLOWED_TYPES = new Set(['Park', 'TouristAttraction']);

if (!existsSync(PAGE)) {
  console.error('[outdoors-guide] dist/outdoors.html is missing. Run `npm run build` first.');
  process.exit(1);
}

/**
 * Destination ids and names, read out of the data module.
 *
 * A regex rather than a TS import because this file is plain node and the data
 * module is TypeScript. It anchors on the two fields in document order inside
 * OUTDOORS_DESTINATIONS, and fails loudly below if it finds nothing, so a
 * refactor that changes the shape breaks the check rather than emptying it.
 */
function readDestinations(source) {
  const start = source.indexOf('export const OUTDOORS_DESTINATIONS');
  if (start === -1) return [];
  const end = source.indexOf('export const OUTDOORS_TOPICS', start);
  const block = source.slice(start, end === -1 ? undefined : end);

  const destinations = [];
  const re = /\n {4}id: "([^"]+)",\n {4}name: "([^"]+)",/g;
  let match;
  while ((match = re.exec(block)) !== null) {
    destinations.push({ id: match[1], name: match[2] });
  }
  return destinations;
}

/** Every JSON-LD object on the page, parsed. Unparseable blocks are a failure. */
function readJsonLd(html, failures) {
  const blocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  const parsed = [];
  for (const [, body] of blocks) {
    try {
      parsed.push(JSON.parse(body));
    } catch (error) {
      failures.push(`unparseable application/ld+json block: ${error.message}`);
    }
  }
  return parsed;
}

const source = readFileSync(GUIDE_SOURCE, 'utf8');
const destinations = readDestinations(source);
const html = readFileSync(PAGE, 'utf8');
const failures = [];

if (destinations.length === 0) {
  console.error(
    '[outdoors-guide] read 0 destinations from src/data/outdoorsGuide.ts. The file moved or ' +
      'changed shape, so this check is asserting nothing. Fix readDestinations() rather than ' +
      'deleting the check.',
  );
  process.exit(1);
}

const jsonLd = readJsonLd(html, failures);
const listedNodes = new Map();
for (const block of jsonLd) {
  if (block?.['@type'] !== 'ItemList') continue;
  for (const element of block.itemListElement ?? []) {
    const item = element?.item;
    if (item?.name) listedNodes.set(item.name, item);
  }
}

// Headings only. A name appearing in a nav link or a paragraph is not the same
// as the page having a section about it, and the nav link is the thing that
// would survive if the section were deleted.
// Strips to a fixed point rather than in one pass, which is what CodeQL's
// incomplete-multi-character-sanitization rule asks for. Being honest about the
// strength of this: /<[^>]+>/g already handles the usual `<<script>script>` and
// `<scr<b>ipt>` splices, because [^>]+ consumes `<` freely, and no input was
// found where the second iteration changes the result. It is kept because it
// cannot be wrong and the rule is cheap to satisfy. The real reason this was
// never an injection surface is below: the extracted text is compared against
// destination names for a build gate and is never rendered anywhere.
function stripTags(value) {
  let previous;
  let current = value;
  do {
    previous = current;
    current = current.replace(/<[^>]+>/g, '');
  } while (current !== previous);
  return current;
}

const headings = new Set(
  [...html.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/g)].map(([, inner]) =>
    stripTags(inner).replace(/&#x27;|&apos;/g, "'").replace(/&amp;/g, '&').trim(),
  ),
);

for (const destination of destinations) {
  if (!html.includes(`id="${destination.id}"`)) {
    failures.push(`${destination.name}: no element with id="${destination.id}" in the page`);
  }
  if (!headings.has(destination.name)) {
    failures.push(`${destination.name}: no heading of its own in the page body`);
  }

  const node = listedNodes.get(destination.name);
  if (!node) {
    failures.push(
      `${destination.name}: not in any ItemList in the shipped JSON-LD ` +
        '(a second ItemList on this page is dropped by dedupeJsonLd - see the header)',
    );
    continue;
  }
  if (!ALLOWED_TYPES.has(node['@type'])) {
    failures.push(
      `${destination.name}: ItemList node is @type ${node['@type']}, expected one of ${[...ALLOWED_TYPES].join(', ')}`,
    );
  }
  if (!node.address) failures.push(`${destination.name}: ItemList node has no address`);
  if (!node.geo) failures.push(`${destination.name}: ItemList node has no geo`);
}

const faq = jsonLd.find((block) => block?.['@type'] === 'FAQPage');
if (!faq) {
  failures.push('no FAQPage block on /outdoors');
} else if ((faq.mainEntity ?? []).length < 8) {
  failures.push(`FAQPage carries ${(faq.mainEntity ?? []).length} questions, expected at least 8`);
}

if (failures.length > 0) {
  console.error(
    `[outdoors-guide] The /outdoors guide did not ship complete (SEO-024). ` +
      `${failures.length} problem(s) across ${destinations.length} destination(s):`,
  );
  for (const failure of failures) console.error(`    ${failure}`);
  process.exit(1);
}

console.log(
  `[outdoors-guide] OK ${destinations.length} destinations each ship a section, an anchor and a ` +
    `typed Place node; FAQPage carries ${faq.mainEntity.length} questions.`,
);

#!/usr/bin/env node
/**
 * Generates src/components/ui/icon-sprite.generated.tsx from the installed
 * lucide-react package (WEB-PERF-023).
 *
 * WHY THIS EXISTS. Measured on the prerendered /events, icon internals are 49%
 * of a SocialEventCard's DOM: 8 <svg> and 25 child nodes out of 67 elements.
 * Across the page that is 317 <svg> plus 907 children out of 2,640 elements -
 * 46%. Every one of those children is the same handful of shapes repeated once
 * per card. A <symbol> defined once plus <svg><use/></svg> per instance renders
 * identically and costs 2 nodes instead of 3-6.
 *
 * WHY IT IS GENERATED RATHER THAN HAND-WRITTEN. Copying lucide's path data into
 * this repo by hand creates a second source of truth that drifts silently on
 * the next lucide bump - the exact defect class this PRD keeps finding. The
 * generator reads node_modules and records the version it read, so `npm run
 * icons:sprite` after an upgrade produces a diff instead of a divergence.
 *
 * It parses the iconNode array out of lucide's ESM source. That shape is
 * stable across 0.4x but it is still parsing, so every failure throws with the
 * file it choked on rather than emitting a partial sprite.
 *
 * Usage: node scripts/generate-icon-sprite.mjs [--check]
 *   --check exits 1 if the committed file differs from what would be generated.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICON_DIR = path.join(ROOT, 'node_modules', 'lucide-react', 'dist', 'esm', 'icons');
const OUT = path.join(ROOT, 'src', 'components', 'ui', 'icon-sprite.generated.tsx');

/**
 * The sprite set. Kebab-case lucide names, which are also the sprite ids and
 * the `name` prop values.
 *
 * TWO RULES DECIDE MEMBERSHIP, and the second one is easy to miss.
 *
 * 1. The icon repeats per list item, so the saving multiplies by the number of
 *    cards on the page. An icon used once is cheaper as a normal lucide import;
 *    every symbol here ships on every page whether used or not.
 * 2. THE ICON MUST HAVE MORE THAN ONE CHILD SHAPE. A sprite instance costs two
 *    nodes (<svg> + <use>), so a single-path icon costs exactly what it did
 *    inline and gains nothing. Measured on the current lucide:
 *        share-2 6 -> 2   sparkles 6 -> 2   calendar 5 -> 2
 *        ticket  5 -> 2   users    5 -> 2   clock/map-pin/arrow-right 3 -> 2
 *        heart, star, chevron-down, chevron-right   2 -> 2   (no saving)
 *    heart and star are the two that look like obvious candidates - they repeat
 *    on every card and every rating - and they are exactly the two that pay
 *    nothing. They stay as inline lucide imports.
 */
const ICONS = [
  'arrow-right',
  'calendar',
  'clock',
  'map-pin',
  'share-2',
  'sparkles',
  'ticket',
  'trending-up',
  'users',
];

function iconNodeFor(kebab) {
  const file = path.join(ICON_DIR, `${kebab}.js`);
  if (!existsSync(file)) {
    throw new Error(`lucide icon "${kebab}" not found at ${file}`);
  }
  const src = readFileSync(file, 'utf8');
  const open = src.indexOf('createLucideIcon(');
  if (open === -1) throw new Error(`no createLucideIcon() call in ${file}`);
  const arrayStart = src.indexOf('[', open);
  if (arrayStart === -1) throw new Error(`no iconNode array in ${file}`);
  // Balanced-bracket scan rather than a regex: attribute values contain no
  // brackets today, but a regex that assumes so would fail silently and emit a
  // truncated icon, which renders as a subtly wrong shape rather than an error.
  let depth = 0;
  let end = -1;
  for (let i = arrayStart; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) throw new Error(`unbalanced iconNode array in ${file}`);
  const literal = src.slice(arrayStart, end);
  // The literal is a plain JS array of [tag, attrs] with unquoted keys.
  // eslint-disable-next-line no-new-func
  const node = new Function(`return ${literal};`)();
  if (!Array.isArray(node) || node.length === 0) {
    throw new Error(`empty iconNode for ${kebab}`);
  }
  return node;
}

function camel(attr) {
  // lucide's ESM already uses camelCase React prop names in the attrs object.
  return attr;
}

function renderChild([tag, attrs], i) {
  const props = Object.entries(attrs)
    .filter(([k]) => k !== 'key')
    .map(([k, v]) => `${camel(k)}=${JSON.stringify(String(v))}`)
    .join(' ');
  return `      <${tag} ${props} key="${attrs.key ?? i}" />`;
}

const version = JSON.parse(
  readFileSync(path.join(ROOT, 'node_modules', 'lucide-react', 'package.json'), 'utf8'),
).version;

const symbols = ICONS.map((kebab) => {
  const node = iconNodeFor(kebab);
  const children = node.map(renderChild).join('\n');
  return `    <symbol id="lu-${kebab}" viewBox="0 0 24 24">\n${children}\n    </symbol>`;
}).join('\n');

const out = `// GENERATED by scripts/generate-icon-sprite.mjs from lucide-react ${version}.
// Do not edit. Run \`npm run icons:sprite\` after upgrading lucide-react.
//
// Shape and attribute defaults are copied from lucide's own Icon.js /
// defaultAttributes.js, so <SpriteIcon name="clock" /> renders the same pixels
// as <Clock /> - see src/components/ui/SpriteIcon.tsx.

export const SPRITE_ICON_NAMES = [
${ICONS.map((k) => `  '${k}',`).join('\n')}
] as const;

export type SpriteIconName = (typeof SPRITE_ICON_NAMES)[number];

/**
 * Mounted once, near the root. Renders nothing visible; every <SpriteIcon />
 * on the page references these symbols by id.
 */
export function LucideSprite() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
      xmlns="http://www.w3.org/2000/svg"
    >
${symbols}
    </svg>
  );
}
`;

// Compare content, not bytes. git runs with core.autocrlf=true on Windows, so
// the committed file is checked out with CRLF while this generator always
// writes LF - a raw `!==` therefore reported "out of date" on every Windows
// checkout no matter what the icons were, and blamed the lucide version in the
// message while that version was identical on both sides. The suggested fix
// made it worse: `npm run icons:sprite` rewrote all 84 lines to LF, git showed
// a full-file diff, and committing that moved the same failure to the next
// machine. Nothing caught it in CI because no PR workflow runs `npm run
// validate` - the command CLAUDE.md tells contributors to run (WEB-UX-010).
const CR = String.fromCharCode(13);
const normalize = (s) => s.split(CR).join('');

if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (normalize(current) !== normalize(out)) {
    console.error(
      `${path.relative(ROOT, OUT)} is out of date with lucide-react ${version}.\n` +
        'Run: npm run icons:sprite',
    );
    process.exit(1);
  }
  console.log(`icon sprite up to date (${ICONS.length} symbols, lucide-react ${version})`);
} else {
  writeFileSync(OUT, out, 'utf8');
  console.log(
    `wrote ${path.relative(ROOT, OUT)} - ${ICONS.length} symbols from lucide-react ${version}`,
  );
}

#!/usr/bin/env node
/**
 * WEB-PERF-041. A reader-facing <img> that bypasses OptimizedImage.
 *
 * OptimizedImage is the component that emits a transform-based srcset, so
 * Supabase Storage (or our own /media/ route, which speaks the same transform
 * contract) serves a rendition sized for the viewport instead of the original.
 * 79 raw <img> tags in src/ went around it, and only 6 of them set width and
 * height at all.
 *
 * WHAT THE AUDIT ACTUALLY FOUND, because the headline number is misleading and
 * the next person should not re-derive it:
 *
 *   79  raw <img> in src/
 *   54  of them reader-facing (the rest are admin, CMS and advertiser screens)
 *   38  of those read a database image URL - image_url, featured_image_url and
 *       friends - and are therefore the ones where a transform srcset is worth
 *       anything. The other 16 are local assets, object-URL previews and
 *       external logos, where OptimizedImage would add a wrapper and no bytes.
 *   10  set no width/height AND sit in no container that reserves height, which
 *       is the CLS subset. NOT 73. Most unsized images here are inside a
 *       `h-48`, an `aspect-[…]` or an `absolute inset-0`, where the box is
 *       already reserved and the missing attributes cost nothing.
 *
 * SO THIS IS A RATCHET, NOT A GATE. Converting 38 layout-sensitive call sites
 * is the work; what was missing is anything stopping the number going UP while
 * that happens. A file may lose raw <img> tags freely. It may not gain one, and
 * a file with none may not acquire its first.
 *
 * Offline. No network, no credentials.
 *
 *   node scripts/check-raw-img.mjs           # check
 *   node scripts/check-raw-img.mjs --write   # re-baseline (only ever downward)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const BASELINE = join(ROOT, '.github', 'raw-img-baseline.json');
const WRITE = process.argv.includes('--write');

/**
 * Screens staff use. An oversized image on an admin table costs an employee a
 * moment; the same image on a listing page costs every visitor.
 * OptimizedImage.tsx is excluded because its own <img> tags ARE the component.
 */
const EXCLUDE =
  /(^|[\\/])(admin|cms|crm|advertising)[\\/]|[\\/]pages[\\/](Admin|CMS|Campaign)|Manager\.tsx$|__tests__|OptimizedImage\.tsx$/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/**
 * Blanks comments so an <img> NAMED in prose is not counted as rendered.
 *
 * Found immediately: ImageViewer.tsx's own docstring says it "Wraps its
 * children (e.g. an <img>)", and the first version of this script counted that
 * as a raw image with no reserved height. The same trap is documented in
 * check-duplicate-schema.mjs, which is where this approach comes from.
 *
 * Replaced with spaces rather than removed, so every line number stays right.
 */
function stripComments(source) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/.*/g, (m, p) => p + ' '.repeat(m.length - p.length));
}

/** Text of every <img …> opening tag, brace-aware so {a > b} does not end it. */
function imgTags(source) {
  const tags = [];
  const open = /<img(\s|\/|>)/g;
  for (let m = open.exec(source); m; m = open.exec(source)) {
    let i = m.index + 4;
    let depth = 0;
    for (; i < source.length; i++) {
      const ch = source[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) break;
    }
    tags.push({ text: source.slice(m.index, i + 1), index: m.index });
  }
  return tags;
}

if (!existsSync(SRC)) {
  console.error('[raw-img] src/ is missing - refusing to pass.');
  process.exit(1);
}

const counts = {};
let clsRisk = 0;
const clsSites = [];

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  if (EXCLUDE.test(relative(ROOT, file))) continue;
  const source = stripComments(readFileSync(file, 'utf8'));
  const tags = imgTags(source);
  if (tags.length === 0) continue;
  counts[rel] = tags.length;

  for (const tag of tags) {
    const sized = /\bwidth=/.test(tag.text) && /\bheight=/.test(tag.text);
    if (sized) continue;
    const line = source.slice(0, tag.index).split('\n').length;
    // Look up for the wrapper that already reserves the box. TEN lines, not
    // five: ImageViewer's <img> sits inside a `w-full h-full flex` whose
    // className is seven lines above it, and a shorter window reported it as a
    // layout shift in a full-screen overlay that cannot shift.
    const above = source.split('\n').slice(Math.max(0, line - 11), line - 1).join(' ');
    // h-full and h-screen count: ImageViewer's overlay bounds its image with
    // `w-full h-full flex`, and a pattern that only knew `h-<number>` called
    // that a layout shift in a box that cannot shift.
    const reserved = /\b(h-\d|h-\[|h-full|h-screen|min-h-|max-h-|aspect-|inset-0|absolute)/.test(
      tag.text + ' ' + above,
    );
    if (!reserved) {
      clsRisk++;
      clsSites.push(`${rel}:${line}`);
    }
  }
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);

if (total === 0) {
  console.error('[raw-img] matched no <img> at all - refusing to pass on that.');
  process.exit(1);
}

if (WRITE) {
  writeFileSync(
    BASELINE,
    `${JSON.stringify(
      {
        _comment:
          'Reader-facing raw <img> per file (WEB-PERF-041). These bypass OptimizedImage, so no transform srcset is emitted and the original is served. This list must only ever SHRINK - route them through OptimizedImage. clsRisk counts the ones that also reserve no height.',
        generated: new Date().toISOString().slice(0, 10),
        total,
        clsRisk,
        files: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`[raw-img] baseline written: ${total} raw <img> across ${Object.keys(counts).length} file(s), ${clsRisk} with no reserved height.`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error('[raw-img] no baseline. Run: node scripts/check-raw-img.mjs --write');
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const known = baseline.files ?? {};

const grown = [];
for (const [file, n] of Object.entries(counts)) {
  const was = known[file] ?? 0;
  if (n > was) grown.push({ file, was, now: n });
}

console.log(
  `[raw-img] ${total} reader-facing raw <img> across ${Object.keys(counts).length} file(s) ` +
    `(baseline ${baseline.total}); ${clsRisk} reserve no height (baseline ${baseline.clsRisk ?? 0}).`,
);

if (grown.length === 0 && clsRisk <= (baseline.clsRisk ?? 0)) {
  if (total < baseline.total) {
    console.log(`OK Down ${baseline.total - total} from the baseline. Re-baseline with --write.`);
  } else {
    console.log('OK No file gained a raw <img>.');
  }
  process.exit(0);
}

if (grown.length) {
  console.error('\nX A file gained a raw <img>:\n');
  for (const g of grown) console.error(`  ${g.file}  ${g.was} -> ${g.now}`);
}
if (clsRisk > (baseline.clsRisk ?? 0)) {
  console.error(`\nX Images reserving no height: ${baseline.clsRisk ?? 0} -> ${clsRisk}\n`);
  for (const s of clsSites) console.error(`  ${s}`);
}
console.error(
  '\nUse <OptimizedImage> from @/components/OptimizedImage. It emits the\n' +
    'transform srcset for Supabase Storage AND for our own /media/ route, plus\n' +
    'sizes, the WebP/AVIF probe, the blur placeholder and the error fallback.\n' +
    'If the src is a local asset or an object URL there is nothing to transform -\n' +
    'set width and height on the raw tag instead so it reserves its box.\n',
);
process.exit(1);

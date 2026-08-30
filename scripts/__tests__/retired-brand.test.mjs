#!/usr/bin/env node
/**
 * SEO-006: the retired brand name must not reach anything a person or a machine
 * reads.
 *
 *   node scripts/__tests__/retired-brand.test.mjs
 *
 * The product is Des Moines Insider. "Des Moines AI Pulse" is the retired name,
 * and on 2026-08-28 it was still being served in the two places a machine reads
 * first: /events/date-night's <title> ended "| Des Moines AI Pulse", and
 * public/manifest.json declared it as the PWA install name, which is the string
 * that ends up on a phone home screen.
 *
 * COMMENTS ARE EXEMPT ON PURPOSE. Several comments record that a title "used the
 * retired Des Moines AI Pulse brand" - that is the history of a fix, and
 * rewriting it would erase the record rather than correct the brand. The scan
 * therefore strips comments, and there is a counter-assertion below proving it
 * still catches the name in real code.
 */
import fs from 'node:fs';
import path from 'node:path';

const RETIRED = 'Des Moines AI Pulse';
const CURRENT = 'Des Moines Insider';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`);
  }
};

/** Drop block comments and whole-line // comments. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

function walk(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, exts, out);
    else if (exts.some((x) => e.name.endsWith(x))) out.push(full);
  }
  return out;
}

console.log('\nsource: no retired brand outside comments');
const srcFiles = walk('src', ['.ts', '.tsx']);
const offenders = srcFiles.filter((f) => stripComments(fs.readFileSync(f, 'utf8')).includes(RETIRED));
check(
  'no .ts/.tsx file uses the retired name in code',
  offenders.length === 0,
  offenders.map((f) => path.relative('.', f)).join(', '),
);

console.log('\npublic files a machine reads');
for (const f of ['public/manifest.json', 'public/robots.txt', 'public/.well-known/security.txt']) {
  check(`${f} does not carry the retired name`, !fs.readFileSync(f, 'utf8').includes(RETIRED));
}

console.log('\nthe PWA identity matches the single brand declaration');
// brandConfig.ts is the one declaration; the manifest is hand-maintained JSON
// and drifted from it. name/short_name are what a phone home screen shows.
const manifest = JSON.parse(fs.readFileSync('public/manifest.json', 'utf8'));
const brand = fs.readFileSync('src/lib/brandConfig.ts', 'utf8');
const declaredName = /name:\s*'([^']+)'/.exec(brand)?.[1];
const declaredShort = /shortName:\s*'([^']+)'/.exec(brand)?.[1];
check('brandConfig declares a name', !!declaredName, String(declaredName));
check(`manifest name === brandConfig name (${declaredName})`, manifest.name === declaredName, manifest.name);
check(`manifest short_name === brandConfig shortName (${declaredShort})`, manifest.short_name === declaredShort, manifest.short_name);

console.log('\nthe scan is not vacuous');
// Without these, every check above would pass if the detector had silently
// stopped matching, or if src/ resolved to nothing.
check('it scanned a non-trivial number of files', srcFiles.length > 100, String(srcFiles.length));
check(
  'the detector fires on the retired name in real code',
  stripComments(`const t = "Events | ${RETIRED}";`).includes(RETIRED),
);
check(
  'the detector does NOT fire on a comment recording the rename',
  !stripComments(`// was 84 chars and used the retired "${RETIRED}" brand`).includes(RETIRED),
);
check(
  'the detector does NOT fire on a block comment recording the rename',
  !stripComments(`/**\n * Platform-wide Sentry DSN for ${RETIRED}.\n */`).includes(RETIRED),
);
check('the current brand is actually present in source', srcFiles.some((f) => fs.readFileSync(f, 'utf8').includes(CURRENT)));

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: retired-brand — ${failures} failing check(s)\n`);
process.exit(failures === 0 ? 0 : 1);

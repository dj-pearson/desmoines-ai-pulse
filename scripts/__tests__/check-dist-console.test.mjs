#!/usr/bin/env node
/**
 * Offline checks for check-dist-console after strip-sourcemaps (WEB-CI-039).
 *
 *   node scripts/__tests__/check-dist-console.test.mjs
 *
 * `npm run build` takes the maps out of dist/. The check used to read that as
 * "no map", call every non-vendor chunk app code, and fail on pdf-generator's
 * bundled jsPDF console.error, so it could not run after the real build. The
 * cases that matter run strip-sourcemaps for real on a tiny fake dist and then
 * the check, in both directions: a dependency's call passes, ours still fails,
 * and a chunk with no map anywhere still fails.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = path.join(SCRIPTS, 'check-dist-console.mjs');
const STRIP = path.join(SCRIPTS, 'strip-sourcemaps.mjs');

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`);
  }
};

// One generated line whose column 0 maps to sources[0]; the console call sits
// at column 0, so the check attributes it to that source.
const CODE = 'console.error("x");export const a=1;\n';
const mapFor = (file, source, mappings = 'AAAA') =>
  JSON.stringify({ version: 3, file: `assets/${file}`, sources: [source], names: [], mappings });

/** A fake project root holding dist/assets with the given chunks. */
function project(chunks) {
  const root = mkdtempSync(path.join(tmpdir(), 'dist-console-'));
  const assets = path.join(root, 'dist', 'assets');
  mkdirSync(assets, { recursive: true });
  for (const { file, source, code = CODE, mappings } of chunks) {
    writeFileSync(path.join(assets, file), code);
    if (source) writeFileSync(path.join(assets, `${file}.map`), mapFor(file, source, mappings));
  }
  return root;
}

const run = (script, cwd) => spawnSync(process.execPath, [script], { cwd, encoding: 'utf8' });

const DEP = '../../node_modules/jspdf/dist/jspdf.es.min.js';
const APP = '../../src/lib/pdf-generator.ts';

console.log('strip-sourcemaps moves maps out of dist instead of deleting them');
{
  const root = project([{ file: 'pdf-generator-aaaa.js', source: DEP }]);
  const r = run(STRIP, root);
  check('strip exits 0', r.status === 0, r.stderr);
  check('no map left in dist', !existsSync(path.join(root, 'dist/assets/pdf-generator-aaaa.js.map')));
  check(
    'map kept under .sourcemaps/dist/assets',
    existsSync(path.join(root, '.sourcemaps/dist/assets/pdf-generator-aaaa.js.map')),
  );
  const c = run(CHECK, root);
  check('a dependency call in a non-vendor chunk passes after strip', c.status === 0, c.stderr || c.stdout);
  check('and is counted as a dependency hit', /1 in dependencies/.test(c.stdout), c.stdout);
  rmSync(root, { recursive: true, force: true });
}

console.log('\nstill fails on our own console call after strip');
{
  const root = project([
    { file: 'pdf-generator-bbbb.js', source: APP },
    { file: 'vendor-react-cccc.js', source: '../../node_modules/react/index.js' },
  ]);
  run(STRIP, root);
  const c = run(CHECK, root);
  check('exit 1', c.status === 1, `status ${c.status}`);
  check('names the source file', /src\/lib\/pdf-generator\.ts/.test(c.stderr), c.stderr);
  rmSync(root, { recursive: true, force: true });
}

console.log('\nwith no map anywhere, a non-vendor chunk is still app code');
{
  const root = project([{ file: 'pdf-generator-dddd.js' }]);
  const c = run(CHECK, root);
  check('exit 1', c.status === 1, `status ${c.status}`);
  check('says no sourcemap', /\(no sourcemap\)/.test(c.stderr), c.stderr);
  rmSync(root, { recursive: true, force: true });
}

console.log('\na moved map for a different chunk is not used');
{
  const root = project([{ file: 'pdf-generator-eeee.js' }]);
  const moved = path.join(root, '.sourcemaps/dist/assets');
  mkdirSync(moved, { recursive: true });
  // Right name on disk, but its `file` says it belongs to another chunk.
  writeFileSync(path.join(moved, 'pdf-generator-eeee.js.map'), mapFor('pdf-generator-ffff.js', DEP));
  const c = run(CHECK, root);
  check('exit 1', c.status === 1, `status ${c.status}`);
  rmSync(root, { recursive: true, force: true });
}

console.log('\nstrip empties .sourcemaps/dist first');
{
  const root = project([{ file: 'app-gggg.js', source: APP }]);
  const stale = path.join(root, '.sourcemaps/dist/assets/old-hhhh.js.map');
  mkdirSync(path.dirname(stale), { recursive: true });
  writeFileSync(stale, '{}');
  run(STRIP, root);
  check('stale map removed', !existsSync(stale));
  rmSync(root, { recursive: true, force: true });
}

// WEB-CI-040. 'SAAA' puts the first segment at column 9, so the call at
// column 0 has no source. 'AAAA,U' maps columns 0-9 to sources[0] and ends
// the mapping at column 10 with a one-field segment; LATE's call sits at 17.
const LATE = 'export const a=1;console.error("x");\n';

console.log('\na call before the first mapped segment is app code, outside vendor-*');
{
  const root = project([{ file: 'EventCard-iiii.js', source: DEP, mappings: 'SAAA' }]);
  const c = run(CHECK, root);
  check('exit 1', c.status === 1, `status ${c.status}`);
  check('says unmapped position', /EventCard-iiii\.js.*\(unmapped position\)/.test(c.stderr), c.stderr);
  rmSync(root, { recursive: true, force: true });
}
{
  const root = project([{ file: 'vendor-misc-jjjj.js', source: DEP, mappings: 'SAAA' }]);
  const c = run(CHECK, root);
  check('the same in a vendor-* chunk passes', c.status === 0, c.stderr || c.stdout);
  rmSync(root, { recursive: true, force: true });
}

console.log('\na one-field segment ends the previous source');
{
  const root = project([{ file: 'EventCard-kkkk.js', source: DEP, code: LATE, mappings: 'AAAA,U' }]);
  const c = run(CHECK, root);
  check('a call past it is not credited to the dependency', c.status === 1, c.stdout);
  rmSync(root, { recursive: true, force: true });
}
{
  const root = project([{ file: 'EventCard-llll.js', source: DEP, code: LATE, mappings: 'AAAA' }]);
  const c = run(CHECK, root);
  check('control: without the one-field segment it is the dependency\'s', c.status === 0, c.stderr);
  rmSync(root, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');

#!/usr/bin/env node
/**
 * Static audit for named imports that the target module does not export.
 *
 * WHY THIS EXISTS (WEB-QA-001)
 * A named import with no matching export is not a type error under this repo's
 * config, and Vite's esbuild transform strips types without checking them. So
 * `import { Foo } from './bar'` where bar only has `export default Foo` builds
 * clean locally, resolves to `undefined` at runtime, and React throws error #130
 * ("Element type is invalid") — a blank page behind the route error boundary.
 *
 * Four separate instances of this shipped to production simultaneously
 * (useAuthStatus, fetchRestaurantFilterFacets, SEOHead, and a placement icon
 * map), one of which also broke `npm run build` outright.
 *
 * Deliberately conservative: it only follows first-party `@/` imports, and it
 * skips modules using `export *` re-exports (whose surface it cannot see).
 *
 * Usage: node scripts/check-import-exports.mjs
 * Exits 1 if any unresolved named import is found.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '..', 'src');
const EXTENSIONS = ['.ts', '.tsx'];

/** Strip block and line comments so doc examples aren't parsed as real code. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      walk(full, out);
    } else if (EXTENSIONS.some((e) => entry.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

/** Resolve an `@/x/y` specifier to a concrete file path. */
function resolveAlias(spec) {
  if (!spec.startsWith('@/')) return null;
  const base = join(SRC, spec.slice(2));
  for (const ext of EXTENSIONS) {
    if (existsSync(base + ext)) return base + ext;
  }
  for (const ext of EXTENSIONS) {
    const idx = join(base, 'index' + ext);
    if (existsSync(idx)) return idx;
  }
  return null;
}

/** Names a module exports. Returns null when the surface can't be determined. */
function getExports(file, seen = new Set()) {
  if (seen.has(file)) return new Set();
  seen.add(file);

  const src = stripComments(readFileSync(file, 'utf8'));
  const names = new Set();

  // export * from '...' — surface is unknowable without full resolution; bail out
  // rather than emit false positives.
  if (/export\s+\*\s+from/.test(src)) return null;

  if (/export\s+default\b/.test(src)) names.add('default');

  // export const/let/var/function/class/type/interface/enum Name
  for (const m of src.matchAll(
    /export\s+(?:async\s+)?(?:const|let|var|function|class|type|interface|enum)\s+([A-Za-z0-9_$]+)/g
  )) {
    names.add(m[1]);
  }

  // export { a, b as c } and export type { a } [from '...']
  for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const piece = part.trim();
      if (!piece) continue;
      const asMatch = piece.match(/\bas\s+([A-Za-z0-9_$]+)$/);
      names.add(asMatch ? asMatch[1] : piece.replace(/^type\s+/, '').trim());
    }
  }

  return names;
}

const problems = [];

for (const file of walk(SRC)) {
  const src = stripComments(readFileSync(file, 'utf8'));

  // import { a, b as c } from '@/...'  (skip pure type imports — erased at build)
  for (const m of src.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const [, isTypeOnly, clause, spec] = m;
    if (isTypeOnly) continue;

    const target = resolveAlias(spec);
    if (!target) continue;

    const exported = getExports(target);
    if (exported === null) continue; // module uses `export *`

    for (const rawPart of clause.split(',')) {
      const piece = rawPart.trim();
      if (!piece || piece.startsWith('type ')) continue;
      const imported = piece.split(/\s+as\s+/)[0].trim();
      if (!imported) continue;

      if (!exported.has(imported)) {
        const line = src.slice(0, m.index).split('\n').length;
        problems.push({
          file: file.replace(resolve(__dirname, '..') + '\\', '').replace(/\\/g, '/'),
          line,
          imported,
          spec,
        });
      }
    }
  }
}

if (problems.length === 0) {
  console.log('✅ No unresolved named imports found.');
  process.exit(0);
}

console.error(`❌ ${problems.length} named import(s) not exported by their target module:\n`);
for (const p of problems) {
  console.error(`  ${p.file}:${p.line}  "${p.imported}" is not exported by "${p.spec}"`);
}
console.error('\nEach of these resolves to `undefined` at runtime (React error #130).');
process.exit(1);

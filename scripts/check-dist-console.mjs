#!/usr/bin/env node
/**
 * Fails when a production chunk in dist/assets still calls console.* from app
 * code.
 *
 * CLAUDE.md says console.* is stripped in production, and for a long time it
 * wasn't: the drop list sat under `build.esbuild` in vite.config.ts, which is
 * not a Vite option, so it was ignored without a warning and every
 * console.log shipped (34 chunks, EventCard among them, on the 2026-09-25
 * build). It now sits at the top level. This is the check that says so.
 *
 * What counts:
 *   - A call, `console.<name>(`. esbuild's `drop: ['console']` removes calls;
 *     a reference such as `const fn = console.warn` survives by design, and
 *     src/lib/logger.ts relies on one. Flagging references would make this
 *     check impossible to pass without touching the logger.
 *   - From app code. Each hit is mapped back through the chunk's sourcemap
 *     (the production build writes hidden ones), and only a hit whose original
 *     file is outside node_modules fails. A dependency's own console calls are
 *     not ours to strip: esbuild's `drop` runs on our modules, not on
 *     pre-bundled dependencies.
 *
 * A chunk with no .map is checked by name instead: anything not named
 * vendor-* is treated as app code, so a missing map can't hide a hit.
 *
 * Usage: npm run build && node scripts/check-dist-console.mjs [outDir]
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Optional first argument: a build output directory other than dist/.
const ASSETS = path.resolve(process.argv[2] ?? 'dist', 'assets');
const CALL = /\bconsole\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g;

if (!existsSync(ASSETS)) {
  console.error(`X ${ASSETS} does not exist. Run \`npm run build\` first.`);
  process.exit(1);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]));

/** Decode one mappings segment ("AAAA,CAAC") into integers. */
function decodeVlq(segment) {
  const out = [];
  let value = 0;
  let shift = 0;
  for (const ch of segment) {
    const digit = B64_INDEX.get(ch);
    if (digit === undefined) return out;
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
    } else {
      out.push(value & 1 ? -(value >>> 1) : value >>> 1);
      value = 0;
      shift = 0;
    }
  }
  return out;
}

/**
 * Per generated line, the sorted segments [generatedColumn, sourceIndex]. Only
 * what this check needs: which original file a generated column came from.
 */
function parseMappings(mappings) {
  const lines = [];
  let sourceIndex = 0;
  for (const line of mappings.split(';')) {
    const segments = [];
    let column = 0;
    for (const raw of line.split(',')) {
      if (!raw) continue;
      const fields = decodeVlq(raw);
      column += fields[0];
      if (fields.length >= 4) {
        sourceIndex += fields[1];
        segments.push([column, sourceIndex]);
      }
    }
    lines.push(segments);
  }
  return lines;
}

/** The original source for a generated (line, column), or null. */
function sourceAt(map, lines, line, column) {
  const segments = lines[line];
  if (!segments || segments.length === 0) return null;
  let found = null;
  for (const [col, src] of segments) {
    if (col > column) break;
    found = src;
  }
  if (found === null) return null;
  return map.sources[found] ?? null;
}

function lineAndColumn(text, index) {
  let line = 0;
  let last = -1;
  for (let i = text.indexOf('\n'); i !== -1 && i < index; i = text.indexOf('\n', i + 1)) {
    line += 1;
    last = i;
  }
  return { line, column: index - last - 1 };
}

const failures = [];
let checked = 0;
let vendorHits = 0;

for (const file of readdirSync(ASSETS).filter((f) => f.endsWith('.js')).sort()) {
  const code = readFileSync(path.join(ASSETS, file), 'utf8');
  const hits = [...code.matchAll(CALL)];
  checked += 1;
  if (hits.length === 0) continue;

  const mapPath = path.join(ASSETS, `${file}.map`);
  if (!existsSync(mapPath)) {
    if (!file.startsWith('vendor-')) {
      failures.push({ file, source: '(no sourcemap)', call: hits[0][0] });
    } else {
      vendorHits += hits.length;
    }
    continue;
  }

  const map = JSON.parse(readFileSync(mapPath, 'utf8'));
  const lines = parseMappings(map.mappings ?? '');
  for (const hit of hits) {
    const { line, column } = lineAndColumn(code, hit.index);
    const source = sourceAt(map, lines, line, column);
    if (source && !source.includes('node_modules')) {
      failures.push({ file, source: source.replace(/^(\.\.\/)+/, ''), call: `console.${hit[1]}(` });
    } else {
      vendorHits += 1;
    }
  }
}

if (failures.length > 0) {
  console.error(`X ${failures.length} console call(s) from app code survived the production build:\n`);
  for (const f of failures.slice(0, 40)) {
    console.error(`  ${f.file}  ${f.call}  from ${f.source}`);
  }
  if (failures.length > 40) console.error(`  ... and ${failures.length - 40} more`);
  console.error(
    '\nvite.config.ts must set `esbuild: { drop: ["console", "debugger"] }` at the TOP level for production.' +
      '\nUnder `build` it is not a Vite option and is ignored.',
  );
  process.exit(1);
}

console.log(
  `OK ${checked} chunk(s) in ${path.relative(process.cwd(), ASSETS).startsWith('..') ? ASSETS : path.relative(process.cwd(), ASSETS)}, no console call from app code` +
    (vendorHits > 0 ? ` (${vendorHits} in dependencies, not ours to strip).` : '.'),
);

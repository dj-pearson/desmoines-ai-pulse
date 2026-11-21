/**
 * Per-route JS and preload over-fetch, measured from Rollup's own module graph
 * (WEB-PERF-065).
 *
 *   node scripts/measure-route-preload.mjs [--min-chunk N] [--out file.json]
 *
 * Builds the app once into a temp directory (dist/ is not touched) and, for
 * every lazy route App.tsx imports, reports:
 *
 *   kb      gzipped JS the route fetches beyond the critical path: its own
 *           chunk plus every chunk it statically imports, transitively
 *   files   how many chunk files that is (requests on navigation)
 *   wasteKb the part of that which is modules the route never reaches
 *           statically. These ride along because Rollup put them in a chunk
 *           together with something the route does need (experimentalMinChunkSize
 *           merges small chunks into their importers, and a shared chunk holds
 *           whatever its importers have in common).
 *
 * wasteKb is an estimate: each chunk's gzipped size is split across its modules
 * by their rendered (pre-minify) length. kb is exact.
 *
 * Why not read dist/: a chunk's preload list says WHICH chunks a route
 * fetches, not which modules inside them it uses. Only the module graph knows
 * that, and it exists only during the build, so this hooks generateBundle.
 *
 * --min-chunk overrides output.experimentalMinChunkSize (0 disables the merge),
 * so candidate values can be compared without editing vite.config.ts. A single
 * route's number moves on ANY config change because module-to-chunk assignment
 * reshuffles; compare sums, and compare the routes you care about.
 *
 * Needs VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_SITE_URL in the
 * environment; placeholders are fine.
 */
import { build } from 'vite';
import { gzipSync } from 'node:zlib';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'src', 'App.tsx');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const minChunkArg = arg('--min-chunk');
const outFile = arg('--out');

/** Static-import closure of one module: what it needs before it can run. */
function staticClosure(getModuleInfo, start) {
  const seen = new Set();
  const stack = [start];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    const info = getModuleInfo(id);
    if (info) stack.push(...info.importedIds);
  }
  return seen;
}

/** A chunk plus every chunk it statically imports, transitively. */
function chunkClosure(chunksByFile, start) {
  const seen = new Set();
  const stack = [start];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    stack.push(...(chunksByFile.get(file)?.imports ?? []));
  }
  return seen;
}

export function analyse(bundle, getModuleInfo) {
  const chunks = Object.values(bundle).filter((o) => o.type === 'chunk');
  const chunksByFile = new Map(chunks.map((c) => [c.fileName, c]));
  const chunkOfModule = new Map();
  for (const c of chunks) for (const id of Object.keys(c.modules)) chunkOfModule.set(id, c.fileName);

  const gz = new Map(chunks.map((c) => [c.fileName, gzipSync(c.code, { level: 9 }).length / 1024]));

  const entry = chunks.find((c) => c.isEntry);
  const critical = chunkClosure(chunksByFile, entry.fileName);
  const criticalKb = [...critical].reduce((s, f) => s + gz.get(f), 0);

  const routeIds = getModuleInfo(APP)?.dynamicallyImportedIds ?? [];
  const routes = [];
  for (const id of routeIds) {
    const own = chunkOfModule.get(id);
    if (!own) continue;
    const needed = staticClosure(getModuleInfo, id);
    let kb = 0;
    let wasteKb = 0;
    let files = 0;
    const wasted = [];
    for (const file of chunkClosure(chunksByFile, own)) {
      if (critical.has(file)) continue;
      const c = chunksByFile.get(file);
      kb += gz.get(file);
      files += 1;
      const total = Object.values(c.modules).reduce((s, m) => s + m.renderedLength, 0) || 1;
      for (const [mid, m] of Object.entries(c.modules)) {
        if (needed.has(mid) || m.renderedLength === 0) continue;
        const k = (gz.get(file) * m.renderedLength) / total;
        wasteKb += k;
        wasted.push({ module: relative(ROOT, mid.replace(/\?.*$/, '')), kb: +k.toFixed(2) });
      }
    }
    wasted.sort((a, b) => b.kb - a.kb);
    routes.push({
      route: relative(ROOT, id),
      kb: +kb.toFixed(1),
      files,
      wasteKb: +wasteKb.toFixed(1),
      wasted: wasted.slice(0, 8),
    });
  }
  routes.sort((a, b) => a.route.localeCompare(b.route));
  const sum = (k) => +routes.reduce((s, r) => s + r[k], 0).toFixed(1);
  return {
    chunks: chunks.length,
    criticalKb: +criticalKb.toFixed(1),
    routes: routes.length,
    sumKb: sum('kb'),
    sumWasteKb: sum('wasteKb'),
    sumFiles: sum('files'),
    perRoute: routes,
  };
}

async function main() {
  const outDir = mkdtempSync(join(tmpdir(), 'route-preload-'));
  let result;
  const capture = {
    name: 'measure-route-preload',
    apply: 'build',
    // Last, so chunk code already carries Vite's rewritten __vite__mapDeps
    // preload arrays: they are real bytes, and the entry's grow with the
    // number of chunk files.
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_opts, bundle) {
        result = analyse(bundle, (id) => this.getModuleInfo(id));
      },
    },
  };
  const output = minChunkArg === undefined ? {} : { experimentalMinChunkSize: Number(minChunkArg) };
  try {
    await build({
      root: ROOT,
      logLevel: 'warn',
      plugins: [capture],
      build: { outDir, emptyOutDir: true, rollupOptions: { output } },
    });
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
  result.minChunkSize = minChunkArg === undefined ? 'vite.config.ts' : Number(minChunkArg);
  if (outFile) writeFileSync(outFile, JSON.stringify(result, null, 2) + '\n');
  const { perRoute, ...summary } = result;
  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

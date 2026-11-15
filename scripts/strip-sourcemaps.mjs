/**
 * WEB-CI-006: strip source maps from the published bundle.
 *
 * vite.config.ts builds "hidden" source maps in production (no sourceMappingURL
 * comment, but the .map files are still emitted to dist/). Serving those maps
 * publicly exposes readable source. This step takes every *.map out of dist
 * after the build so Cloudflare Pages never publishes them. If you later want
 * maps in an error-tracking service, upload them from .sourcemaps/.
 *
 * The maps are MOVED to .sourcemaps/<same path> (gitignored, outside the
 * publish directory), not deleted (WEB-CI-039). check-dist-console needs them
 * to tell a console call in our code from one in a dependency bundled into the
 * same chunk: pdf-generator-*.js holds both src/lib/pdf-generator.ts and jsPDF,
 * whose one console.error is not ours. With the maps deleted the check could
 * not run after `npm run build` at all. Chunk names carry a content hash, so a
 * map left by an earlier build can only match a byte-identical chunk; the
 * directory is still emptied first so it never grows across builds.
 *
 * Runs in the `build` script between `vite build` and `prerender`.
 */
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const DIST = 'dist';
// Read by scripts/check-dist-console.mjs; keep the two in step.
const SOURCEMAP_DIR = '.sourcemaps';

async function walk(dir) {
  let moved = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0; // dist missing (e.g. build skipped) - nothing to strip
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      moved += await walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.map')) {
      const target = join(SOURCEMAP_DIR, full);
      await mkdir(dirname(target), { recursive: true });
      await rename(full, target);
      moved += 1;
    }
  }
  return moved;
}

const exists = await stat(DIST).then(() => true).catch(() => false);
if (!exists) {
  console.log('[strip-sourcemaps] no dist/ directory - skipping');
} else {
  await rm(join(SOURCEMAP_DIR, DIST), { recursive: true, force: true });
  const moved = await walk(DIST);
  console.log(`[strip-sourcemaps] moved ${moved} .map file(s) from ${DIST}/ to ${SOURCEMAP_DIR}/${DIST}/`);
}

/**
 * WEB-CI-006: strip source maps from the published bundle.
 *
 * vite.config.ts builds "hidden" source maps in production (no sourceMappingURL
 * comment, but the .map files are still emitted to dist/). Serving those maps
 * publicly exposes readable source. This step removes every *.map from dist
 * after the build so Cloudflare Pages never publishes them. If you later want
 * maps in an error-tracking service, upload them BEFORE this step runs.
 *
 * Runs in the `build` script between `vite build` and `prerender`.
 */
import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = 'dist';

async function walk(dir) {
  let removed = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0; // dist missing (e.g. build skipped) — nothing to strip
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      removed += await walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.map')) {
      await rm(full, { force: true });
      removed += 1;
    }
  }
  return removed;
}

const exists = await stat(DIST).then(() => true).catch(() => false);
if (!exists) {
  console.log('[strip-sourcemaps] no dist/ directory — skipping');
} else {
  const removed = await walk(DIST);
  console.log(`[strip-sourcemaps] removed ${removed} .map file(s) from ${DIST}/`);
}

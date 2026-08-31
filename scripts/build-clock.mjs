#!/usr/bin/env node
/**
 * Stamps the wall-clock start of a build into .build-start (SEO-027 AC2).
 *
 * WHY. The entity prerender budget was a fixed 420 seconds, and the number it
 * was really trying to express is "however long is left before the host kills
 * this build". Those are different, and the difference is unsafe in both
 * directions:
 *
 *   - on a fast build, 420s leaves minutes of the 20-minute Cloudflare Pages
 *     window unspent while 860 sitemapped URLs ship an SPA shell;
 *   - on a slow one - a cold npm install, a busy runner - 420s of entities on
 *     top of an already-late build is what pushes it past 20 minutes, and a
 *     build that overruns does not deploy at all.
 *
 * A fixed budget cannot tell those apart because it never knows what time it is.
 * This file is how prerender.mjs finds out: it is written by the first step of
 * `npm run build`, so the entity pass can subtract the time install, sitemap
 * generation, vite and the hub pass actually took rather than the time they were
 * assumed to take.
 *
 * Deliberately not in git (.gitignore) and deliberately not fatal: prerender.mjs
 * treats a missing or stale stamp as "no clock" and falls back to the fixed
 * budget, so `npm run prerender` on its own behaves exactly as it did before.
 */
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stamp = Date.now();
writeFileSync(join(ROOT, '.build-start'), `${stamp}\n`);
console.log(`[build-clock] build started at ${new Date(stamp).toISOString()}`);

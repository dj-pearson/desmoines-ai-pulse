#!/usr/bin/env node
/**
 * LATEST_APP_VERSION.ios matches the iOS project's MARKETING_VERSION.
 *
 * version-check tells a client an update is available when it is below
 * LATEST_APP_VERSION. The constant is hand-maintained with no release hook
 * (CLAUDE.md, Backward Compatibility), so it drifts silently: too low and
 * nobody is told about a release, too high and every current install sees a
 * banner for a version that does not exist. ios/project.yml is the version the
 * next iOS build ships, so the two must move together.
 *
 * Android is not checked here: build.gradle.kts holds a placeholder that
 * android-release.yml patches from its inputs at release time.
 *
 * Also: MIN_SUPPORTED_APP_VERSION must not exceed LATEST_APP_VERSION on either
 * platform, or version-check would force-upgrade everyone to a build that is
 * not in the store.
 *
 *   node scripts/check-app-versions.mjs
 */
import { readFileSync } from 'node:fs';

const src = readFileSync('supabase/functions/_shared/minSupportedVersions.ts', 'utf8');
function block(name) {
  const m = src.match(new RegExp(`export const ${name}[^=]*=\\s*\\{([\\s\\S]*?)\\}`));
  if (!m) throw new Error(`${name} not found in minSupportedVersions.ts`);
  const get = (p) => (m[1].match(new RegExp(`${p}:\\s*"([^"]+)"`)) || [])[1];
  return { ios: get('ios'), android: get('android') };
}
const cmp = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
};

const latest = block('LATEST_APP_VERSION');
const min = block('MIN_SUPPORTED_APP_VERSION');
const marketing = (readFileSync('ios/project.yml', 'utf8').match(/MARKETING_VERSION:\s*"?([\d.]+)"?/) || [])[1];

let failed = false;
if (!latest.ios || !marketing) {
  console.error('[app-versions] could not read LATEST_APP_VERSION.ios or MARKETING_VERSION - refusing to pass.');
  process.exit(1);
}
if (latest.ios !== marketing) {
  console.error(
    `X LATEST_APP_VERSION.ios is ${latest.ios} but ios/project.yml MARKETING_VERSION is ${marketing}.\n` +
      '  Bump them together (supabase/functions/_shared/minSupportedVersions.ts).',
  );
  failed = true;
}
for (const p of ['ios', 'android']) {
  if (min[p] && latest[p] && cmp(min[p], latest[p]) > 0) {
    console.error(`X MIN_SUPPORTED_APP_VERSION.${p} (${min[p]}) is above LATEST_APP_VERSION.${p} (${latest[p]}).`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log(`OK LATEST_APP_VERSION.ios ${latest.ios} matches MARKETING_VERSION; minimums are at or below latest.`);

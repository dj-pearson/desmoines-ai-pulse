/**
 * The apple-app-site-association file against the iOS project (IOS-AUDIT-REL-007).
 *
 * Universal Links, Sign in with Apple webcredentials and App Clip invocation all
 * fail SILENTLY when this file disagrees with the app: there is no build error,
 * no runtime error and no test - the link just opens Safari instead of the app,
 * and you find out during review. Nothing in this repo compared the two, so the
 * file shipped with no `appclips` section at all while DesMoinesInsiderClip
 * declared `appclip:desmoinesinsider.com` and its App handled invocation URLs
 * (DesMoinesInsiderClipApp.swift:14).
 *
 * OFFLINE and deterministic - it reads the committed AASA, ios/project.yml and
 * the two entitlements files. No network, so it cannot tell you whether the file
 * is actually reachable or what Content-Type it is served with; the header rule
 * for that lives in public/_headers.
 *
 * THE TEAM ID IS DELIBERATELY NOT GATED. Every appID here carries the literal
 * placeholder TEAM_ID_HERE because ios/project.yml has DEVELOPMENT_TEAM: "" at
 * both :35 and :84 - the real value does not exist anywhere in the repo, and
 * substituting it is IOS-AUDIT-REL-006's job. Failing on it would make this
 * check permanently red, which is the failure mode WEB-CI-027 collects. It is
 * reported on every run instead, so it stays visible without crying wolf.
 *
 *   node scripts/check-aasa.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AASA = join(ROOT, 'public', '.well-known', 'apple-app-site-association');
const PROJECT = join(ROOT, 'ios', 'project.yml');
const APP_ENT = join(ROOT, 'ios', 'DesMoinesInsider', 'App', 'DesMoinesInsider.entitlements');
const CLIP_ENT = join(ROOT, 'ios', 'DesMoinesInsiderClip', 'DesMoinesInsiderClip.entitlements');

const problems = [];
const notes = [];

if (!existsSync(AASA)) {
  console.error('[aasa] public/.well-known/apple-app-site-association is missing.');
  process.exit(1);
}

let aasa;
try {
  aasa = JSON.parse(readFileSync(AASA, 'utf8'));
} catch (error) {
  console.error(`[aasa] not valid JSON: ${error.message}`);
  process.exit(1);
}

// Bundle ids come from project.yml rather than the entitlements, because the
// entitlements name domains and the project names apps.
const project = existsSync(PROJECT) ? readFileSync(PROJECT, 'utf8') : '';
const bundleIds = [...project.matchAll(/PRODUCT_BUNDLE_IDENTIFIER:\s*([A-Za-z0-9._-]+)/g)].map((m) => m[1]);
const appId = bundleIds.find((b) => /\.aipulse$/.test(b));
const clipId = bundleIds.find((b) => /\.Clip$/i.test(b));

if (!appId) problems.push('could not find the app PRODUCT_BUNDLE_IDENTIFIER in ios/project.yml');
if (!clipId) notes.push('no App Clip bundle id in ios/project.yml - skipping the appclips checks');

const idsIn = (v) => (Array.isArray(v) ? v : []).filter((x) => typeof x === 'string');
// applinks.details is an array of OBJECTS ({appID, paths}), unlike the other
// two sections which are arrays of strings - so it needs its own extraction.
const applinkIds = (Array.isArray(aasa.applinks?.details) ? aasa.applinks.details : [])
  .map((d) => d?.appID)
  .filter((x) => typeof x === 'string');
const webcredIds = idsIn(aasa.webcredentials?.apps);
const appclipIds = idsIn(aasa.appclips?.apps);

const bundleOf = (appID) => String(appID).split('.').slice(1).join('.');
const teamOf = (appID) => String(appID).split('.')[0];

if (applinkIds.length === 0) problems.push('applinks.details lists no appID');
if (webcredIds.length === 0) problems.push('webcredentials.apps is empty - Sign in with Apple password autofill will not work');

if (clipId && appclipIds.length === 0) {
  problems.push(
    'no appclips section, but an App Clip target exists and declares appclip:<domain>. ' +
      'A Clip can only be invoked from a URL, so without this it cannot be invoked at all',
  );
}

for (const [section, ids] of [['applinks', applinkIds], ['webcredentials', webcredIds]]) {
  for (const id of ids) {
    if (appId && bundleOf(id) !== appId) {
      problems.push(`${section} appID "${id}" does not match PRODUCT_BUNDLE_IDENTIFIER "${appId}"`);
    }
  }
}
for (const id of appclipIds) {
  if (clipId && bundleOf(id) !== clipId) {
    problems.push(`appclips appID "${id}" does not match the Clip bundle id "${clipId}"`);
  }
}

const teams = new Set([...applinkIds, ...webcredIds, ...appclipIds].map(teamOf));
if (teams.size > 1) problems.push(`mixed team id prefixes in one file: ${[...teams].join(', ')}`);

// The entitlement domains have to name the host that serves this file, or the
// device never fetches it. Compared as a set, since the prefixes differ per use.
const domainsIn = (file) =>
  existsSync(file)
    ? [...readFileSync(file, 'utf8').matchAll(/<string>(?:applinks|webcredentials|appclip):([^<\s]+)<\/string>/g)].map((m) => m[1])
    : [];
const entDomains = new Set([...domainsIn(APP_ENT), ...domainsIn(CLIP_ENT)]);
if (entDomains.size > 1) {
  problems.push(`entitlements name more than one domain (${[...entDomains].join(', ')}); one AASA cannot serve them all`);
}

const placeholder = [...teams].filter((t) => !/^[A-Z0-9]{10}$/.test(t));
if (placeholder.length > 0) {
  notes.push(
    `team id prefix is still ${placeholder.join(', ')} - Apple cannot resolve it, so universal links do ` +
      'not work yet. ios/project.yml has DEVELOPMENT_TEAM: "" so the real value is not in the repo (IOS-AUDIT-REL-006).',
  );
}

console.log(
  `[aasa] app "${appId ?? '?'}", clip "${clipId ?? 'none'}", domain(s) ${[...entDomains].join(', ') || '?'}; ` +
    `${applinkIds.length} applinks, ${webcredIds.length} webcredentials, ${appclipIds.length} appclips.`,
);
for (const n of notes) console.log(`  note: ${n}`);

if (problems.length > 0) {
  console.error('\nX apple-app-site-association does not match the iOS project:');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\n  These fail silently on device - the link opens Safari instead of the app.');
  process.exit(1);
}

console.log('\nOK AASA agrees with the iOS project.');
process.exit(0);

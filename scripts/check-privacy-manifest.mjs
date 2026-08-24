#!/usr/bin/env node
/**
 * Required-reason API reconciliation for the iOS privacy manifests
 * (IOS-AUDIT-REL-014).
 *
 * WHY. PrivacyInfo.xcprivacy declares which required-reason APIs the binary
 * uses. Nobody had checked those declarations against the code, and both
 * directions are defects: UNDER-declaring is what gets a submission rejected,
 * and OVER-declaring puts a false statement in a document that exists to be
 * true. The first audit found one of each - FileTimestamp declared with the
 * "display to the person using the device" reason when the only use is cache
 * expiry, and DiskSpace declared with no disk-space API anywhere in the app or
 * its one dependency.
 *
 * WHY A STATIC CHECK RATHER THAN THE APP STORE LINTER. Apple's privacy report is
 * generated from an ARCHIVE, so it needs a signed macOS build. This paragraph
 * used to say the project "does not have that configured (IOS-AUDIT-REL-006,
 * DEVELOPMENT_TEAM empty)", and that is no longer true - corrected 2026-08-24.
 * DEVELOPMENT_TEAM is empty in ios/project.yml ON PURPOSE: XcodeGen generates the
 * project and ios-native-release.yml:304 reads the team out of the provisioning
 * profile, then seds it into every build config at :382. That workflow builds an
 * .xcarchive at :449-452 and has succeeded five times, most recently 2026-07-18.
 *   So the prerequisite this paragraph claimed was missing exists. What is still
 * open is narrower: Apple documents the privacy report as an Xcode Organizer
 * action, so whether it can be produced non-interactively in that lane is the
 * actual question, and aggregating the .xcprivacy files out of the archive is the
 * fallback that at least verifies what shipped.
 *   This static check stays regardless. It runs on every push rather than only on
 * a release, which is where the drift it catches is introduced.
 *
 * WHAT IT CANNOT SEE. A dependency's usage. Third-party SDKs are supposed to
 * ship their own manifest; supabase-swift, the only one here, does NOT - checked
 * against its repository tree - so its usage is this app's responsibility. It
 * was audited by hand on 2026-08-23 and touches none of the five categories: its
 * single attributesOfItem call reads `.size`, which is not a timestamp API. If a
 * dependency is added or upgraded, that audit has to be redone; this script will
 * not do it for you.
 *
 * Usage:
 *   node scripts/check-privacy-manifest.mjs
 * Exit: 0 reconciled, 1 a declaration and the code disagree.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The five required-reason API categories, and what using one looks like in
 * Swift. Patterns are deliberately broad: a false positive costs a one-line
 * declaration, a false negative costs a rejected submission.
 */
const CATEGORIES = [
  {
    name: 'NSPrivacyAccessedAPICategoryUserDefaults',
    short: 'UserDefaults',
    pattern: /\bUserDefaults\b|@AppStorage\b/,
  },
  {
    name: 'NSPrivacyAccessedAPICategoryFileTimestamp',
    short: 'FileTimestamp',
    // NB: `.size` / `.fileSizeKey` are NOT timestamp APIs and must not match.
    pattern:
      /\.modificationDate\b|\.creationDate\b|contentModificationDateKey|creationDateKey|NSFileModificationDate|NSFileCreationDate|\bfstat\b|\bgetattrlist\b/,
  },
  {
    name: 'NSPrivacyAccessedAPICategoryDiskSpace',
    short: 'DiskSpace',
    pattern:
      /volumeAvailableCapacity|NSFileSystemFreeSize|attributesOfFileSystem|\bstatfs\b|volumeTotalCapacity/,
  },
  {
    name: 'NSPrivacyAccessedAPICategorySystemBootTime',
    short: 'SystemBootTime',
    pattern: /systemUptime|mach_absolute_time|kern\.boottime|CLOCK_MONOTONIC/,
  },
  {
    name: 'NSPrivacyAccessedAPICategoryActiveKeyboards',
    short: 'ActiveKeyboards',
    pattern: /activeInputModes/,
  },
];

/** Each shipped binary and the manifest that describes it. */
const TARGETS = [
  {
    label: 'DesMoinesInsider',
    sources: 'ios/DesMoinesInsider',
    manifest: 'ios/DesMoinesInsider/Resources/PrivacyInfo.xcprivacy',
  },
  {
    label: 'DesMoinesInsiderClip',
    sources: 'ios/DesMoinesInsiderClip',
    manifest: 'ios/DesMoinesInsiderClip/PrivacyInfo.xcprivacy',
  },
];

function swiftFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...swiftFiles(path));
    } else if (entry.endsWith('.swift')) {
      out.push(path);
    }
  }
  return out;
}

/** Categories declared in a manifest, read as text rather than parsed as a plist. */
function declaredCategories(manifestPath) {
  const xml = readFileSync(manifestPath, 'utf8');
  // Only inside NSPrivacyAccessedAPITypes, so a category named in a comment
  // elsewhere is not counted as a declaration.
  const start = xml.indexOf('<key>NSPrivacyAccessedAPITypes</key>');
  if (start === -1) return new Set();
  const section = xml.slice(start);
  const declared = new Set();
  for (const category of CATEGORIES) {
    // <string>Category</string>, not the commented mention above it.
    if (new RegExp(`<string>\\s*${category.name}\\s*</string>`).test(section)) {
      declared.add(category.name);
    }
  }
  return declared;
}

let failed = 0;

for (const target of TARGETS) {
  const sourceDir = join(ROOT, target.sources);
  const manifestPath = join(ROOT, target.manifest);

  if (!existsSync(sourceDir) || !existsSync(manifestPath)) {
    console.error(`[privacy-manifest] ${target.label}: sources or manifest missing.`);
    process.exit(1);
  }

  const files = swiftFiles(sourceDir);
  if (files.length === 0) {
    // No Swift is a broken glob, not a clean target.
    console.error(`[privacy-manifest] ${target.label}: no Swift files found.`);
    process.exit(1);
  }

  const used = new Map();
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const category of CATEGORIES) {
      if (!category.pattern.test(src)) continue;
      if (!used.has(category.name)) used.set(category.name, []);
      used.get(category.name).push(file.slice(ROOT.length + 1).replace(/\\/g, '/'));
    }
  }

  const declared = declaredCategories(manifestPath);

  console.log(`\n${target.label} (${files.length} Swift files, ${target.manifest})`);
  for (const category of CATEGORIES) {
    const isUsed = used.has(category.name);
    const isDeclared = declared.has(category.name);
    const mark = isUsed === isDeclared ? 'ok     ' : 'MISMATCH';
    const where = isUsed ? `${used.get(category.name).length} file(s)` : 'unused';
    console.log(`  ${mark} ${category.short.padEnd(16)} used=${String(isUsed).padEnd(5)} declared=${isDeclared}  ${where}`);

    if (isUsed && !isDeclared) {
      console.error(
        `\n  X UNDER-DECLARED: ${category.short} is used but not declared in ${target.manifest}.\n` +
          `    This is the direction that gets a submission rejected. First use:\n` +
          `      ${used.get(category.name).slice(0, 3).join('\n      ')}\n`
      );
      failed++;
    }
    if (!isUsed && isDeclared) {
      console.error(
        `\n  X OVER-DECLARED: ${category.short} is declared in ${target.manifest} and used nowhere.\n` +
          `    A manifest exists to be true. Remove the entry, or add the usage.\n`
      );
      failed++;
    }
  }
}

/*
 * COLLECTED-DATA PURPOSES (IOS-AUDIT-FEAT-030).
 *
 * Everything above reconciles NSPrivacyAccessedAPITypes. The OTHER section of the
 * same file - NSPrivacyCollectedDataTypes, which says what is collected and WHY -
 * was checked by nobody, and it carries the same two failure directions.
 *
 * The live case: ProductInteraction declares an Analytics purpose while
 * AnalyticsService emits nothing at all, because every vendor call in it is
 * commented out. A purpose that became false when a feature was deferred looks
 * exactly like one that was always true, which is why this needs a machine to
 * notice. Its AppFunctionality half is honest and stays - Supabase really does
 * receive interactions - so this checks the PURPOSE, not the data type.
 *
 * Both directions fail: declaring Analytics while emitting none is the false
 * statement this file's header argues against, and emitting analytics without
 * declaring it is the direction that gets a submission rejected.
 *
 * WHAT COUNTS AS EMITTING: a call into a third-party analytics SDK, not this
 * app's own AnalyticsService wrapper. The wrapper IS the stub, so matching it
 * would leave the check permanently satisfied by the very thing it exists to
 * catch.
 *
 * COMMENT HANDLING is deliberately conservative - only whole-line `//` comments
 * and block comments are stripped, never a trailing `//` mid-line, because that
 * would truncate any line containing a URL. Commented-out code, which is the
 * actual case here, is always whole-line, so nothing is missed by being careful.
 */
const ANALYTICS_SDKS = [
  {
    name: 'Firebase Analytics',
    pattern: /\bAnalytics\s*\.\s*(?:logEvent|setUserProperty|setUserID)\b|import\s+FirebaseAnalytics\b/,
  },
  { name: 'Mixpanel', pattern: /\bMixpanel\s*\.|import\s+Mixpanel\b/ },
  { name: 'Amplitude', pattern: /\bAmplitude\s*\.|import\s+Amplitude\b/ },
  { name: 'PostHog', pattern: /\bPostHog\s*\.|import\s+PostHog\b/ },
  { name: 'TelemetryDeck', pattern: /\bTelemetryDeck\s*\.|import\s+TelemetryDeck\b/ },
  { name: 'Segment', pattern: /import\s+Segment\b/ },
];

const BACKSLASH = String.fromCharCode(92);

/*
 * ONE ACKNOWLEDGED MISMATCH, and it is deliberately not a JSON baseline file.
 *
 * DesMoinesInsider declares an Analytics purpose on ProductInteraction while no
 * analytics is emitted. That is a REAL over-declaration, it is IOS-AUDIT-FEAT-030,
 * and it is not fixed here because fixing it is a vendor decision: AC1 and AC2 of
 * that story may ship analytics, in which case the purpose is correct and removing
 * it now would mean removing and re-adding a declaration across two App Store
 * submissions.
 *
 * Gating on it would make ios-ci.yml red on every push forever, which is how a
 * check stops being read (WEB-CI-027). It is printed on every run instead, so it
 * stays visible without crying wolf - the same call made for the AASA team id in
 * scripts/check-aasa.mjs.
 *
 * A list rather than a file on purpose: there is one entry, and a JSON baseline
 * invites appending to it to make CI pass. Adding a line here requires saying why.
 */
const ACKNOWLEDGED_ANALYTICS_OVERDECLARATION = new Set(['DesMoinesInsider:ProductInteraction']);
const ANALYTICS_PURPOSE = 'NSPrivacyCollectedDataTypePurposeAnalytics';

/** Strip block comments and whole-line `//` comments only. See the note above. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
}

/** Collected data types that carry the Analytics purpose. */
function typesWithAnalyticsPurpose(manifestPath) {
  const xml = readFileSync(manifestPath, 'utf8');
  const start = xml.indexOf('<key>NSPrivacyCollectedDataTypes</key>');
  if (start === -1) return [];
  const out = [];
  // Each <dict> inside the array is one collected type plus its purposes.
  for (const block of xml.slice(start).split('<dict>').slice(1)) {
    const body = block.split('</dict>')[0];
    if (!body.includes(ANALYTICS_PURPOSE)) continue;
    const type = /<key>NSPrivacyCollectedDataType<\/key>\s*<string>\s*([A-Za-z]+)\s*<\/string>/.exec(body);
    out.push(type ? type[1].replace(/^NSPrivacyCollectedDataType/, '') : '(unnamed)');
  }
  return out;
}

console.log('\nCollected-data purposes');
for (const target of TARGETS) {
  const manifestPath = join(ROOT, target.manifest);
  const emitters = [];
  for (const file of swiftFiles(join(ROOT, target.sources))) {
    const src = stripComments(readFileSync(file, 'utf8'));
    for (const sdk of ANALYTICS_SDKS) {
      if (sdk.pattern.test(src)) {
        const rel = file.slice(ROOT.length + 1).split(BACKSLASH).join('/');
        emitters.push(`${sdk.name} in ${rel}`);
      }
    }
  }

  const declaredFor = typesWithAnalyticsPurpose(manifestPath);
  const emits = emitters.length > 0;
  const declares = declaredFor.length > 0;

  console.log(
    `  ${emits === declares ? 'ok      ' : 'MISMATCH'} ${target.label.padEnd(24)} ` +
      `analyticsEmitted=${String(emits).padEnd(5)} analyticsPurposeDeclared=${declares}` +
      `${declares ? ` on ${declaredFor.join(', ')}` : ''}`,
  );

  const unacknowledged = declaredFor.filter(
    (t) => !ACKNOWLEDGED_ANALYTICS_OVERDECLARATION.has(`${target.label}:${t}`),
  );

  if (declares && !emits && unacknowledged.length === 0) {
    console.log(`          known: the Analytics purpose on ${declaredFor.join(', ')} is over-declared`);
    console.log('          and accepted for now - no analytics is emitted. IOS-AUDIT-FEAT-030');
    console.log('          owns the decision to ship analytics or drop the purpose.');
  }

  if (declares && !emits && unacknowledged.length > 0) {
    console.error(
      `\n  X OVER-DECLARED: ${target.manifest} claims an Analytics purpose on ` +
        `${declaredFor.join(', ')},\n    and no analytics SDK is called from ${target.label} - every vendor call in\n` +
        '    AnalyticsService is commented out, so nothing is sent. Either ship analytics or\n' +
        '    drop the Analytics purpose. A manifest exists to be true. See IOS-AUDIT-FEAT-030.\n',
    );
    failed++;
  }
  if (emits && !declares) {
    console.error(
      `\n  X UNDER-DECLARED: ${target.label} calls an analytics SDK but ${target.manifest}\n` +
        '    declares no Analytics purpose on any collected type. This is the direction that\n' +
        `    gets a submission rejected. Found:\n      ${emitters.slice(0, 3).join('\n      ')}\n`,
    );
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} manifest mismatch(es). See IOS-AUDIT-REL-014.`);
  process.exit(1);
}

console.log('\nOK Every declared required-reason API is used, and every used one is declared.');

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

if (failed > 0) {
  console.error(`\n${failed} manifest mismatch(es). See IOS-AUDIT-REL-014.`);
  process.exit(1);
}

console.log('\nOK Every declared required-reason API is used, and every used one is declared.');

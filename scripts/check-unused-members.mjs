#!/usr/bin/env node
/**
 * Finds Swift type members that nothing reads (IOS-AUDIT-UX-060).
 *
 * WHY. Swift emits no warning for an unused internal property, and this codebase
 * has accumulated them in a specific and expensive shape: a service computes
 * exactly the state a screen needs, and no screen reads it. Every instance found
 * so far was a MISSING SURFACE rather than harmless dead code -
 * hasServerRevokedEntitlement (a user silently dropped to Free with no
 * explanation), AskPulse's usage quota (the first a user heard of the limit was
 * hitting it), DiscoverView's toast (a failed save looked identical to a
 * successful one), EventDetailViewModel.event (a background refresh that
 * reached nothing). Each read as finished code in review.
 *
 * WHAT IT SEARCHES. Declarations at type-member indentation in ViewModels,
 * Services and Views, plus SwiftUI `@State` in Views - the toast that nothing
 * assigned was a @State, so restricting this to services would have missed it.
 *
 * HOW IT AVOIDS THE FALSE POSITIVES THE ONE-OFF SWEEP DROWNED IN. The original
 * regex matched every `var` including locals inside function bodies, and 51 of
 * its 55 hits were locals like `waited` and `spki`. This tracks brace depth and
 * skips anything declared inside a `func`, `init` or closure body, and it counts
 * a member as used if its name appears anywhere OUTSIDE its own declaration
 * line - including in its own file, since a private helper read only by its
 * own type is legitimate.
 *
 * IT IS DELIBERATELY NOT CLEVER. A name that appears as a substring of another
 * identifier counts as a use, so this under-reports rather than crying wolf. A
 * check that flags working code gets switched off.
 *
 * Usage:
 *   node scripts/check-unused-members.mjs           # compare against baseline
 *   node scripts/check-unused-members.mjs --write   # re-baseline deliberately
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'ios-unused-members-baseline.json');
/** Where members are DECLARED - the three places this defect keeps appearing. */
const DECLARE_ROOTS = [
  'ios/DesMoinesInsider/ViewModels',
  'ios/DesMoinesInsider/Services',
  'ios/DesMoinesInsider/Views',
];

/**
 * Where a USE can appear, which is everywhere.
 *
 * These must be separate. Searching only the declaring roots reported
 * JailbreakDetector.isJailbroken as unread on the first run - it is read from
 * App/DesMoinesInsiderApp.swift, outside all three. One false positive of that
 * kind is enough for a check to be switched off and never looked at again.
 */
const USE_ROOTS = ['ios/DesMoinesInsider', 'ios/DesMoinesInsiderTests', 'ios/DesMoinesInsiderClip'];

/** Members whose only job is to be called from outside the app's own source. */
const EXEMPT = new Set([
  'body', // SwiftUI
  'id', // Identifiable
  'shared', // singletons
  'previews',
  'defaultValue', // PreferenceKey requirement - SwiftUI reads it, we never do
]);

function swiftFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...swiftFiles(path));
    else if (entry.endsWith('.swift')) out.push(path);
  }
  return out;
}

/**
 * Declarations that are type members rather than locals.
 *
 * A member is a `var`/`let` whose brace depth is inside a type body and NOT
 * inside a function body. Depth is tracked by counting braces, and a `func` /
 * `init` / `subscript` opens a region everything below it belongs to until the
 * depth returns.
 */
function memberDeclarations(source) {
  const members = [];
  let depth = 0;
  let funcDepth = null;

  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const code = line.replace(/\/\/.*$/, '');

    if (funcDepth === null && /^\s*(private |fileprivate |internal |public |static |@\w+\s+)*(func|init|subscript|deinit)\b/.test(code)) {
      funcDepth = depth;
    }

    // A member declaration: at type level, not inside a func.
    if (funcDepth === null && depth > 0) {
      const m = code.match(
        /^\s*(?:@\w+(?:\([^)]*\))?\s+)*(?:private(?:\(set\))?\s+|fileprivate\s+|internal\s+|public\s+|static\s+|nonisolated(?:\(unsafe\))?\s+|weak\s+|lazy\s+|final\s+)*(?:var|let)\s+([A-Za-z_]\w*)\s*[:={]/
      );
      if (m) members.push({ name: m[1], line: i + 1 });
    }

    for (const ch of code) {
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (funcDepth !== null && depth <= funcDepth) funcDepth = null;
      }
    }
  }
  return members;
}

const files = DECLARE_ROOTS.flatMap((r) => (existsSync(join(ROOT, r)) ? swiftFiles(join(ROOT, r)) : []));
const useFiles = USE_ROOTS.flatMap((r) => (existsSync(join(ROOT, r)) ? swiftFiles(join(ROOT, r)) : []));
if (files.length === 0 || useFiles.length === 0) {
  console.error('[unused-members] no Swift files found - refusing to pass.');
  process.exit(1);
}

const sources = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));
const allSource = useFiles.map((f) => readFileSync(f, 'utf8')).join(String.fromCharCode(10));

const BACKSLASH = String.fromCharCode(92);
const slash = (p) => p.split(BACKSLASH).join('/');
const unused = [];
for (const [file, source] of sources) {
  const lines = source.split(/\r?\n/);
  for (const { name, line } of memberDeclarations(source)) {
    if (EXEMPT.has(name)) continue;

    // Count occurrences across every file, then discount the declaration itself.
    const pattern = new RegExp(`\\b${name}\\b`, 'g');
    const total = (allSource.match(pattern) || []).length;
    const onDeclLine = ((lines[line - 1] || '').match(pattern) || []).length;
    if (total - onDeclLine > 0) continue;

    const rel = slash(file.slice(ROOT.length + 1));
    // KEYED BY FILE + MEMBER, NOT BY LINE. The baseline used to hold
    // `file:line name`, so inserting anything above a declaration moved it and
    // the same member was reported as BOTH 'no longer unused' and 'new' - which
    // is what turned iOS CI red on 2026-08-24 after an unrelated AuthView edit
    // shifted roundedInput from :288 to :313. Same defect as the discarded-error
    // baseline fixed in PR #372; the line is display only.
    unused.push({ key: `${rel} ${name}`, display: `${rel}:${line} ${name}` });
  }
}
unused.sort((a, b) => a.key.localeCompare(b.key));

console.log(
  `[unused-members] ${files.length} declaring file(s), ${useFiles.length} searched, ` +
    `${unused.length} member(s) read by nothing.`
);

if (process.argv.includes('--write')) {
  writeFileSync(BASELINE, `${JSON.stringify({ unused: unused.map((u) => u.key) }, null, 2)}\n`);
  console.log(`Wrote ${unused.length} entries to ios-unused-members-baseline.json.`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error('[unused-members] no baseline. Run with --write once, deliberately.');
  process.exit(1);
}

const baseline = new Set(JSON.parse(readFileSync(BASELINE, 'utf8')).unused ?? []);
const fresh = unused.filter((entry) => !baseline.has(entry.key));
const seen = new Set(unused.map((u) => u.key));
const gone = [...baseline].filter((entry) => !seen.has(entry));

if (gone.length > 0) {
  console.log(`\nNo longer unused (${gone.length}):`);
  for (const entry of gone) console.log(`  ${entry}`);
  console.log('  Re-baseline with --write to lock it in.');
}

if (fresh.length > 0) {
  console.error(`\nX ${fresh.length} new member(s) that nothing reads:`);
  for (const entry of fresh) console.error(`  ${entry.display}`);
  console.error(
    '\n  Every one of these found so far was a MISSING SURFACE, not dead code:\n' +
      '  the state a screen needed already existed and no screen read it. Decide\n' +
      '  which this is - wire it up, or delete it - then re-baseline. See\n' +
      '  IOS-AUDIT-UX-060.\n'
  );
  process.exit(1);
}

console.log('\nOK No new unread members.');

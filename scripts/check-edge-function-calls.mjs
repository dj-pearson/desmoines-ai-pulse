#!/usr/bin/env node
/**
 * Every invoked edge function must exist (XPLAT-008).
 *
 * Three admin actions have invoked functions that were never implemented -
 * test-ai-model, test-article-webhook, clear-system-cache - and each is a
 * guaranteed 404 at runtime. Nothing catches this: an invoke() name is a
 * string, so it type-checks, lints, builds and ships. The failure only appears
 * when an admin clicks the button, and it appears as a generic error toast.
 *
 * The same drift in the other direction is XPLAT-001's break: a function that
 * exists but no longer matches what its callers send. This check does not
 * attempt that - it is the cheap half, name existence, run in seconds with no
 * Supabase access.
 *
 * SCOPE: the web client (src/), and both mobile apps, which invoke functions by
 * URL path rather than through supabase-js.
 *
 * REPORTS THE INVERSE TOO, as a warning rather than a failure: functions with no
 * caller on any surface. That is NOT automatically dead code - CLAUDE.md is
 * explicit that a function older shipped binaries call is load-bearing until
 * MIN_SUPPORTED_APP_VERSION excludes them, and verify-apple-receipt is exactly
 * that case. Deleting on this signal alone would break a live client.
 *
 * Usage: node scripts/check-edge-function-calls.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS_DIR = join(ROOT, 'supabase', 'functions');

/** Directories under supabase/functions/ that are not deployable functions. */
const NOT_A_FUNCTION = new Set(['_shared', '_tests', 'node_modules']);

/**
 * Known-missing functions, awaiting the implement-or-remove decision in
 * XPLAT-008 AC1. Every one of these 404s today, so this is a record of a live
 * defect and not an exemption - it exists so the check can be wired into
 * `npm run validate` now and still fail on the NEXT one, rather than sitting
 * unrun until the decision lands.
 *
 * The list only shrinks. An entry whose function now exists is a failure, so a
 * fix cannot leave stale bookkeeping behind.
 */
const KNOWN_MISSING = new Map([
  ['clear-system-cache', 'XPLAT-008: admin "clear cache" button. Never implemented; no cache layer is named anywhere.'],
  ['generate-writeup', 'XPLAT-008: per-item AI writeup from ContentTable. Never implemented; generate-seo-content and bulk-enhance-events are batch jobs with a different contract, so neither is a drop-in.'],
  ['test-ai-model', 'XPLAT-008: admin "test model" button in AIConfigurationManager.'],
  ['test-article-webhook', 'XPLAT-008: admin "send test webhook" button in ArticleWebhookConfig.'],
]);

const deployed = new Set(
  readdirSync(FUNCTIONS_DIR)
    .filter((name) => !NOT_A_FUNCTION.has(name) && !name.startsWith('.'))
    .filter((name) => statSync(join(FUNCTIONS_DIR, name)).isDirectory()),
);

/**
 * Each surface names functions differently, so the patterns are per-surface
 * rather than one union applied everywhere - `functions("name")` is how the
 * Kotlin SDK is called, and matching that shape against TypeScript would pick
 * up any local helper called `functions`.
 *
 * supabase-js and supabase-swift both use functions.invoke("name"); Swift puts
 * the name on the following line, which `\s*` covers.
 *
 * A direct fetch to `${SUPABASE_URL}/functions/v1/<name>` is also a real call
 * shape here - gsc-fetch-properties, gsc-oauth, extract-catchdesmoines-urls,
 * og-image and log-error are all invoked that way - so the path form is matched
 * on every surface. It takes the FIRST path segment only, which is what makes
 * `og-image/${type}/${id}` and `agent-runner/<agent_key>` resolve correctly.
 * It also matches the path when it appears in a comment, which can mark a
 * function as called when it is not. That only softens the uncalled-function
 * warning; it cannot produce a false failure, since a name that resolves to a
 * real directory is never reported.
 */
const SCAN = [
  {
    root: join(ROOT, 'src'),
    exts: ['.ts', '.tsx'],
    patterns: [
      /functions\s*\.\s*invoke\s*\(\s*["'`]([A-Za-z0-9_-]+)["'`]/g,
      // A direct fetch to `${SUPABASE_URL}/functions/v1/<name>`; first segment only.
      /functions\/v1\/([A-Za-z0-9_-]+)/g,
    ],
  },
  {
    root: join(ROOT, 'ios'),
    exts: ['.swift'],
    patterns: [
      /functions\s*\.\s*invoke\s*\(\s*["'`]([A-Za-z0-9_-]+)["'`]/g,
      // A direct fetch to `${SUPABASE_URL}/functions/v1/<name>`; first segment only.
      /functions\/v1\/([A-Za-z0-9_-]+)/g,
    ],
  },
  {
    root: join(ROOT, 'android'),
    exts: ['.kt', '.java'],
    patterns: [
      /functions\s*\.\s*invoke\s*\(\s*["'`]([A-Za-z0-9_-]+)["'`]/g,
      // supabase-kt: client.functions("name", body = ...)
      /\bfunctions\s*\(\s*["'`]([A-Za-z0-9_-]+)["'`]/g,
      // A direct fetch to `${SUPABASE_URL}/functions/v1/<name>`; first segment only.
      /functions\/v1\/([A-Za-z0-9_-]+)/g,
    ],
  },
];

function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

const called = new Map(); // name -> Set of "file:line"

for (const { root, exts, patterns } of SCAN) {
  for (const file of walk(root, exts)) {
    const text = readFileSync(file, 'utf8');
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(text)) !== null) {
        const name = m[1];
        const line = text.slice(0, m.index).split('\n').length;
        if (!called.has(name)) called.set(name, new Set());
        called.get(name).add(`${relative(ROOT, file)}:${line}`);
      }
    }
  }
}

const allMissing = [...called.entries()].filter(([name]) => !deployed.has(name));
const missing = allMissing.filter(([name]) => !KNOWN_MISSING.has(name));
const known = allMissing.filter(([name]) => KNOWN_MISSING.has(name));
const staleAllowlist = [...KNOWN_MISSING.keys()].filter((name) => deployed.has(name) || !called.has(name));
const uncalled = [...deployed].filter((name) => !called.has(name)).sort();

console.log(
  `[edge-calls] ${called.size} distinct function name(s) invoked across src/, ios/ and android/; ` +
    `${deployed.size} deployed under supabase/functions/.`,
);

if (uncalled.length) {
  console.warn(`\n[edge-calls] WARN  ${uncalled.length} deployed function(s) have no caller on any surface:`);
  for (const name of uncalled) console.warn(`               ${name}`);
  console.warn(
    `               Not proof of dead code. A function an older shipped binary calls stays\n` +
      `               load-bearing until MIN_SUPPORTED_APP_VERSION excludes that binary (CLAUDE.md),\n` +
      `               and cron/webhook-invoked functions have no client caller by design.`,
  );
}

if (known.length) {
  console.warn(`\n[edge-calls] WARN  ${known.length} known-missing function(s), pending XPLAT-008:`);
  for (const [name, sites] of known.sort((a, b) => a[0].localeCompare(b[0]))) {
    console.warn(`               ${name}  (${[...sites].join(', ')})`);
    console.warn(`                   ${KNOWN_MISSING.get(name)}`);
  }
}

if (staleAllowlist.length) {
  console.error(
    `\n[edge-calls] ${staleAllowlist.length} stale KNOWN_MISSING entr(ies): ` +
      `${staleAllowlist.join(', ')}.\nEach is now either implemented or no longer called. ` +
      `Delete the entry - the list only shrinks.`,
  );
  process.exit(1);
}

if (missing.length === 0) {
  console.log('\n[edge-calls] OK - every invoked function exists or is a recorded XPLAT-008 item.');
  process.exit(0);
}

console.error(`\n[edge-calls] ${missing.length} NEW invoked function(s) do not exist and will 404 at runtime:\n`);
for (const [name, sites] of missing.sort((a, b) => a[0].localeCompare(b[0]))) {
  console.error(`  ${name}`);
  for (const site of [...sites].sort()) console.error(`      ${site}`);
}
console.error(`\nImplement the function under supabase/functions/<name>/, or remove the call site.`);
process.exit(1);

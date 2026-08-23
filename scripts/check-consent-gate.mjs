#!/usr/bin/env node
/**
 * Consent gate on third-party tags (WEB-LEGAL-009 AC1).
 *
 * WHY. WEB-LEGAL-001 shipped analytics that loaded before consent, type-checked
 * cleanly, passed review, and was REPORTED AS FIXED in COMPLIANCE_AUDIT.md while
 * still broken in production. Nothing in the pipeline could contradict that
 * document, because the defect lives in index.html - not TypeScript, not tested,
 * not linted.
 *
 * WHAT IT ASSERTS, in the order that matters:
 *
 *   1. NO STATIC TAG. googletagmanager.com must not appear in a `<script src>`
 *      in index.html. This is stronger than the AC's rule and is what the code
 *      actually does: fetching gtag.js is itself a disclosure to Google, so a
 *      consent DEFAULT of denied is not enough if the request goes out anyway.
 *      A dns-prefetch link is fine - it resolves a name, it sends no page data.
 *
 *   2. CONSENT MODE DEFAULTS TO DENIED, and does so before anything else can
 *      run. analytics_storage, ad_storage, ad_user_data and ad_personalization
 *      all start denied, so a visitor who never opts in is covered even in the
 *      window before the app hydrates - which is what PrivacyPolicy.tsx promises
 *      in as many words.
 *
 *   3. THE LOADER HAS EXACTLY ONE CALLER. The gate is only as good as the list
 *      of things that can open it. __dmiLoadAnalytics must be called from
 *      src/lib/analyticsConsent.ts and nowhere else; a second caller added
 *      anywhere in src/ is how a gate quietly stops being one.
 *
 * NOT A GENERAL-PURPOSE COMPLIANCE LINTER, per AC7. Three assertions tied to one
 * defect that actually happened.
 *
 * Usage: node scripts/check-consent-gate.mjs
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(ROOT, 'index.html');
const LOADER = '__dmiLoadAnalytics';
const ALLOWED_CALLER = 'src/lib/analyticsConsent.ts';

/** Categories that must start denied. functionality/security may start granted. */
const MUST_DEFAULT_DENIED = [
  'analytics_storage',
  'ad_storage',
  'ad_user_data',
  'ad_personalization',
];

if (!existsSync(INDEX)) {
  console.error('[consent-gate] index.html not found - refusing to pass.');
  process.exit(1);
}

const html = readFileSync(INDEX, 'utf8');
const failures = [];

// --- 1. No static tag -------------------------------------------------------
// Only <script> elements with a src. A string inside the inline loader is the
// dynamic path and is the whole point.
for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
  // Two conditions, and the second is the load-bearing one. The anchored regex
  // is what CodeQL asks for and matches the ordinary shape. The plain substring
  // test is what keeps this a DENY guard: a tag that reaches gtag.js by another
  // route - a proxy path, a query parameter, a protocol-relative redirect -
  // still discloses the visitor to Google, and an anchored host match alone
  // would wave it through. Narrowing a rule that exists to CATCH something is
  // not the same as narrowing one that exists to permit it.
  const anchoredHost =
    /\bsrc\s*=\s*["'](?:https?:)?\/\/(?:www\.)?googletagmanager\.com(?:[\/"'?#]|$)/i.test(tag);
  const mentionsHost = tag.toLowerCase().includes('googletagmanager');
  if (/\bsrc\s*=/.test(tag) && (anchoredHost || mentionsHost)) {
    failures.push(
      'index.html loads googletagmanager.com from a <script src> tag. The request ' +
        'itself is a disclosure to Google, so it must not be made until consent is ' +
        'granted - load it from ' + LOADER + ' instead.'
    );
  }
}

// --- 2. Consent Mode defaults to denied -------------------------------------
const consentDefault = html.match(/gtag\(\s*["']consent["']\s*,\s*["']default["']\s*,\s*\{[\s\S]*?\}\s*\)/);
if (!consentDefault) {
  failures.push(
    'index.html has no gtag("consent", "default", {...}) block. Without it every ' +
      'storage category defaults to granted.'
  );
} else {
  const block = consentDefault[0];
  for (const category of MUST_DEFAULT_DENIED) {
    const setting = block.match(new RegExp(`${category}\\s*:\\s*["'](\\w+)["']`));
    if (!setting) {
      failures.push(`Consent Mode default does not set ${category}.`);
    } else if (setting[1] !== 'denied') {
      failures.push(`Consent Mode defaults ${category} to "${setting[1]}", not "denied".`);
    }
  }

  // Ordering: the defaults must be established before the tag can ever load.
  const gtmIndex = html.indexOf('googletagmanager.com/gtag/js');
  if (gtmIndex !== -1 && consentDefault.index > gtmIndex) {
    failures.push(
      'The Consent Mode default block appears AFTER the gtag.js URL. Defaults set ' +
        'late do not apply to what already loaded.'
    );
  }
}

// --- 3. One caller ----------------------------------------------------------
function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|tsx|js|jsx)$/.test(entry)) out.push(p);
  }
  return out;
}

const callers = sourceFiles(join(ROOT, 'src'))
  .filter((f) => readFileSync(f, 'utf8').includes(LOADER))
  .map((f) => f.slice(ROOT.length + 1).replace(/\\/g, '/'));

const unexpected = callers.filter((f) => f !== ALLOWED_CALLER);
if (unexpected.length > 0) {
  failures.push(
    `${LOADER} is referenced outside ${ALLOWED_CALLER}: ${unexpected.join(', ')}. ` +
      'The gate is only as good as the list of things that can open it.'
  );
}
if (!callers.includes(ALLOWED_CALLER)) {
  failures.push(
    `${ALLOWED_CALLER} no longer references ${LOADER}. Either the gate moved, or ` +
      'analytics can never load at all - both need a look.'
  );
}

console.log(
  `[consent-gate] ${callers.length} caller(s) of ${LOADER}; ` +
    `${MUST_DEFAULT_DENIED.length} categories checked.`
);

if (failures.length > 0) {
  console.error(`\nX ${failures.length} consent-gate failure(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error('\n  See WEB-LEGAL-001 and WEB-LEGAL-009.\n');
  process.exit(1);
}

console.log('\nOK No third-party tag loads before consent.');

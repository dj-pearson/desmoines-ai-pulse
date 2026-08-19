#!/usr/bin/env node
/**
 * Two narrow checks tied to two defects that actually happened (WEB-LEGAL-009).
 *
 * NOT a general-purpose compliance linter, on purpose. Each check exists
 * because a specific bug shipped, type-checked cleanly, passed human review,
 * and in one case was reported as fixed while still broken in production.
 *
 * 1. CONSENT GATE (WEB-LEGAL-001). GA4 fired for every visitor because
 *    index.html loaded gtag.js from a plain <script src> tag. Consent Mode
 *    defaults do not help there: fetching gtag.js is itself a disclosure to
 *    Google, so the tag must not be REQUESTED until the visitor opts in. The
 *    rule: no static <script src=".../gtag/js"> element may exist, and a
 *    gtag("consent","default",{... analytics_storage:"denied" ...}) call must
 *    appear before any googletagmanager reference.
 *
 * 2. CSP HASHES (the trap WEB-LEGAL-001 set for its own fix). The inline
 *    scripts in index.html are pinned by SHA-256 in public/_headers. Editing
 *    the consent block without regenerating its hash makes the browser refuse
 *    to run it - and a blocked analytics script looks EXACTLY like a working
 *    consent gate: no requests, no cookies, no errors anybody reads. Every
 *    executable inline script must have a matching hash in script-src.
 *
 * Non-executable script types (application/ld+json and friends) are excluded:
 *    browsers do not enforce script-src against them, and index.html carries a
 *    1.3KB JSON-LD block that would otherwise fail this check forever.
 *
 * Usage: node scripts/check-consent-and-csp.mjs
 * Exit 0 = clean, 1 = a defect this file was written to catch.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(ROOT, 'index.html');
const HEADERS = join(ROOT, 'public/_headers');

const html = readFileSync(INDEX, 'utf8');
const headers = readFileSync(HEADERS, 'utf8');

const failures = [];
const warnings = [];
const lineOf = (index) => html.slice(0, index).split('\n').length;

// ---------------------------------------------------------------------------
// 1. Consent gate
// ---------------------------------------------------------------------------

// Only a reference that LOADS the tag counts. index.html also carries a
// <link rel="dns-prefetch"> for the host, which resolves DNS and fetches
// nothing - treating that as a tracker would make this check cry wolf on the
// very optimisation the consent-gated loader depends on.
const GTM_LOADER = 'googletagmanager.com/gtag/js';

// A static tag element is the defect itself: it fetches before any app code
// (and therefore any consent decision) can run.
const staticTag = /<script\b[^>]*\bsrc\s*=\s*["'][^"']*googletagmanager\.com\/gtag\/js[^"']*["'][^>]*>/i.exec(html);
if (staticTag) {
  failures.push(
    `index.html:${lineOf(staticTag.index)} loads gtag.js from a static <script src>. ` +
      `That fetch happens for every visitor regardless of consent, and requesting ` +
      `gtag.js is itself a disclosure to Google. Load it from a function the ` +
      `cookie banner calls after the analytics category is granted ` +
      `(window.__dmiLoadAnalytics is the existing seam).`,
  );
}

const firstGtmRef = html.toLowerCase().indexOf(GTM_LOADER);
if (firstGtmRef !== -1) {
  // Consent Mode defaults, with analytics denied, must be established first.
  const consentDefault = /gtag\s*\(\s*["']consent["']\s*,\s*["']default["']\s*,\s*\{([\s\S]*?)\}\s*\)/i.exec(html);
  if (!consentDefault) {
    failures.push(
      `index.html references ${GTM_LOADER} but never calls gtag("consent","default",{...}). ` +
        `Without it a visitor who has not opted in is tracked in the window before the app hydrates.`,
    );
  } else {
    if (!/analytics_storage\s*:\s*["']denied["']/i.test(consentDefault[1])) {
      failures.push(
        `index.html:${lineOf(consentDefault.index)} sets Consent Mode defaults but not ` +
          `analytics_storage:"denied". Denial has to be the default, including when the app never boots.`,
      );
    }
    if (consentDefault.index > firstGtmRef) {
      failures.push(
        `index.html:${lineOf(consentDefault.index)} sets the consent default AFTER the first ` +
          `${GTM_LOADER} reference at line ${lineOf(firstGtmRef)}. Defaults only apply to calls that follow them.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 2. CSP hashes match the inline script bytes
// ---------------------------------------------------------------------------

/** Types the browser executes; anything else is data and script-src ignores it. */
const EXECUTABLE = new Set(['', 'text/javascript', 'application/javascript', 'module', 'importmap']);

const sha = (body) => `sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}`;

// Parse the real header line, not the file. _headers documents the hash recipe
// in a `#` comment that mentions script-src, and a naive search matches the
// comment instead of the policy - which is how the first version of this check
// reported every hash as missing while the site was fine.
const cspLine = headers
  .split('\n')
  .map((l) => l.trim())
  .find((l) => !l.startsWith('#') && /^content-security-policy\s*:/i.test(l));

if (!cspLine) {
  failures.push(`public/_headers declares no Content-Security-Policy; the inline scripts are unpinned.`);
}
const scriptSrc = cspLine ? /script-src([^;]*)(?:;|$)/i.exec(cspLine) : null;
if (cspLine && !scriptSrc) {
  failures.push(`public/_headers CSP has no script-src directive; the inline scripts are unpinned.`);
}
const directive = scriptSrc ? scriptSrc[1] : '';
const declared = new Set((directive.match(/'sha256-[^']+'/g) ?? []).map((h) => h.slice(1, -1)));

const inlineRe = /<script\b(?![^>]*\bsrc\s*=)([^>]*)>([\s\S]*?)<\/script>/gi;
const seen = new Set();
let m;
while ((m = inlineRe.exec(html)) !== null) {
  const type = (/\btype\s*=\s*["']([^"']*)["']/i.exec(m[1])?.[1] ?? '').trim().toLowerCase();
  if (!EXECUTABLE.has(type)) continue;
  const hash = sha(m[2]);
  seen.add(hash);
  if (!declared.has(hash)) {
    failures.push(
      `index.html:${lineOf(m.index)} inline script has no matching hash in the public/_headers ` +
        `script-src. Expected ${hash}. The browser will refuse to run this block, which looks ` +
        `identical to the script working correctly. Add the hash.`,
    );
  }
}

for (const hash of declared) {
  if (!seen.has(hash)) {
    warnings.push(
      `public/_headers declares ${hash}, which matches no inline script in index.html. ` +
        `Stale hashes are harmless to the browser but hide which block is actually pinned.`,
    );
  }
}

// ---------------------------------------------------------------------------

for (const w of warnings) console.warn(`[consent-csp] WARN  ${w}`);

if (failures.length === 0) {
  console.log('[consent-csp] OK - consent gate intact, every executable inline script is pinned.');
  process.exit(0);
}

console.error(`[consent-csp] ${failures.length} failure(s):\n`);
for (const f of failures) console.error(`  - ${f}\n`);
process.exit(1);

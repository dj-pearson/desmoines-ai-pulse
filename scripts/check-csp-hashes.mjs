#!/usr/bin/env node
/**
 * WEB-SEC-035. The CSP pins a SHA-256 for every inline <script> in index.html,
 * and nothing checked that the pins still match.
 *
 * script-src in public/_headers has no 'unsafe-inline', which is the right
 * call - it means a hash is the ONLY thing letting an inline script run. It
 * also means that editing one of those scripts without regenerating its hash
 * gets it silently blocked in production and nowhere else: the dev server
 * sends no CSP, `vite preview` sends no CSP, and Cloudflare only applies
 * _headers on a real deploy. The three scripts are the early error handler
 * (Capacitor and extension recovery), the service-worker teardown, and the
 * Google Analytics consent loader - so the failure mode is the site quietly
 * losing its error recovery or its analytics, with no error anyone sees.
 *
 * The _headers comment already says "If you modify any inline script in
 * index.html, regenerate hashes with: python3 -c ...". A comment is not a
 * check. This is.
 *
 * Runs on the SOURCE index.html, not dist/: verified that the three blocks
 * contain no %VITE_% placeholders, so the served bytes are the authored bytes
 * and no build is needed.
 *
 * type="application/ld+json" blocks are skipped. They are data, not code -
 * browsers do not run them, so script-src's inline check does not apply.
 *
 * Usage: node scripts/check-csp-hashes.mjs
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const HTML = 'index.html';
const HEADERS = 'public/_headers';

const html = readFileSync(HTML, 'utf8');
const headers = readFileSync(HEADERS, 'utf8');

const INLINE_SCRIPT =
  /<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g;

const found = [];
for (const m of html.matchAll(INLINE_SCRIPT)) {
  const body = m[1];
  const hash = 'sha256-' + createHash('sha256').update(body, 'utf8').digest('base64');
  const firstLine = body.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  found.push({ hash, hint: firstLine.slice(0, 64) });
}

// Read the directive off the actual header line, not out of the comment block
// above it - that comment contains the words "script-src" and "'unsafe-inline'"
// while explaining why the hashes exist, and a looser match reads them as the
// policy itself.
const cspLine = headers
  .split('\n')
  .map((l) => l.trim())
  .find((l) => l.startsWith('Content-Security-Policy:'));
if (!cspLine) {
  console.error(`X No Content-Security-Policy header found in ${HEADERS}.`);
  process.exit(1);
}
const scriptSrc = cspLine.match(/script-src ([^;]*)/)?.[1] ?? '';
if (!scriptSrc) {
  console.error(`X The Content-Security-Policy in ${HEADERS} has no script-src directive.`);
  process.exit(1);
}
if (scriptSrc.includes("'unsafe-inline'")) {
  console.error(
    `X script-src contains 'unsafe-inline', which makes every pinned hash\n` +
      `  decorative and lets any injected inline script run. Remove it.`
  );
  process.exit(1);
}

const pinned = [...scriptSrc.matchAll(/'(sha256-[A-Za-z0-9+/=]+)'/g)].map((m) => m[1]);
const blocked = found.filter((f) => !pinned.includes(f.hash));
const stale = pinned.filter((p) => !found.some((f) => f.hash === p));

if (blocked.length === 0 && stale.length === 0) {
  console.log(
    `OK All ${found.length} inline script(s) in ${HTML} are pinned in the CSP, with no stale pins.`
  );
  process.exit(0);
}

console.error('');
for (const b of blocked) {
  console.error(`X This inline script would be BLOCKED in production - no matching hash:`);
  console.error(`    ${b.hash}`);
  console.error(`    starts: ${b.hint}`);
}
for (const s of stale) {
  console.error(`X Stale pin - no inline script in ${HTML} hashes to it:`);
  console.error(`    ${s}`);
}
console.error(`
The CSP has no 'unsafe-inline', so a hash is the only thing that lets an inline
script run. A missing one fails ONLY on a real Cloudflare deploy - the dev
server and vite preview send no CSP at all.

Put these back into the script-src directive in ${HEADERS}:

  ${found.map((f) => `'${f.hash}'`).join(' ')}
`);
process.exit(1);

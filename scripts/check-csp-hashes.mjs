/**
 * CSP inline-script hash check (WEB-LEGAL-009 AC2).
 *
 * public/_headers pins `script-src` to explicit SHA-256 hashes rather than
 * 'unsafe-inline' (SEC-021). That only holds while the hashes match the bytes
 * actually shipped — and the inline bootstrap in index.html is exactly the
 * thing WEB-LEGAL-001 had to edit to add a consent gate. Editing it without
 * regenerating the hash silently breaks the page: the browser refuses to run
 * the script, and nothing in the build says so.
 *
 * WHAT IT COMPARES, and why against dist/ rather than index.html:
 * Vite rewrites index.html during the build, so the source file's inline
 * scripts hash differently from the ones served. Measured: index.html has 4
 * inline blocks matching 0 declared hashes, dist/index.html has 10 matching
 * all 3. Checking the source would report a permanent false failure.
 *
 * NON-EXECUTABLE TYPES ARE EXCLUDED. Seven of those ten blocks are
 * application/ld+json structured data. Browsers do not execute them and CSP
 * does not block them, so requiring a hash for each would be a permanent false
 * failure in the other direction.
 *
 *   node scripts/check-csp-hashes.mjs
 *
 * Requires a build: dist/index.html must exist. Skips (exit 0) when it does
 * not, so a checkout without a build is not a failure.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILT_HTML = join(ROOT, 'dist', 'index.html');
const HEADERS = join(ROOT, 'public', '_headers');

/** Types a browser will actually execute. Anything else CSP ignores. */
const EXECUTABLE = new Set(['', 'text/javascript', 'application/javascript', 'module']);

/**
 * Strip `#` comment lines before scanning.
 *
 * _headers documents its own CSP in prose — one line reads "CSP script-src uses
 * SHA-256 hashes instead of 'unsafe-inline' for inline scripts (SEC-021)" — so
 * a naive scan of the raw file matches the EXPLANATION rather than the
 * directive. The first version of this check failed on exactly that.
 */
function withoutComments(src) {
  return src
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

export function declaredHashes(headersSrc) {
  // Only the script-src directive counts; style-src carries its own hashes.
  const directive = withoutComments(headersSrc).match(/script-src[^;\n]*/g) ?? [];
  const out = new Set();
  for (const d of directive) {
    for (const m of d.matchAll(/'sha256-([A-Za-z0-9+/=]+)'/g)) out.add(m[1]);
  }
  return out;
}

export function inlineScripts(html) {
  const out = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
    const typeMatch = m[1].match(/type\s*=\s*"([^"]*)"/);
    const type = (typeMatch ? typeMatch[1] : '').toLowerCase();
    out.push({
      type,
      body: m[2],
      executable: EXECUTABLE.has(type),
      hash: createHash('sha256').update(m[2], 'utf8').digest('base64'),
    });
  }
  return out;
}

function main() {
  if (!existsSync(BUILT_HTML)) {
    console.error('[csp-hashes] dist/index.html not found — run npm run build first. Skipping.');
    process.exit(0);
  }
  if (!existsSync(HEADERS)) {
    console.error('[csp-hashes] public/_headers not found.');
    process.exit(1);
  }

  const headersSrc = readFileSync(HEADERS, 'utf8');
  const declared = declaredHashes(headersSrc);
  const scripts = inlineScripts(readFileSync(BUILT_HTML, 'utf8'));
  const executable = scripts.filter((s) => s.executable);

  if (/script-src[^;\n]*'unsafe-inline'/.test(withoutComments(headersSrc))) {
    // If this ever appears the hashes stop meaning anything, which is a
    // quieter regression than a mismatch and worth failing on explicitly.
    console.error(
      "[csp-hashes] script-src contains 'unsafe-inline'. The SHA-256 pinning in " +
        'public/_headers (SEC-021) is then decorative — any injected inline script runs.',
    );
    process.exit(1);
  }

  if (executable.length === 0) {
    // Zero executable inline scripts would mean the parse broke, not that the
    // page is clean. Reporting a pass here is the false green this exists to
    // avoid.
    console.error('[csp-hashes] parsed no executable inline scripts in dist/index.html — refusing to pass.');
    process.exit(1);
  }

  const unhashed = executable.filter((s) => !declared.has(s.hash));
  console.log(
    `[csp-hashes] ${scripts.length} inline block(s): ${executable.length} executable, ` +
      `${scripts.length - executable.length} non-executable (ld+json etc). ` +
      `${declared.size} hash(es) declared.`,
  );

  if (unhashed.length > 0) {
    console.error(`\n❌ ${unhashed.length} executable inline script(s) have no matching CSP hash.`);
    for (const s of unhashed) {
      console.error(`   sha256-${s.hash}`);
      console.error(`   first line: ${s.body.trim().split('\n')[0].slice(0, 90)}`);
    }
    console.error(
      '\n   The browser will refuse to run these. Add the hash(es) above to the\n' +
        "   script-src directive in public/_headers, or revert the edit to the\n" +
        '   inline script in index.html.',
    );
    process.exit(1);
  }

  // Declared-but-unused is worth saying: a stale hash is dead weight and a hint
  // that someone edited the script and added rather than replaced.
  const used = new Set(executable.map((s) => s.hash));
  const stale = [...declared].filter((h) => !used.has(h));
  if (stale.length > 0) {
    console.log(`   note: ${stale.length} declared hash(es) match no current script (stale, not fatal).`);
  }

  console.log('✅ every executable inline script is covered by a CSP hash.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

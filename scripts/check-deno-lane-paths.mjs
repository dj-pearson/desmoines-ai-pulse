#!/usr/bin/env node
/**
 * A Deno lane re-runs when a file its suites read changes.
 *
 * subscription-sync-tests.yml runs on pull_request with a `paths:` filter. Its
 * Deno suites do not only read supabase/functions: dozens of them read app
 * source (src/**), the native clients, crawlers/, CLAUDE.md, and assert a
 * contract across both ends. A PR that changes only the file a suite reads
 * does not match the filter, so the suite does not run, and the break surfaces
 * later on whichever unrelated PR next touches supabase/functions.
 *
 * That is not hypothetical. WEB-PERF-061 rewrote src/components/auth/
 * SessionManager.tsx, which session-timeout-policy.test.ts greps; the filter
 * did not watch that file, nothing ran, and the stale assertion sat in the
 * lane as WEB-QA-051. On 2026-11-08 this check found 145 files read by lane
 * suites, about 120 of them outside the filter.
 *
 * What it reads: every string literal in a lane suite that resolves to an
 * existing file or directory, relative to the suite's own directory when it
 * starts with ./ or ../, otherwise relative to the repo root (the REPO-URL
 * convention the suites use). A directory counts as dir/** because the suites
 * walk directories. Paths built from variables are not seen; a suite that
 * reads 'components/' + name from a src base is a known gap.
 *
 * A gate, not a ratchet: the filter covers everything it finds today.
 *
 *   node scripts/check-deno-lane-paths.mjs
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Bare words that name a repo folder by coincidence. node_modules is skipped by
 * every walker and cannot change in a PR; 'hotels' is a content type (and a
 * Storage prefix) in places-photo-terms and nlp-search, not the hotels/ folder.
 */
const NOT_A_WALKED_DIR = new Set(['node_modules', 'hotels']);

/** GitHub Actions path-filter glob to a RegExp: ** crosses /, * and ? do not. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else {
          re += '.*';
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

/** GitHub semantics: patterns apply in order, a later !pattern excludes. */
export function matchesFilter(path, patterns) {
  let hit = false;
  for (const p of patterns) {
    if (p.startsWith('!')) {
      if (globToRegExp(p.slice(1)).test(path)) hit = false;
    } else if (globToRegExp(p).test(path)) {
      hit = true;
    }
  }
  return hit;
}

/**
 * The `paths:` list under `on: pull_request:`, or null when the workflow has
 * no pull_request paths filter (it then runs on every PR, nothing to check).
 */
export function pullRequestPaths(yamlText) {
  const lines = yamlText.split('\n');
  let inOn = false;
  let inPr = false;
  let prIndent = -1;
  let inPaths = false;
  let pathsIndent = -1;
  const out = [];
  for (const raw of lines) {
    const line = raw.replace(/(^|\s)#.*$/, '$1').replace(/\s+$/, '');
    if (line.trim() === '') continue;
    const indent = line.length - line.trimStart().length;
    if (indent === 0) {
      if (inPaths) break;
      inOn = /^on:/.test(line);
      inPr = false;
      continue;
    }
    if (!inOn) continue;
    if (!inPr) {
      if (/^\s*pull_request:/.test(line)) {
        inPr = true;
        prIndent = indent;
      }
      continue;
    }
    if (indent <= prIndent) {
      if (inPaths) break;
      inPr = /^\s*pull_request:/.test(line);
      continue;
    }
    if (!inPaths) {
      if (/^\s*paths:\s*$/.test(line)) {
        inPaths = true;
        pathsIndent = indent;
      }
      continue;
    }
    if (indent <= pathsIndent) break;
    const m = line.match(/^\s*-\s*(['"]?)(.+?)\1\s*$/);
    if (m) out.push(m[2]);
  }
  return inPaths ? out : null;
}

/** Suites a workflow runs, from its `deno test ... <file>` lines. */
export function laneSuites(yamlText) {
  const text = yamlText.replace(/(^|\s)#.*$/gm, '$1');
  return [...new Set([...text.matchAll(/deno test[^\n]*?\s(supabase\/functions\/\S+\.test\.ts)/g)].map((m) => m[1]))];
}

/**
 * Repo-relative files and directories a suite names in a string literal.
 * Directories come back with a trailing slash.
 */
export function pathsReadBy(suitePath, text, root) {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const found = new Set();
  const walks = /\bDeno\.readDir(Sync)?\(/.test(code);
  for (const m of code.matchAll(/(['"`])((?:\.{1,2}\/)*[A-Za-z0-9_.@-][A-Za-z0-9_.@/-]*)\1/g)) {
    const lit = m[2];
    const bare = !lit.includes('/') && !/\.[a-z]{2,4}$/.test(lit);
    const abs = /^\.\.?\//.test(lit) ? resolve(root, dirname(suitePath), lit) : resolve(root, lit);
    if (!existsSync(abs)) continue;
    // A bare word ('docs' in SCAN_DIRS, 'ios' in CLIENT_ROOTS) counts only when
    // it names a directory and the suite walks directories; otherwise words
    // such as 'hotels' would match a folder by coincidence.
    if (bare && (!walks || NOT_A_WALKED_DIR.has(lit) || !statSync(abs).isDirectory())) continue;
    const rel = relative(root, abs).split('\\').join('/');
    if (rel === '' || rel.startsWith('..')) continue;
    found.add(statSync(abs).isDirectory() ? `${rel}/` : rel);
  }
  return [...found];
}

/** A directory is covered when a file anywhere under it would match. */
export function covered(path, patterns) {
  if (!path.endsWith('/')) return matchesFilter(path, patterns);
  return matchesFilter(`${path}__probe__/x`, patterns) && matchesFilter(`${path}x`, patterns);
}

export function uncoveredReads(root) {
  const dir = join(root, '.github', 'workflows');
  const misses = [];
  let lanes = 0;
  let reads = 0;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.yml')).sort()) {
    const yaml = readFileSync(join(dir, f), 'utf8');
    const suites = laneSuites(yaml);
    if (suites.length === 0) continue;
    const patterns = pullRequestPaths(yaml);
    if (patterns === null) continue;
    lanes++;
    const byPath = new Map();
    for (const s of suites) {
      if (!existsSync(join(root, s))) continue;
      for (const p of pathsReadBy(s, readFileSync(join(root, s), 'utf8'), root)) {
        if (!byPath.has(p)) byPath.set(p, []);
        byPath.get(p).push(s);
      }
    }
    reads += byPath.size;
    for (const [p, readers] of [...byPath].sort()) {
      if (!covered(p, patterns)) misses.push({ workflow: f, path: p, readers });
    }
  }
  return { lanes, reads, misses };
}

function main() {
  const { lanes, reads, misses } = uncoveredReads(process.cwd());
  if (lanes === 0) {
    console.error('[deno-lane-paths] found no path-filtered workflow running deno test - refusing to pass.');
    process.exit(1);
  }
  console.log(`[deno-lane-paths] ${lanes} path-filtered Deno lane(s); ${reads} file(s) read by their suites.`);
  if (misses.length === 0) {
    console.log("OK Every file a lane suite reads is in that lane's pull_request paths filter.");
    process.exit(0);
  }
  console.error("\nX Files a Deno suite reads that its workflow's paths filter does not watch:");
  for (const m of misses) console.error(`  ${m.workflow}: ${m.path}  (read by ${m.readers.join(', ')})`);
  console.error(
    '\nA PR that changes only one of these files does not run the suite that\n' +
      'asserts on it. Add the path (or a glob covering it) to on.pull_request.paths.',
  );
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();

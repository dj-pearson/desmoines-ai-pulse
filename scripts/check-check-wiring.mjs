#!/usr/bin/env node
/**
 * Every scripts/check-* must run somewhere (WEB-CI-038).
 *
 * WEB-CI-028 found Playwright specs that were written, committed and never run
 * again, and check-e2e-lanes ratchets that. The check scripts had the same
 * hole and nothing watching it. Measured 2026-11-15, four of 95 ran nowhere:
 *
 *   check-dist-console.mjs        the only proof that console.* is stripped from
 *                                 the production bundle. CLAUDE.md's Logging
 *                                 rule leans on it; it had a package.json
 *                                 entry and no caller.
 *   check-pseo-coverage.ts        its offline half compares the pSEO
 *                                 thresholds in src/ with the copy the
 *                                 generate-pseo-page edge function carries.
 *                                 Its own header says that half "always runs".
 *                                 It ran when someone typed it.
 *   check-pseo-inventory.ts       reads production on purpose (header says so)
 *   check-restaurant-seo-titles   needs SUPABASE_DB_URL on purpose
 *
 * The first two are now steps in pr-checks.yml. The last two are listed in
 * ONLINE_ONLY below with the reason, so "runs nowhere" is a decision someone
 * wrote down rather than an accident.
 *
 * WHAT COUNTS AS RUNNING. A check is wired when its path appears in a workflow
 * (comments stripped), or in an npm script that a workflow reaches through
 * `npm run`, `npm test` or another reached npm script. `validate` counts
 * because pr-checks runs it a step at a time and dependency-update.yml runs it
 * whole; it is reached the same way as anything else, not special-cased.
 * A path named only in a YAML comment does not count: that is the
 * performance.spec mistake check-e2e-lanes made once.
 *
 * Exit 1 on any unwired check, on an ONLINE_ONLY entry that no longer exists,
 * and on one that is now wired (delete the entry; it is stale).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Checks that need production credentials, so no PR job can run them. */
export const ONLINE_ONLY = {
  'check-pseo-inventory.ts':
    'reads pseo_pages from production; run before and after a generation batch',
  'check-restaurant-seo-titles.ts':
    'needs SUPABASE_DB_URL; run after generate-seo-content writes titles',
};

const CHECK_FILE = /^check-.+\.(mjs|cjs|js|ts|sh)$/;

/** The check scripts under scripts/, excluding type declarations. */
export function checkFiles(scriptsDir) {
  return readdirSync(scriptsDir)
    .filter((f) => CHECK_FILE.test(f) && !/\.d\.[mc]?ts$/.test(f))
    .sort();
}

/** YAML with `#` comments removed (a `#` inside a word, like a URL anchor, stays). */
export function yamlCode(text) {
  return text.replace(/(^|\s)#.*$/gm, '$1');
}

const NPM_RUN = /\bnpm\s+(?:run(?:-script)?\s+([\w:.-]+)|(test)\b)/g;

/** npm script names a command line invokes. `npm test` is the `test` script. */
export function npmScriptsCalled(command) {
  const out = [];
  for (const m of command.matchAll(NPM_RUN)) out.push(m[1] ?? m[2]);
  return out;
}

/**
 * The npm scripts reachable from the workflows: every `npm run X` they make,
 * then every `npm run Y` inside X, to a fixed point. Unknown names are dropped
 * (check-* scripts that call npm run on a missing name fail on their own).
 */
export function reachableScripts(workflowCode, scripts) {
  const seen = new Set();
  const queue = npmScriptsCalled(workflowCode);
  while (queue.length) {
    const name = queue.pop();
    if (seen.has(name) || !(name in scripts)) continue;
    seen.add(name);
    queue.push(...npmScriptsCalled(scripts[name]));
  }
  return seen;
}

/** The check files that nothing reachable from a workflow names. */
export function unwiredChecks({ files, workflowCode, scripts }) {
  const reached = reachableScripts(workflowCode, scripts);
  const haystack = [workflowCode, ...[...reached].map((n) => scripts[n])].join('\n');
  return files.filter((f) => !haystack.includes(`scripts/${f}`));
}

export function evaluate(root) {
  const workflowsDir = join(root, '.github', 'workflows');
  const workflowCode = readdirSync(workflowsDir)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => yamlCode(readFileSync(join(workflowsDir, f), 'utf8')))
    .join('\n');
  const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {};
  const files = checkFiles(join(root, 'scripts'));
  const unwired = unwiredChecks({ files, workflowCode, scripts });
  const problems = [];
  for (const f of unwired) {
    if (!(f in ONLINE_ONLY)) problems.push(`scripts/${f} runs in no workflow and no npm script a workflow reaches`);
  }
  for (const f of Object.keys(ONLINE_ONLY)) {
    if (!files.includes(f)) problems.push(`ONLINE_ONLY names scripts/${f}, which does not exist; delete the entry`);
    else if (!unwired.includes(f)) problems.push(`ONLINE_ONLY names scripts/${f}, which is now wired; delete the entry`);
  }
  return { files, unwired, problems };
}

function main() {
  const root = process.cwd();
  if (!existsSync(join(root, 'scripts')) || !existsSync(join(root, '.github', 'workflows'))) {
    console.error('[check-wiring] run from the repo root (no scripts/ or .github/workflows/ here).');
    process.exit(1);
  }
  const { files, unwired, problems } = evaluate(root);
  if (files.length === 0) {
    // A scan that finds no checks must not report that they are all wired.
    console.error('[check-wiring] found 0 scripts/check-* files. That is not a pass.');
    process.exit(1);
  }
  if (problems.length) {
    console.error(`[check-wiring] ${problems.length} problem(s) in ${files.length} check scripts:`);
    for (const p of problems) console.error(`  X ${p}`);
    console.error(
      '\nAdd the check to `validate`, or as a step in a workflow (pr-checks.yml for anything offline).\n' +
        'If it genuinely needs production credentials, add it to ONLINE_ONLY in scripts/check-check-wiring.mjs with the reason.',
    );
    process.exit(1);
  }
  const online = unwired.length;
  console.log(`[check-wiring] ${files.length - online} of ${files.length} check scripts run in CI; ${online} online-only by decision.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();

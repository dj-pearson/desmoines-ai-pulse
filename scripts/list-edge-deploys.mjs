/**
 * Which edge functions a commit range needs redeployed.
 *
 *   node scripts/list-edge-deploys.mjs <baseRef> <headRef>
 *
 * Prints JSON: { "functions": ["scrape-events", ...], "sharedChanged": bool }
 *
 * WHY THIS IS NOT JUST `git diff --name-only`. Functions import from
 * supabase/functions/_shared/, and Supabase bundles that code INTO each
 * function at deploy time - there is no shared runtime module. So editing
 * _shared/apiKeyAuth.ts changes the behaviour of every function that imports
 * it while changing none of their directories, and a naive changed-directory
 * deploy ships none of them. `sharedChanged` is how the caller learns it has to
 * widen the blast radius; deciding how far is the caller's job, because that
 * needs to know what is currently deployed and this stays offline so it can be
 * tested without credentials.
 *
 * Directories starting with `_` are excluded: _shared, _tests and _typecheck
 * are not deployable functions and `supabase functions deploy _shared` fails.
 */
import { execFileSync } from 'node:child_process';

/** Path separator on Windows checkouts; git reports either. */
const BACKSLASH = String.fromCharCode(92);

const FUNCTION_PATH = /^supabase\/functions\/([^/]+)\//;
/** Rebuilds every function's bundle config, so treat it like a _shared change. */
const GLOBAL_PATHS = ['supabase/config.toml'];

export function classify(changedPaths) {
  const functions = new Set();
  let sharedChanged = false;

  for (const p of changedPaths) {
    const normalized = p.split(BACKSLASH).join('/');
    if (GLOBAL_PATHS.includes(normalized)) {
      sharedChanged = true;
      continue;
    }
    const m = FUNCTION_PATH.exec(normalized);
    if (!m) continue;
    const name = m[1];
    // _shared, _tests, _typecheck — support code, not deploy targets.
    if (name.startsWith('_')) {
      if (name === '_shared') sharedChanged = true;
      continue;
    }
    functions.add(name);
  }

  return { functions: [...functions].sort(), sharedChanged };
}

function changedPathsBetween(base, head) {
  const out = execFileSync('git', ['diff', '--name-only', `${base}..${head}`], {
    encoding: 'utf8',
  });
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

// Only run when invoked directly, so the test can import classify().
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(BACKSLASH).join('/').split('/').pop())) {
  const [base, head = 'HEAD'] = process.argv.slice(2);
  if (!base) {
    console.error('usage: node scripts/list-edge-deploys.mjs <baseRef> [headRef]');
    process.exit(2);
  }
  console.log(JSON.stringify(classify(changedPathsBetween(base, head))));
}

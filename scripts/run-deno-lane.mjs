#!/usr/bin/env node
/**
 * Runs the Deno lane (every `deno test` line in .github/workflows) in a
 * container that cannot reach esm.sh. WEB-CI-036.
 *
 * Cloud agent containers get a 403 from esm.sh. After the suites themselves
 * moved to jsr:@std/assert, six still failed at import, because the module
 * under test pulls supabase-js or date-fns from esm.sh (aiConfig.ts,
 * agentRun.ts, apiKeyAuth.ts, jobRunner.ts, eventDateTime.ts, and the
 * agent-performance-review handler). 122 production files use those URLs and
 * the edge runtime resolves them fine, so the production code is left alone.
 *
 * Instead this passes scripts/deno-container-import-map.json, which points
 * each esm.sh URL at the same package on npm (registry.npmjs.org is reachable),
 * pinned to the version deno.lock resolves for that URL so the local run loads
 * what CI loads. CI does not use the map; it runs the real URLs.
 *
 * The pins are checked against deno.lock before anything runs. When the lock
 * moves (say supabase-js@2 starts resolving to 2.107.0), this fails and names
 * the entry to bump rather than quietly testing an older client.
 *
 *   npm i deno            # in a scratch dir; then point DENO at its bin
 *   DENO=/path/to/node_modules/.bin/deno node scripts/run-deno-lane.mjs
 *   node scripts/run-deno-lane.mjs aiModel ingest-events   # only matching steps
 *   node scripts/run-deno-lane.mjs --check-map             # pins only, no Deno
 *
 * Flags added to each step: --no-lock (Deno would rewrite deno.lock),
 * --node-modules-dir=none (the repo's package.json otherwise makes Deno look
 * for npm: packages in node_modules), and --import-map.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const MAP_PATH = 'scripts/deno-container-import-map.json';

/** Every `deno test ...` command in the workflow text, comments stripped. */
export function laneSteps(yamlText) {
  const text = yamlText.replace(/(^|\s)#.*$/gm, '$1');
  return [...text.matchAll(/^\s*-\s*run:\s*(deno test\s[^\n]*?)\s*$/gm)].map((m) => m[1]);
}

/** The npm version an import map target pins, e.g. npm:@scope/pkg@1.2.3 -> 1.2.3. */
function npmVersion(target) {
  const m = /^npm:(@[^/]+\/[^@]+|[^@]+)@(\d+\.\d+\.\d+)$/.exec(target);
  return m ? { name: m[1], version: m[2] } : null;
}

/** The exact version deno.lock resolves an esm.sh URL to, or null. */
function lockedVersion(url, lock) {
  const resolved = lock.redirects?.[url] ?? (lock.remote?.[url] ? url : null);
  if (!resolved) return null;
  const m = /^https:\/\/esm\.sh\/(@[^/]+\/[^@]+|[^@]+)@(\d+\.\d+\.\d+)$/.exec(resolved);
  return m ? { name: m[1], version: m[2] } : null;
}

/**
 * Problems with the map's pins, as strings; empty when every entry maps an
 * esm.sh URL deno.lock knows to the same package at the version it resolves.
 */
export function mapProblems(map, lock) {
  const problems = [];
  const entries = Object.entries(map.imports ?? {});
  if (entries.length === 0) problems.push('import map has no entries');
  for (const [url, target] of entries) {
    const pinned = npmVersion(target);
    if (!pinned) {
      problems.push(`${url}: target ${target} is not an exact npm:<pkg>@x.y.z`);
      continue;
    }
    const locked = lockedVersion(url, lock);
    if (!locked) {
      problems.push(`${url}: deno.lock has no resolution for it, so nothing says which version CI loads`);
      continue;
    }
    if (locked.name !== pinned.name || locked.version !== pinned.version) {
      problems.push(`${url}: map pins ${pinned.name}@${pinned.version}, deno.lock resolves ${locked.name}@${locked.version}`);
    }
  }
  return problems;
}

/** The step with the container flags inserted after `deno test`, as argv. */
export function containerArgs(step, mapPath = MAP_PATH) {
  const rest = step.replace(/^deno test\s+/, '').split(/\s+/).filter(Boolean);
  return ['test', '--no-lock', '--node-modules-dir=none', `--import-map=${mapPath}`, ...rest];
}

function main() {
  const root = process.cwd();
  const args = process.argv.slice(2);
  const map = JSON.parse(readFileSync(join(root, MAP_PATH), 'utf8'));
  const lock = JSON.parse(readFileSync(join(root, 'deno.lock'), 'utf8'));
  const problems = mapProblems(map, lock);
  if (problems.length > 0) {
    console.error(`X ${MAP_PATH} does not match deno.lock:`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`[deno-lane] ${Object.keys(map.imports).length} import map pin(s) match deno.lock.`);
  if (args.includes('--check-map')) process.exit(0);

  const workflows = join(root, '.github', 'workflows');
  const steps = readdirSync(workflows)
    .filter((f) => f.endsWith('.yml'))
    .flatMap((f) => laneSteps(readFileSync(join(workflows, f), 'utf8')));
  const filters = args.filter((a) => !a.startsWith('--'));
  const chosen = filters.length ? steps.filter((s) => filters.some((f) => s.includes(f))) : steps;
  if (chosen.length === 0) {
    console.error('[deno-lane] no deno test step matched - refusing to pass.');
    process.exit(1);
  }

  const deno = process.env.DENO || 'deno';
  const failed = [];
  for (const step of chosen) {
    const r = spawnSync(deno, containerArgs(step), { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
    if (r.error) {
      console.error(`[deno-lane] could not start ${deno}: ${r.error.message}. Set DENO to a deno binary.`);
      process.exit(1);
    }
    const ok = r.status === 0;
    const summary = /(?:ok|FAILED) \| \d+ passed[^\n]*/.exec(r.stdout + r.stderr)?.[0] ?? `exit ${r.status}`;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}  (${summary})`);
    if (!ok) {
      failed.push(step);
      console.log((r.stdout + r.stderr).split('\n').filter((l) => /error|FAILED|=>/.test(l)).slice(0, 12).join('\n'));
    }
  }
  console.log(`\n[deno-lane] ${chosen.length - failed.length}/${chosen.length} steps passed.`);
  process.exit(failed.length ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();

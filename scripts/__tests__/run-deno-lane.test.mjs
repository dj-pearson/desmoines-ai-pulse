#!/usr/bin/env node
/**
 * WEB-CI-036: the pieces of scripts/run-deno-lane.mjs.
 *
 * The real-tree case is the one that matters: the committed import map must
 * pin what deno.lock resolves, or a container run tests a different client
 * than CI does.
 */
import { readFileSync } from 'node:fs';
import { laneSteps, mapProblems, containerArgs, MAP_PATH } from '../run-deno-lane.mjs';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failed++;
};

const map = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
const lock = JSON.parse(readFileSync('deno.lock', 'utf8'));
const real = mapProblems(map, lock);
check('the committed map matches deno.lock', real.length === 0, real.join('; '));

const lockFixture = {
  redirects: { 'https://esm.sh/pkg@2': 'https://esm.sh/pkg@2.5.1' },
  remote: { 'https://esm.sh/@s/x@1.0.0': 'hash' },
};
check('a range URL pinned to its redirect passes',
  mapProblems({ imports: { 'https://esm.sh/pkg@2': 'npm:pkg@2.5.1' } }, lockFixture).length === 0);
check('an exact URL in remote passes',
  mapProblems({ imports: { 'https://esm.sh/@s/x@1.0.0': 'npm:@s/x@1.0.0' } }, lockFixture).length === 0);
check('a stale pin fails and names both versions',
  /2\.4\.0.*2\.5\.1/.test(mapProblems({ imports: { 'https://esm.sh/pkg@2': 'npm:pkg@2.4.0' } }, lockFixture).join()));
check('a different package fails',
  mapProblems({ imports: { 'https://esm.sh/pkg@2': 'npm:other@2.5.1' } }, lockFixture).length === 1);
check('a range target fails',
  mapProblems({ imports: { 'https://esm.sh/pkg@2': 'npm:pkg@2' } }, lockFixture).length === 1);
check('a URL deno.lock does not know fails',
  mapProblems({ imports: { 'https://esm.sh/new@1.0.0': 'npm:new@1.0.0' } }, lockFixture).length === 1);
check('an empty map fails', mapProblems({ imports: {} }, lockFixture).length === 1);

const yaml = `jobs:
  t:
    steps:
      - run: deno test --allow-env supabase/functions/a.test.ts
      # - run: deno test supabase/functions/commented.test.ts
      - run: deno test supabase/functions/b.test.ts   # trailing note
      - run: npm ci
`;
const steps = laneSteps(yaml);
check('reads deno test steps and skips comments and other commands',
  JSON.stringify(steps) === JSON.stringify([
    'deno test --allow-env supabase/functions/a.test.ts',
    'deno test supabase/functions/b.test.ts',
  ]), JSON.stringify(steps));
const workflow = readFileSync('.github/workflows/subscription-sync-tests.yml', 'utf8');
check('finds the real lane (over 100 steps)', laneSteps(workflow).length > 100, String(laneSteps(workflow).length));

const argv = containerArgs('deno test --allow-read --no-check supabase/functions/x.test.ts', 'm.json');
check('inserts the container flags before the step flags',
  JSON.stringify(argv) === JSON.stringify(['test', '--no-lock', '--node-modules-dir=none', '--import-map=m.json', '--allow-read', '--no-check', 'supabase/functions/x.test.ts']),
  JSON.stringify(argv));

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll run-deno-lane checks passed.');

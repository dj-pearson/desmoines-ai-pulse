#!/usr/bin/env node
/**
 * WEB-CI-038: the pieces of scripts/check-check-wiring.mjs, plus
 * the real tree with the two checks this story wired taken back out.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ONLINE_ONLY,
  evaluate,
  npmScriptsCalled,
  reachableScripts,
  unwiredChecks,
  yamlCode,
} from '../check-check-wiring.mjs';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failed++;
};

// What a command line calls.
check('npm run X is a call', npmScriptsCalled('npm run lint && npm run check-a').join() === 'lint,check-a');
check('npm test is the test script', npmScriptsCalled('npm test').join() === 'test');
check('npm run-script is a call', npmScriptsCalled('npm run-script foo:bar').join() === 'foo:bar');
check('npx is not an npm script', npmScriptsCalled('npx tsx scripts/check-a.ts').length === 0);

// Comments do not run anything.
check('a YAML comment is dropped', !yamlCode('  # node scripts/check-a.mjs\n').includes('check-a'));
check('a trailing comment is dropped', yamlCode('run: x # scripts/check-a.mjs').trim() === 'run: x');
check('a # inside a word stays', yamlCode('url: a.com/#x').includes('#x'));

// Reachability is transitive and ignores names that do not exist.
const scripts = {
  validate: 'npm run check-a && npm run missing',
  'check-a': 'node scripts/check-a.mjs',
  'check-b': 'node scripts/check-b.mjs',
  'check-c': 'tsx scripts/check-c.ts',
  outer: 'npm run inner',
  inner: 'tsx scripts/check-c.ts',
};
const reached = reachableScripts('run: npm run validate\nrun: npm run outer', scripts);
check('validate is reached', reached.has('validate'));
check('a script validate calls is reached', reached.has('check-a'));
check('two hops down is reached', reached.has('inner'));
check('a missing name is not reached', !reached.has('missing'));
check('an uncalled script is not reached', !reached.has('check-b'));

const files = ['check-a.mjs', 'check-b.mjs', 'check-c.ts', 'check-d.sh'];
const un = unwiredChecks({
  files,
  workflowCode: 'run: npm run validate\nrun: bash scripts/check-d.sh',
  scripts,
});
check('only the uncalled check is unwired', un.join() === 'check-b.mjs,check-c.ts', un.join());
check(
  'a check named only in a comment is unwired',
  unwiredChecks({ files: ['check-d.sh'], workflowCode: yamlCode('# bash scripts/check-d.sh'), scripts: {} }).length === 1,
);

// The real tree passes.
const real = evaluate(process.cwd());
check('the real tree has no problems', real.problems.length === 0, real.problems.join('; '));
check('the real tree has check scripts', real.files.length > 50, String(real.files.length));
check('every ONLINE_ONLY entry is unwired in the real tree', Object.keys(ONLINE_ONLY).every((f) => real.unwired.includes(f)));

// Negative control: the tree as it was before this story (the two pr-checks
// and e2e steps removed) reports exactly the two checks that ran nowhere.
const tmp = mkdtempSync(join(tmpdir(), 'check-wiring-'));
try {
  cpSync(join(process.cwd(), 'scripts'), join(tmp, 'scripts'), {
    recursive: true,
    filter: (src) => !src.includes('node_modules') && !src.includes('__tests__'),
  });
  cpSync(join(process.cwd(), '.github', 'workflows'), join(tmp, '.github', 'workflows'), { recursive: true });
  cpSync(join(process.cwd(), 'package.json'), join(tmp, 'package.json'));
  const strip = (file, line) => {
    const p = join(tmp, '.github', 'workflows', file);
    const text = readFileSync(p, 'utf8');
    if (!text.includes(line)) throw new Error(`${file} no longer contains ${line}`);
    writeFileSync(p, text.replace(line, ''));
  };
  strip('pr-checks.yml', 'run: npm run check-pseo-coverage');
  strip('e2e.yml', 'run: npm run check-dist-console');
  const before = evaluate(tmp);
  const named = before.problems.map((p) => p.split(' ')[0]).sort().join();
  check(
    'the old wiring reports check-dist-console and check-pseo-coverage',
    named === 'scripts/check-dist-console.mjs,scripts/check-pseo-coverage.ts',
    named,
  );

  // An ONLINE_ONLY entry that gets wired is stale.
  const pr = join(tmp, '.github', 'workflows', 'pr-checks.yml');
  writeFileSync(pr, readFileSync(pr, 'utf8') + '\n      - run: npx tsx scripts/check-pseo-inventory.ts\n');
  const stale = evaluate(tmp).problems.filter((p) => p.includes('now wired'));
  check('a wired ONLINE_ONLY entry is reported stale', stale.length === 1 && stale[0].includes('check-pseo-inventory'), stale.join('; '));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);

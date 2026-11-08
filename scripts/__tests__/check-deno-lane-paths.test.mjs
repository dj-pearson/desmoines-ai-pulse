#!/usr/bin/env node
/**
 * WEB-QA-055: the pieces of scripts/check-deno-lane-paths.mjs.
 *
 * The first real-tree case is the one that produced WEB-QA-051: the old
 * filter did not watch SessionManager.tsx, which session-timeout-policy reads.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  globToRegExp,
  matchesFilter,
  pullRequestPaths,
  laneSuites,
  pathsReadBy,
  covered,
  uncoveredReads,
} from '../check-deno-lane-paths.mjs';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failed++;
};

// Glob semantics, as GitHub's path filter reads them.
check('** crosses directories', globToRegExp('src/**').test('src/a/b/c.ts'));
check('* stops at a slash', !globToRegExp('public/*.txt').test('public/a/b.txt'));
check('* matches within a segment', globToRegExp('public/*.txt').test('public/key.txt'));
check('a literal dot is literal', !globToRegExp('CLAUDE.md').test('CLAUDEXmd'));
check('**/ matches zero directories', globToRegExp('src/**/x.ts').test('src/x.ts'));
check('a later ! excludes', !matchesFilter('src/a.test.ts', ['src/**', '!src/*.test.ts']));
check('a dir is covered only by a glob under it', covered('src/', ['src/**']) && !covered('src/', ['src/App.tsx']));

const yaml = `name: x
on:
  pull_request:
    branches: [main]
    paths:
      - 'supabase/functions/**'
      # a comment line
      - "src/lib/a.ts"
      - CLAUDE.md
  push:
    paths:
      - 'never/**'
concurrency:
  group: x
jobs:
  t:
    steps:
      - run: deno test --allow-read supabase/functions/_tests/a.test.ts
      # - run: deno test supabase/functions/_tests/commented.test.ts
`;
const paths = pullRequestPaths(yaml);
check(
  'reads only the pull_request paths list',
  JSON.stringify(paths) === JSON.stringify(['supabase/functions/**', 'src/lib/a.ts', 'CLAUDE.md']),
  JSON.stringify(paths),
);
check('no paths filter reads as null', pullRequestPaths('on:\n  pull_request:\n    branches: [main]\njobs: {}\n') === null);
check('suites come from deno test lines, not comments', JSON.stringify(laneSuites(yaml)) === '["supabase/functions/_tests/a.test.ts"]');

// pathsReadBy against a scratch repo.
const root = mkdtempSync(join(tmpdir(), 'deno-lane-paths-'));
try {
  for (const d of ['src/lib', 'docs', 'hotels', 'supabase/functions/_tests', '.github/workflows']) {
    mkdirSync(join(root, d), { recursive: true });
  }
  writeFileSync(join(root, 'src/lib/a.ts'), '');
  writeFileSync(join(root, 'src/lib/b.ts'), '');
  writeFileSync(join(root, 'CLAUDE.md'), '');
  writeFileSync(join(root, '.gitleaks.toml'), '');
  const suite = 'supabase/functions/_tests/a.test.ts';
  const text = `
const REPO = new URL('../../../', import.meta.url);
await Deno.readTextFile(new URL('src/lib/a.ts', REPO));
await Deno.readTextFile(new URL('../../../CLAUDE.md', import.meta.url));
await Deno.readTextFile(new URL('.gitleaks.toml', REPO));
// await Deno.readTextFile(new URL('src/lib/b.ts', REPO));
const SCAN_DIRS = ['docs'];
for await (const e of Deno.readDir(new URL('docs/', REPO))) {}
const types = ['hotels', 'events'];
`;
  writeFileSync(join(root, suite), text);
  const read = pathsReadBy(suite, text, root).sort();
  check(
    'finds repo-root (dotfiles too) and suite-relative paths, a walked bare dir, and skips comments and hotels',
    JSON.stringify(read) === JSON.stringify(['.gitleaks.toml', 'CLAUDE.md', 'docs/', 'src/lib/a.ts']),
    JSON.stringify(read),
  );
  const noWalk = pathsReadBy(suite, `const SCAN_DIRS = ['docs'];`, root);
  check('a bare word does not count when the suite walks nothing', noWalk.length === 0, JSON.stringify(noWalk));

  writeFileSync(join(root, '.github/workflows/lane.yml'), yaml);
  const { misses } = uncoveredReads(root);
  check(
    'reports a read file and a walked dir the filter misses',
    JSON.stringify(misses.map((m) => m.path)) === '[".gitleaks.toml","docs/"]',
    JSON.stringify(misses.map((m) => m.path)),
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

// The real tree passes, and the filter as it stood before this check would not.
const real = uncoveredReads(process.cwd());
check('the real tree has at least one path-filtered Deno lane', real.lanes >= 1);
check('the real tree passes', real.misses.length === 0, real.misses.map((m) => m.path).join(', '));
const oldFilter = [
  'supabase/functions/**',
  'supabase/migrations/**',
  'ios/DesMoinesInsider/**',
  'android/app/src/main/java/**',
  'src/hooks/useSubscription.ts',
  'supabase/config.toml',
  'CLAUDE.md',
];
check(
  'the old filter missed SessionManager.tsx (the WEB-QA-051 shape)',
  !matchesFilter('src/components/auth/SessionManager.tsx', oldFilter),
);

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);

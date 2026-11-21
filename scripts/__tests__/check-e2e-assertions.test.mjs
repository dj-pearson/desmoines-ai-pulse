#!/usr/bin/env node
/**
 * WEB-QA-050: the matcher behind scripts/check-e2e-assertions.mjs.
 *
 * The first case is the shape that sat in the required smoke lane: a test that
 * types, logs what it saw, and has nothing that can fail.
 */
import { findVacuousTests, assertingHelpers, helperBodies, laneOf, inLane } from '../check-e2e-assertions.mjs';
import ts from 'typescript';

const wrap = (body) => `import { test, expect } from '@playwright/test';\ntest('t', async ({ page }) => {\n${body}\n});\n`;

const cases = [
  [
    'logs and ends (the search-filters shape)',
    wrap(`await page.fill('input', 'x');\nif (n > 0) { console.log('ok'); }`),
    1,
  ],
  ['expect(...).toBe', wrap(`expect(1).toBe(1);`), 0],
  ['await expect(locator).toBeVisible', wrap(`await expect(page.locator('h1')).toBeVisible();`), 0],
  ['expect.soft', wrap(`expect.soft(1).toBe(1);`), 0],
  ['expect(fn).toPass', wrap(`await expect(async () => { await page.reload(); }).toPass();`), 0],
  ['expect.poll', wrap(`await expect.poll(() => 1).toBe(1);`), 0],
  ['an expect* helper by name', wrap(`await expectNoErrorBoundary(page);`), 0],
  ['an assert* helper by name', wrap(`assertHealthy(page);`), 0],
  ['throw is an explicit failure', wrap(`if (!ok) throw new Error('broken');`), 0],
  ['a guarded expect is still reachable (documented gap)', wrap(`if (n > 0) expect(n).toBe(1);`), 0],
  ['a comment that says expect is not an assertion', wrap(`// expect(x).toBe(y)\nawait page.goto('/');`), 1],
  ['a string that says expect is not an assertion', wrap(`console.log('expect(x)');`), 1],
  ['a method called expectation is not an assertion', wrap(`page.expectation();`), 1],
  [
    'a local helper that asserts counts',
    `function check(p) { expect(p).toBeTruthy(); }\ntest('t', async ({ page }) => { check(page); });`,
    0,
  ],
  [
    'a local helper that asserts through another helper counts',
    `const inner = (p) => { expect(p).toBeTruthy(); };\nconst outer = (p) => inner(p);\ntest('t', async ({ page }) => { outer(page); });`,
    0,
  ],
  [
    'a local helper that only logs does not',
    `function look(p) { console.log(p); }\ntest('t', async ({ page }) => { look(page); });`,
    1,
  ],
  ['test.skip with a body never runs, so it is not reported', `test.skip('t', async () => { console.log(1); });`, 0],
  ['test.describe is not a test', `test.describe('d', () => { test('t', async () => { expect(1).toBe(1); }); });`, 0],
  ['test.only is a test', `test.only('t', async () => { console.log(1); });`, 1],
  ['a test with a details object', `test('t', { tag: '@x' }, async () => { console.log(1); });`, 1],
];

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
  if (!ok) failed++;
};

for (const [name, text, want] of cases) {
  const got = findVacuousTests('x.spec.ts', text).length;
  check(name, got === want, `want ${want}, got ${got}`);
}

// Helpers from tests/support are passed in as a shared set.
const support = ts.createSourceFile('s.ts', `export async function seeHub(p) { await expect(p).toHaveURL(/x/); }`, ts.ScriptTarget.Latest, true);
const shared = assertingHelpers(helperBodies(support));
check('a tests/support helper that asserts counts', findVacuousTests('x.spec.ts', wrap(`await seeHub(page);`), shared).length === 0);

// The describe path is part of the title a config's grep matches.
const nested = findVacuousTests('a.spec.ts', `test.describe('Axe block', () => { test('scan', async () => { console.log(1); }); });`);
check('fullTitle carries the describe path', nested[0]?.fullTitle === 'Axe block scan', JSON.stringify(nested[0]?.fullTitle));

// Lanes read from config source: regex testMatch, string testMatch, grep, grepInvert.
const smoke = laneOf(`  testMatch: /(route-smoke|search-filters)\\.spec\\.ts/,\n  grepInvert: /homepage notice/,\n`);
check('regex testMatch matches a listed spec', inLane(smoke, 'search-filters.spec.ts', 'x'));
check('regex testMatch rejects an unlisted spec', !inLane(smoke, 'forms.spec.ts', 'x'));
check('grepInvert drops an excluded test', !inLane(smoke, 'route-smoke.spec.ts', 'shows the homepage notice'));
const a11y = laneOf(`  testMatch: 'accessibility.spec.ts',\n  grep: /Automated Accessibility Testing with Axe/,\n`);
check('string testMatch plus grep keeps the axe block', inLane(a11y, 'accessibility.spec.ts', 'Automated Accessibility Testing with Axe home'));
check('grep drops tests outside the axe block', !inLane(a11y, 'accessibility.spec.ts', 'Keyboard Enter key should activate buttons'));
check('a config with no testMatch is not read as matching everything', laneOf(`  testDir: './tests',\n`) === null);

const total = cases.length + 8;
console.log(`\n${total - failed}/${total} passed.`);
process.exit(failed ? 1 : 0);

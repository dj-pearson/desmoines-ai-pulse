#!/usr/bin/env node
/**
 * Every test in a required E2E lane must be able to fail (WEB-QA-050).
 *
 * WHY THIS EXISTS. search-filters.spec.ts joined the REQUIRED smoke lane under
 * WEB-CI-028, and the lane has counted its tests as passing protection ever
 * since. Reading it showed that several of them contain no assertion at all:
 * they type into the search box, log what they saw, and end. "search should
 * show loading indicator during search" logs a line when it finds a spinner
 * and does nothing when it does not. A test like that is green on a page with
 * no search box, no results and no spinner, and the lane's pass count says the
 * journey is covered.
 *
 * check-e2e-lanes answers "does some lane run this spec?". This answers the
 * next question: "can the test the lane runs go red?". A test with no reachable
 * assertion cannot, so it is reported.
 *
 * WHAT COUNTS AS AN ASSERTION, read from the syntax tree, never from text (a
 * comment saying "expect ..." is not one):
 *   - any call rooted at `expect` (expect(x).toBe, expect.soft, expect.poll,
 *     expect(fn).toPass)
 *   - any call to a function named expect* or assert*
 *   - a `throw` statement
 *   - a call to a helper whose own body contains one of the above, found in
 *     the spec itself or in tests/support/ and followed transitively, so
 *     `await openAndCheck(page)` counts when openAndCheck asserts
 *
 * WHAT IT DOES NOT CATCH, said plainly so nobody reads a green run as more than
 * it is: an assertion behind a presence guard (`if (await x.count() > 0)
 * expect(...)`) still counts, because it is reachable. That shape is the next
 * thing to burn down; this check is the floor, not the ceiling.
 *
 * WHICH SPECS. Only the required lanes: the smoke config's testMatch and the
 * a11y config's testMatch. The advisory lanes run under continue-on-error, so a
 * vacuous test there misleads nobody about what gates a merge.
 *
 * IT IS A RATCHET. Tests present when this was written are baselined in
 * .github/e2e-assertions-baseline.json; a NEW assertion-free test in a required
 * spec fails, and an entry that starts asserting (or is deleted) is reported
 * as stale so the baseline only shrinks.
 *
 * Usage:
 *   node scripts/check-e2e-assertions.mjs
 *   node scripts/check-e2e-assertions.mjs --write    # re-baseline
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const ASSERT_NAME = /^(expect|assert)([A-Z_]|$)/;

function calleeRoot(expr) {
  // expect(x).not.toBe(y) -> the innermost callee is the identifier `expect`.
  let e = expr;
  for (;;) {
    if (ts.isCallExpression(e)) e = e.expression;
    else if (ts.isPropertyAccessExpression(e)) e = e.expression;
    else if (ts.isElementAccessExpression(e)) e = e.expression;
    else if (ts.isNonNullExpression(e) || ts.isParenthesizedExpression(e)) e = e.expression;
    else break;
  }
  return ts.isIdentifier(e) ? e.text : null;
}

function calleeName(expr) {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return null;
}

/**
 * Does `node` contain an assertion? `asserting` is the set of helper names
 * already known to assert; a call to one of them counts.
 */
export function containsAssertion(node, asserting = new Set()) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (ts.isThrowStatement(n)) {
      found = true;
      return;
    }
    if (ts.isCallExpression(n)) {
      const root = calleeRoot(n.expression);
      const name = calleeName(n.expression);
      if (root === 'expect' || (name && (ASSERT_NAME.test(name) || asserting.has(name)))) {
        found = true;
        return;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function parse(fileName, text) {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

/** Named function bodies in a file: `function f() {}` and `const f = () => {}`. */
export function helperBodies(sf) {
  const out = [];
  const visit = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name && n.body) out.push([n.name.text, n.body]);
    else if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))
    ) {
      out.push([n.name.text, n.initializer.body]);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Fixed point: a helper asserts if its body asserts or calls a helper that does. */
export function assertingHelpers(bodies, seed = new Set()) {
  const asserting = new Set(seed);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, body] of bodies) {
      if (!asserting.has(name) && containsAssertion(body, asserting)) {
        asserting.add(name);
        grew = true;
      }
    }
  }
  return asserting;
}

function isTestCall(n) {
  if (!ts.isCallExpression(n)) return false;
  const e = n.expression;
  if (ts.isIdentifier(e)) return e.text === 'test' || e.text === 'it';
  // test.only runs; test.skip / test.fixme with a body never do, and
  // test.describe / test.beforeEach are not tests.
  return ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'test' && e.name.text === 'only';
}

function titleOf(arg, sf) {
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return arg.text;
  return arg.getText(sf);
}

function isDescribeCall(n) {
  if (!ts.isCallExpression(n)) return false;
  let e = n.expression;
  if (ts.isIdentifier(e)) return e.text === 'describe';
  // test.describe(...), test.describe.serial(...), test.describe.parallel(...)
  while (ts.isPropertyAccessExpression(e)) {
    if (e.name.text === 'describe') return true;
    e = e.expression;
  }
  return false;
}

/**
 * The tests in `text` with no reachable assertion. A title built in a loop
 * (`${page.name} should ...`) is reported by its source text, so one entry
 * covers every generated test. `fullTitle` is the describe path plus the test
 * title, which is what a config's grep is matched against.
 */
export function findVacuousTests(fileName, text, sharedAsserting = new Set()) {
  const sf = parse(fileName, text);
  const asserting = assertingHelpers(helperBodies(sf), sharedAsserting);
  const out = [];
  const visit = (n, path) => {
    if (isDescribeCall(n) && n.arguments.length >= 2) {
      const inner = [...path, titleOf(n.arguments[0], sf)];
      n.arguments.slice(1).forEach((a) => visit(a, inner));
      return;
    }
    if (isTestCall(n) && n.arguments.length >= 2) {
      const fn = n.arguments[n.arguments.length - 1];
      if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) {
        if (!containsAssertion(fn.body, asserting)) {
          const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
          const title = titleOf(n.arguments[0], sf);
          out.push({ title, line: line + 1, fullTitle: [...path, title].join(' ') });
        }
        return;
      }
    }
    ts.forEachChild(n, (c) => visit(c, path));
  };
  visit(sf, []);
  return out;
}

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) files.push(full);
  }
  return files;
}

function regexField(configText, field) {
  const m = configText.match(new RegExp(`^\\s*${field}:\\s*\\/(.+)\\/([a-z]*),?\\s*$`, 'm'));
  return m ? new RegExp(m[1], m[2]) : null;
}

/**
 * What a Playwright config runs, read from its source: testMatch (a regex or a
 * single file name) plus grep and grepInvert when present. A test is in the
 * lane when its file matches and its full title passes the greps.
 */
export function laneOf(configText) {
  let testMatch = regexField(configText, 'testMatch');
  if (!testMatch) {
    const str = configText.match(/^\s*testMatch:\s*['"]([^'"]+)['"]/m);
    if (str) testMatch = new RegExp(`(^|/)${str[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  }
  if (!testMatch) return null;
  return { testMatch, grep: regexField(configText, 'grep'), grepInvert: regexField(configText, 'grepInvert') };
}

export function inLane(lane, spec, fullTitle) {
  if (!lane.testMatch.test(spec)) return false;
  if (lane.grep && !lane.grep.test(fullTitle)) return false;
  if (lane.grepInvert && lane.grepInvert.test(fullTitle)) return false;
  return true;
}

function main() {
  const ROOT = process.cwd();
  const TESTS = join(ROOT, 'tests');
  const BASELINE = join(ROOT, '.github', 'e2e-assertions-baseline.json');
  const WRITE = process.argv.includes('--write');

  const configs = ['playwright.smoke.config.ts', 'playwright.a11y.config.ts'];
  const lanes = configs.map((c) => {
    const file = join(ROOT, c);
    const m = existsSync(file) ? laneOf(readFileSync(file, 'utf8')) : null;
    if (!m) {
      console.error(`[e2e-assertions] could not read testMatch from ${c}. That is not a pass.`);
      process.exit(1);
    }
    return m;
  });

  const specs = readdirSync(TESTS)
    .filter((f) => f.endsWith('.spec.ts') && lanes.some((l) => l.testMatch.test(f)))
    .sort();
  if (specs.length < 10) {
    console.error(`[e2e-assertions] matched ${specs.length} required spec(s); the lanes run far more. Refusing to pass.`);
    process.exit(1);
  }

  // Helpers shared through tests/support are followed too.
  const supportDir = join(TESTS, 'support');
  const supportBodies = existsSync(supportDir)
    ? walk(supportDir).flatMap((f) => helperBodies(parse(f, readFileSync(f, 'utf8'))))
    : [];
  const shared = assertingHelpers(supportBodies);

  const found = [];
  for (const spec of specs) {
    const text = readFileSync(join(TESTS, spec), 'utf8');
    for (const t of findVacuousTests(spec, text, shared)) {
      if (lanes.some((l) => inLane(l, spec, t.fullTitle))) found.push({ key: `${spec} :: ${t.title}`, line: t.line, spec });
    }
  }
  const keys = [...new Set(found.map((f) => f.key))].sort();

  if (WRITE) {
    writeFileSync(
      BASELINE,
      JSON.stringify(
        {
          _comment:
            'Tests in REQUIRED E2E lanes with no reachable assertion (WEB-QA-050). They pass on any page. This list must only ever SHRINK. See scripts/check-e2e-assertions.mjs.',
          generated: new Date().toISOString().slice(0, 10),
          vacuous: keys,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`[e2e-assertions] baselined ${keys.length} assertion-free test(s) across ${specs.length} required spec(s).`);
    return;
  }

  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).vacuous ?? [] : [];
  const known = new Set(baseline);
  const fresh = found.filter((f) => !known.has(f.key));
  const stale = baseline.filter((k) => !keys.includes(k));

  if (stale.length) {
    console.log(`[e2e-assertions] ${stale.length} baselined test(s) now assert or are gone. Re-baseline to lock it in (npm run check-e2e-assertions:update):`);
    stale.forEach((k) => console.log(`  - ${k}`));
  }
  if (fresh.length) {
    console.error(`[e2e-assertions] ${fresh.length} test(s) in a required lane can never fail - no expect, no assert*, no throw:`);
    fresh.forEach((f) => console.error(`  tests/${f.spec}:${f.line}  ${f.key.split(' :: ')[1]}`));
    console.error('A required lane counts these as coverage. Assert what the test is for, or delete it.');
    process.exit(1);
  }
  console.log(`[e2e-assertions] ${specs.length} required spec(s); ${keys.length} assertion-free test(s), all baselined.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();

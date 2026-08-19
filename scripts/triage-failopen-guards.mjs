#!/usr/bin/env node
/**
 * WEB-BE-032 triage: which discarded Supabase errors actually matter?
 *
 * scripts/check-error-handling.mjs counts the sites (516 across 224 files) and
 * stops the pile growing. It deliberately does not judge them, because most are
 * best-effort writes where ignoring the error is correct. This script is the
 * judgement half: it produces the SHORTLIST worth reading.
 *
 * WHY "USED IN A CONDITIONAL" IS THE WRONG FILTER. Measured it: 316 of the 335
 * edge-function sites feed a conditional, because nearly every result gets an
 * `if (!rows) return` somewhere. A filter that keeps 94% of the population is
 * not a filter.
 *
 * THE FILTER THAT WORKS IS DIRECTION. supabase-js resolves with an { error }
 * object rather than throwing, so a discarded error leaves the binding null and
 * the code takes the null branch. That matters only when the null branch is the
 * PERMISSIVE one:
 *
 *   if (existing) { return }        <- error => existing null => NOT skipped
 *                                      => the side effect runs a second time.
 *                                      FAIL-OPEN. Shortlist it.
 *   if (!rows) { return }           <- error => returns early. Fail-closed.
 *                                      Degraded, not dangerous. Skip it.
 *
 * So: find awaited destructures that take `data` without `error`, then find an
 * if-statement within 40 lines whose test reads that binding POSITIVELY and
 * whose consequent exits (return/continue/break). That is the dedupe- and
 * entitlement-guard shape, and it is 19 sites rather than 516.
 *
 * THIS IS A SHORTLIST, NOT A VERDICT, and it over-reports on purpose. A test
 * like `if (row.owner !== uid) return 403` is positive-and-exiting by this
 * definition but fails CLOSED, so it lands on the list and a human clears it in
 * one read. Two known members of that class, both read and cleared 2026-08-19:
 * moderate-content/index.ts:302 (a 404/403 authorization ladder) and
 * src/lib/security/ownership.ts:155 (denies team access on error). Erring
 * toward over-reporting is right here - the cost is one read, and the failure
 * mode of the opposite bias is a double charge.
 *
 * Usage:
 *   node scripts/triage-failopen-guards.mjs
 *   node scripts/triage-failopen-guards.mjs --json
 */
import tsparser from '@typescript-eslint/parser';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const JSON_OUT = process.argv.includes('--json');
const WINDOW = 40; // lines between the read and the guard

const files = execSync(
  "find supabase/functions src -name '*.ts' -o -name '*.tsx' | grep -v node_modules",
).toString().trim().split('\n').filter(Boolean);

function walk(node, cb) {
  if (!node || typeof node.type !== 'string') return;
  cb(node);
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) if (child && typeof child.type === 'string') walk(child, cb);
    } else if (value && typeof value.type === 'string') {
      walk(value, cb);
    }
  }
}

/** Does this statement leave the current block (return / continue / break)? */
function exits(stmt) {
  let found = false;
  walk(stmt, (n) => {
    if (n.type === 'ReturnStatement' || n.type === 'ContinueStatement' || n.type === 'BreakStatement') {
      found = true;
    }
  });
  return found;
}

/** The identifier a test reads positively, or null if the test is negated. */
function positiveSubject(test) {
  const rootOf = (node) => {
    let n = node;
    while (n && (n.type === 'MemberExpression' || n.type === 'CallExpression' || n.type === 'ChainExpression')) {
      n = n.object || n.callee || n.expression;
    }
    return n && n.type === 'Identifier' ? n.name : null;
  };
  switch (test.type) {
    case 'Identifier':
      return test.name;
    case 'MemberExpression':
    case 'ChainExpression':
      return rootOf(test);
    case 'LogicalExpression':
      return test.operator === '&&' ? rootOf(test.left) : null;
    case 'BinaryExpression':
      return ['>', '>=', '!=='].includes(test.operator) ? rootOf(test.left) : null;
    default:
      return null; // UnaryExpression `!x`, `x === null`, etc: fail-closed
  }
}

const findings = [];

for (const file of files) {
  let ast;
  try {
    ast = tsparser.parse(readFileSync(file, 'utf8'), {
      ecmaVersion: 2022,
      sourceType: 'module',
      loc: true,
      jsx: file.endsWith('.tsx'),
    });
  } catch {
    continue; // a file the parser rejects is check-error-handling's problem, not ours
  }

  const sites = [];
  walk(ast, (n) => {
    if (n.type !== 'VariableDeclarator') return;
    if (n.init?.type !== 'AwaitExpression') return;
    if (n.id?.type !== 'ObjectPattern') return;
    const props = n.id.properties.filter((p) => p.type === 'Property');
    const dataProp = props.find((p) => p.key?.name === 'data');
    if (!dataProp || props.some((p) => p.key?.name === 'error')) return;
    if (dataProp.value.type !== 'Identifier') return;
    sites.push({ line: n.loc.start.line, binding: dataProp.value.name });
  });
  if (!sites.length) continue;

  const guards = [];
  walk(ast, (n) => {
    if (n.type !== 'IfStatement' || !exits(n.consequent)) return;
    const subject = positiveSubject(n.test);
    if (subject) guards.push({ subject, line: n.loc.start.line });
  });

  for (const site of sites) {
    const guard = guards.find(
      (g) => g.subject === site.binding && g.line >= site.line && g.line - site.line < WINDOW,
    );
    if (guard) findings.push({ file, line: site.line, binding: site.binding, guard: guard.line });
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({ findings }, null, 2));
} else {
  console.log(`[failopen-triage] ${findings.length} site(s) where a discarded error takes the permissive branch.\n`);
  const byFile = {};
  for (const f of findings) (byFile[f.file] ||= []).push(f);
  for (const [file, rows] of Object.entries(byFile).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${rows.length}  ${file}`);
    for (const r of rows) console.log(`     L${r.line} ${r.binding}  -> guard L${r.guard}`);
  }
  console.log('\nRead each one before changing it - see the header for the known fail-closed false positives.');
}

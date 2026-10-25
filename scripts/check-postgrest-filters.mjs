#!/usr/bin/env node
/**
 * Fails when a value is interpolated into a PostgREST ilike/like pattern in a
 * filter string without going through sanitizePostgrestPattern.
 *
 * WHY. Inside `.or(`name.ilike.%${q}%,...`)` a comma ends the clause and
 * parentheses group clauses, so a search for "Bar, Grill" or "Ankeny, IA"
 * makes PostgREST answer 400 "failed to parse logic tree" and the list shows
 * its empty state. Ten admin and public search boxes had that shape when this
 * check was written (see src/lib/postgrestPattern.ts for the measured cases).
 *
 * THE RULE. In any template literal under src/, an interpolation that sits in
 * a pattern position - directly after `ilike.` or `like.`, optionally followed
 * by `%` or `*` - must be one of:
 *
 *   1. a call:        `${sanitizePostgrestPattern(x)}`
 *   2. an identifier declared (const/let) in the same function, or an
 *      enclosing one, whose initializer calls sanitizePostgrestPattern:
 *        const q = search ? sanitizePostgrestPattern(search) : "";
 *   3. the parameter of a callback passed to .map/.flatMap/.forEach/.filter
 *      on something that satisfies 1 or 2:
 *        safe.map((t) => `name.ilike.%${t}%`)
 *   4. annotated with `// postgrest-safe: <reason>` on the interpolation's
 *      line, the line above it, the line above the template literal, or the
 *      line above the nearest enclosing arrow/function expression (so one comment covers a
 *      `(kw) => [ ... ]` callback). For fixed keyword lists, static config and
 *      other values a user cannot type.
 *
 * Only pattern positions are checked. Value positions in an or() string
 * (`.eq.${user.id}`, `.gte.${nowIso}`) carry ids and timestamps, and a nested
 * `or(${clause})` is a sub-filter whose own patterns are checked where that
 * string is built. `.ilike("col", `%${x}%`)` (the method form) is not a filter
 * string at all - supabase-js sends it as one parameter value, so a comma in
 * it cannot break the parse.
 *
 * Usage: node scripts/check-postgrest-filters.mjs [--json]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const SANITIZER = 'sanitizePostgrestPattern';
const PATTERN_POSITION = /\b(?:i?like)\.[%*]?$/;
const SAFE_COMMENT = /\/\/\s*postgrest-safe:\s*\S/;
const ITERATORS = new Set(['map', 'flatMap', 'forEach', 'filter']);

function callsSanitizer(node) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === SANITIZER
    ) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function isFunctionLike(n) {
  return (
    ts.isFunctionDeclaration(n) ||
    ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n)
  );
}

/** Declarators named `name` inside `scope`, not descending into nested functions. */
function declaratorsIn(scope, name) {
  const out = [];
  const visit = (n) => {
    if (n !== scope && isFunctionLike(n)) return;
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name) {
      out.push(n);
    }
    ts.forEachChild(n, visit);
  };
  visit(scope);
  return out;
}

function isSanitizedIdentifier(id) {
  const name = id.text;
  for (let n = id.parent; n; n = n.parent) {
    if (isFunctionLike(n)) {
      // Rule 3: a callback parameter iterating over sanitized values.
      if (n.parameters.some((p) => ts.isIdentifier(p.name) && p.name.text === name)) {
        const call = n.parent;
        if (
          call &&
          ts.isCallExpression(call) &&
          ts.isPropertyAccessExpression(call.expression) &&
          ITERATORS.has(call.expression.name.text)
        ) {
          return isSanitizedExpression(call.expression.expression);
        }
        return false;
      }
    }
    if (isFunctionLike(n) || ts.isSourceFile(n)) {
      const decls = declaratorsIn(n, name);
      if (decls.length > 0) return decls.every((d) => d.initializer && callsSanitizer(d.initializer));
    }
  }
  return false;
}

function isSanitizedExpression(expr) {
  let e = expr;
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === SANITIZER) {
    return true;
  }
  if (ts.isIdentifier(e)) return isSanitizedIdentifier(e);
  // `Array.from(new Set(names.map(sanitize...)))` and friends.
  if (ts.isCallExpression(e) && callsSanitizer(e)) return true;
  return false;
}

/**
 * Returns the unsafe interpolations in one file's source, as
 * [{ line, expression }] with 1-based line numbers.
 */
export function checkSource(source, fileName = 'input.ts') {
  const kind = fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const lines = source.split('\n');
  const problems = [];

  const visit = (n) => {
    if (ts.isTemplateExpression(n)) {
      let before = n.head.text;
      for (const span of n.templateSpans) {
        if (PATTERN_POSITION.test(before)) {
          const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
          const line = lineOf(span.expression);
          const candidates = [line, line - 1, lineOf(n) - 1];
          let fn = n.parent;
          while (fn && !isFunctionLike(fn)) fn = fn.parent;
          if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) candidates.push(lineOf(fn) - 1);
          const annotated = candidates.some((l) => SAFE_COMMENT.test(lines[l] ?? ''));
          if (!annotated && !isSanitizedExpression(span.expression)) {
            problems.push({ line: line + 1, expression: span.expression.getText(sf) });
          }
        }
        before = span.literal.text;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return problems;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry) && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Checks every source file under `root` (default src/). */
export function run(root = 'src') {
  const findings = [];
  let files = 0;
  for (const file of walk(root)) {
    files += 1;
    for (const p of checkSource(readFileSync(file, 'utf8'), file)) {
      findings.push({ file: relative(process.cwd(), file).replace(/\\/g, '/'), ...p });
    }
  }
  return { files, findings };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { files, findings } = run();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ files, findings }, null, 2));
  } else if (findings.length > 0) {
    console.error(`\nX ${findings.length} unsanitized PostgREST pattern interpolation(s):\n`);
    for (const f of findings) console.error(`  ${f.file}:${f.line}  \${${f.expression}}`);
    console.error(
      '\nA comma or parenthesis in that value ends the or() clause and PostgREST\n' +
        'answers 400. Pass it through sanitizePostgrestPattern (src/lib/postgrestPattern.ts),\n' +
        'or, for a value no user can type, add `// postgrest-safe: <reason>` above it.\n',
    );
  } else {
    console.log(`[postgrest-filters] ${files} file(s); every ilike/like pattern interpolation is sanitized.`);
  }
  if (findings.length > 0) process.exit(1);
}

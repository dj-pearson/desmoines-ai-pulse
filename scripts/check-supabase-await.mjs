#!/usr/bin/env node
/**
 * A dropped PostgREST builder sends nothing (WEB-PERF-039).
 *
 * `supabase.from(...).insert({...})` does not return a promise. It returns a
 * PostgrestBuilder, which is a THENABLE: it issues no HTTP request until
 * something subscribes to it. So
 *
 *     void supabase.from("web_vitals").insert(row);
 *
 * evaluates the builder and throws it away without ever calling .then(). No
 * request. No error. No log. That exact line shipped in src/lib/webVitals.ts
 * and the table had never received a single row - the admin panel's "No
 * web-vitals rollup yet" was read as low traffic for months.
 *
 * It is invisible in review because `void` is how you SAY "fire and forget" for
 * a real promise, and because `await` is what people look for when they are
 * looking for a bug. Nothing about the line looks wrong.
 *
 * THE RULE: a statement that evaluates a supabase query builder must do
 * something with it - await it, return it, assign it, or call .then() on it.
 * `supabase.functions.invoke()` and `supabase.auth.*` are NOT builders; they
 * return real promises and are eager, so they are out of scope here.
 *
 * Usage: node scripts/check-supabase-await.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['src', 'supabase/functions', 'scripts'];
const EXT = /\.(ts|tsx|mts|mjs)$/;
const SKIP_DIR = /(^|\/)(node_modules|dist|\.git|_tests|__tests__)(\/|$)/;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (SKIP_DIR.test(p)) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXT.test(p) && !/\.(test|spec)\.[tm]sx?$/.test(p)) out.push(p);
  }
  return out;
}

/**
 * Blank out comments and string/template literals, keeping every offset and
 * newline so reported line numbers stay true. Both are needed: prose
 * describing this rule would trip it, and so would a script that BUILDS the
 * string "supabase.from('x')" as part of its own error message - which
 * scripts/check-unknown-tables.mjs does, and which the first run flagged.
 */
function codeOnly(text) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .split('\n')
    .map((l) => l.replace(/(?<!:)\/\/.*$/, blank))
    .join('\n')
    .replace(/`(?:\\.|[^`\\])*`/g, blank)
    .replace(/'(?:\\.|[^'\\\n])*'/g, blank)
    .replace(/"(?:\\.|[^"\\\n])*"/g, blank);
}

/**
 * The statement containing `index`. Both scans track bracket depth, because a
 * builder often sits inside an argument list that itself contains an object
 * literal - `{ count: 'exact', head: true }` - and a naive backward walk stops
 * at that brace and reports the tail of the previous expression. The first run
 * of this check did exactly that on five Promise.all([...]) blocks.
 */
function statementAround(code, index) {
  // An unmatched ( or [ means the builder sits inside a call or an array -
  // `await Promise.all([builder, builder])` - and the thing that consumes it is
  // OUTSIDE that bracket, so the scan keeps going. Only an unmatched { is a
  // real boundary: that is a block, and object literals are matched so they
  // never reach depth 0. Stopping at the bracket is what made this check report
  // five correct Promise.all blocks on its first run.
  let start = index;
  let backDepth = 0;
  while (start > 0) {
    const c = code[start - 1];
    if (c === ')' || c === ']' || c === '}') backDepth += 1;
    else if (c === '(' || c === '[') {
      if (backDepth > 0) backDepth -= 1;
    } else if (c === '{') {
      if (backDepth === 0) break;
      backDepth -= 1;
    } else if (c === ';' && backDepth === 0) break;
    start -= 1;
  }
  let depth = 0;
  let end = index;
  while (end < code.length) {
    const c = code[end];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']') {
      if (depth > 0) depth -= 1;
    } else if (c === '}') {
      if (depth === 0) break;
      depth -= 1;
    } else if (c === ';' && depth === 0) break;
    end += 1;
  }
  return code.slice(start, end + 1);
}

// `.from(` is the builder entry point. `.rpc(` is one too. Both are lazy.
const BUILDER = /\b(?:supabase|client|db|admin|serviceClient|supabaseAdmin)\s*\.\s*(?:from|rpc)\s*\(/g;
// Anything that subscribes to, hands on, or keeps the builder.
const CONSUMED = /(\bawait\b|\breturn\b|\byield\b|\.then\s*\(|\.catch\s*\(|\.finally\s*\(|=>|[^=!<>]=[^=])/;

const problems = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const code = codeOnly(readFileSync(file, 'utf8'));
    BUILDER.lastIndex = 0;
    let m;
    while ((m = BUILDER.exec(code)) !== null) {
      const stmt = statementAround(code, m.index);
      if (CONSUMED.test(stmt)) continue;
      const line = code.slice(0, m.index).split('\n').length;
      problems.push({
        file: relative(process.cwd(), file),
        line,
        snippet: stmt.trim().replace(/\s+/g, ' ').slice(0, 110),
      });
    }
  }
}

if (problems.length === 0) {
  console.log('[supabase-await] OK No query builder is evaluated and dropped.');
  process.exit(0);
}

console.error('\nX A supabase query builder is evaluated but never subscribed to:\n');
for (const p of problems) console.error(`  ${p.file}:${p.line}\n    ${p.snippet}`);
console.error(`
A PostgrestBuilder is a thenable, not a promise: it sends no request until
something calls .then() on it. \`void builder;\` discards it silently - no
request, no error, no log.

Await it, return it, assign it, or attach a handler. For a deliberate
fire-and-forget write, end the chain with .then(undefined, handler) - the
handler is what subscribes, and it is also where a rejection goes.

(No example query is spelled out here on purpose: check-schema-usage reads
source for table names and flagged the placeholder in this very message as a
missing relation.)
`);
process.exit(1);

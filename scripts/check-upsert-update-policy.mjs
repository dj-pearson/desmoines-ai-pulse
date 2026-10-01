#!/usr/bin/env node
/**
 * Every .upsert() from the browser needs a FOR UPDATE policy on its table
 * (Plan & Stay pass 2, WP5 item 11).
 *
 * WHY. PostgREST turns .upsert() into INSERT ... ON CONFLICT DO UPDATE. The
 * first write is an INSERT and passes the INSERT policy; the second hits the
 * conflict, becomes an UPDATE, and RLS refuses it with 42501 unless an UPDATE
 * (or ALL) policy lets it through. So the bug is invisible in every test that
 * writes once. votes shipped exactly like that: the first vote in a category
 * worked and every change failed, on web and on Android.
 *
 * WHAT IT DOES, offline:
 *   1. Replays supabase/migrations/*.sql in filename order and records, per
 *      table, whether RLS is enabled and which policies exist with which
 *      command. DROP POLICY removes one, DROP TABLE clears the table, and a
 *      CREATE POLICY without FOR is ALL, as in Postgres.
 *   2. Finds every .upsert( under src/ (tests excluded), takes the table from
 *      the nearest .from('x') / fromUnknownTable('x') before it in the same
 *      statement, and skips calls with ignoreDuplicates: true, which compile
 *      to ON CONFLICT DO NOTHING and never update.
 *   3. Fails when a table with RLS enabled has no UPDATE or ALL policy.
 *
 * WHAT IT CAN'T SEE. Whether a migration was APPLIED: docs/RLS_AUDIT.md is
 * the production view. And a policy whose USING clause is false for the
 * caller. A table no migration mentions is reported but not failed:
 * check-unknown-tables and check-schema own that class.
 *
 * KNOWN lists upserts that were already broken when this landed. Each needs
 * a migration, not a code change; remove the entry when it lands. A new
 * entry is a decision, not a way to make the check pass.
 *
 *   node scripts/check-upsert-update-policy.mjs          # exit 1 on a new finding
 *   node scripts/check-upsert-update-policy.mjs --json
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** table -> why it is tolerated. Keep short; each one is a live 42501 on the second write. */
export const KNOWN = {};

const IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const QUALIFIED = String.raw`(?:${IDENT}\.)?${IDENT}`;

function unquote(name) {
  const last = name.split('.').pop() ?? name;
  return last.replace(/^"|"$/g, '').toLowerCase();
}

/**
 * Strip SQL comments and function bodies (`AS $tag$ ... $tag$`), whose
 * statements run when the function is called, not when the migration is.
 * DO blocks are kept: older migrations create policies inside
 * `DO $$ BEGIN IF NOT EXISTS ... CREATE POLICY ... END $$`, votes' INSERT
 * policy among them.
 */
export function stripSql(sql) {
  return sql
    .replace(/\bAS\s+\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/gi, "AS ''")
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ');
}

/**
 * Replay migration texts, in order, into table -> { rls, policies: Map<name, cmd> }.
 * @param {string[]} sqlTexts
 */
export function replayPolicies(sqlTexts) {
  /** @type {Map<string, { rls: boolean, policies: Map<string, string> }>} */
  const tables = new Map();
  const get = (t) => {
    if (!tables.has(t)) tables.set(t, { rls: false, policies: new Map() });
    return tables.get(t);
  };

  const stmtRe = new RegExp(
    [
      String.raw`CREATE\s+POLICY\s+(${IDENT})\s+ON\s+(${QUALIFIED})([^;]*)`,
      String.raw`DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?(${IDENT})\s+ON\s+(${QUALIFIED})`,
      String.raw`ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(${QUALIFIED})\s+(ENABLE|DISABLE)\s+ROW\s+LEVEL\s+SECURITY`,
      String.raw`DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(${QUALIFIED}(?:\s*,\s*${QUALIFIED})*)`,
      String.raw`ALTER\s+POLICY\s+(${IDENT})\s+ON\s+(${QUALIFIED})\s+RENAME\s+TO\s+(${IDENT})`,
    ].join('|'),
    'gi',
  );

  for (const raw of sqlTexts) {
    const sql = stripSql(raw);
    for (const m of sql.matchAll(stmtRe)) {
      if (m[1]) {
        const rest = m[3] ?? '';
        const cmd = /\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b/i.exec(rest)?.[1]?.toUpperCase() ?? 'ALL';
        get(unquote(m[2])).policies.set(unquote(m[1]), cmd);
      } else if (m[4]) {
        get(unquote(m[5])).policies.delete(unquote(m[4]));
      } else if (m[6]) {
        get(unquote(m[6])).rls = m[7].toUpperCase() === 'ENABLE';
      } else if (m[8]) {
        for (const t of m[8].split(',')) tables.delete(unquote(t.trim()));
      } else if (m[9]) {
        const entry = get(unquote(m[10]));
        const cmd = entry.policies.get(unquote(m[9]));
        if (cmd) {
          entry.policies.delete(unquote(m[9]));
          entry.policies.set(unquote(m[11]), cmd);
        }
      }
    }
  }
  return tables;
}

/** Does this table let an ON CONFLICT DO UPDATE through? */
export function allowsUpdate(entry) {
  if (!entry) return null;
  if (!entry.rls) return true;
  for (const cmd of entry.policies.values()) if (cmd === 'UPDATE' || cmd === 'ALL') return true;
  return false;
}

/**
 * The .upsert() calls in one source file: [{ table, line, ignoreDuplicates }].
 * @param {string} source
 */
export function findUpserts(source) {
  const found = [];
  const upsertRe = /\.upsert\s*\(/g;
  const fromRe = /(?:\.from|fromUnknownTable)\s*\(\s*(['"`])([A-Za-z0-9_]+)\1/g;
  for (const m of source.matchAll(upsertRe)) {
    const before = source.slice(Math.max(0, m.index - 400), m.index);
    // The same statement: nothing after the last `;` before the call.
    const stmt = before.slice(before.lastIndexOf(';') + 1);
    let table = null;
    for (const f of stmt.matchAll(fromRe)) table = f[2];
    // Options: the call's argument list, up to the matching close paren.
    let depth = 0;
    let end = m.index + m[0].length - 1;
    for (let i = end; i < source.length; i++) {
      const ch = source[i];
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const args = source.slice(m.index, end + 1);
    found.push({
      table,
      line: source.slice(0, m.index).split('\n').length,
      ignoreDuplicates: /ignoreDuplicates\s*:\s*true/.test(args),
    });
  }
  return found;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

export function run(root = process.cwd()) {
  const migDir = join(root, 'supabase/migrations');
  const migrations = readdirSync(migDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(migDir, f), 'utf8'));
  const tables = replayPolicies(migrations);

  const findings = [];
  const unknown = [];
  const unresolved = [];
  for (const file of walk(join(root, 'src'))) {
    const source = readFileSync(file, 'utf8');
    if (!source.includes('.upsert')) continue;
    for (const call of findUpserts(source)) {
      const where = `${relative(root, file)}:${call.line}`;
      if (call.ignoreDuplicates) continue;
      if (!call.table) {
        unresolved.push(where);
        continue;
      }
      const ok = allowsUpdate(tables.get(call.table.toLowerCase()));
      if (ok === null) unknown.push({ where, table: call.table });
      else if (!ok) findings.push({ where, table: call.table, known: call.table in KNOWN });
    }
  }
  return { findings, unknown, unresolved };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const { findings, unknown, unresolved } = run();
  const fresh = findings.filter((f) => !f.known);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ findings, unknown, unresolved }, null, 2));
  } else {
    for (const u of unknown) {
      console.log(`  note  ${u.where}  upsert on "${u.table}", which no migration creates policies for`);
    }
    for (const u of unresolved) console.log(`  note  ${u.where}  upsert whose table could not be read`);
    for (const f of findings.filter((x) => x.known)) {
      console.log(`  known ${f.where}  "${f.table}": ${KNOWN[f.table]}`);
    }
    for (const f of fresh) {
      console.log(
        `  FAIL  ${f.where}  upsert on "${f.table}", which has RLS and no FOR UPDATE policy. ` +
          'The first write works; every later one fails with 42501.',
      );
    }
  }
  if (fresh.length > 0) {
    console.error(`[upsert-update-policy] ${fresh.length} upsert(s) on a table with no UPDATE policy.`);
    process.exit(1);
  }
  if (!process.argv.includes('--json')) {
    console.log(`[upsert-update-policy] OK every browser upsert has an UPDATE policy (${findings.length} known).`);
  }
}

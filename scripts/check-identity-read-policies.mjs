#!/usr/bin/env node
/**
 * WEB-SEC-025 AC7: a public SELECT policy over a table that links a PERSON to
 * something they did.
 *
 * The `votes` table carries user_id and its only SELECT policy was
 * "Public read votes" ... USING (true), so anyone holding the anon key - which
 * ships in the client bundle - could enumerate who voted for what. A secret
 * ballot that anybody can read is not a secret ballot.
 *
 * THE POINT OF THIS FILE IS THAT NOTHING SWEPT FOR THE SHAPE. votes was found
 * incidentally. A one-off sweep on 2026-08-29 turned up eighteen tables with
 * the same policy over an identity column, and a sweep that ran once is a list
 * that starts going stale the next day.
 *
 * WHAT IT DOES NOT DO, deliberately: decide. Whether a check-in or a
 * helpful-vote is public is a product question per table, and several belong to
 * other stories. Every table found by that sweep is in the baseline, so the
 * check is quiet today. What it stops is the list GROWING - a new table
 * shipping with an identity column and a USING(true) read, which is how votes
 * got here.
 *
 * SIBLING CHECKS AND WHY THIS IS NOT ONE OF THEM:
 *   audit-rls.ts            parses the same migrations and flags permissive
 *                           WRITE policies and anon writes. It has no rule for
 *                           a permissive READ, which is this shape exactly.
 *   check-anon-exposure.ts  probes production for what the anon key can read.
 *                           It needs credentials and answers "is this table
 *                           readable", not "does this table link a person to a
 *                           private signal".
 *
 * OFFLINE. Reads supabase/migrations/*.sql (chronological, last-wins) and the
 * generated types for the column list. No network, no credentials.
 *
 * DYNAMIC SQL (WEB-SEC-054). A policy changed through EXECUTE format(...) in a
 * DO block is invisible to a regex over the file, and that blind spot cuts both
 * ways. 20260612000001_rls_audit_fixes.sql rescoped eight "Service role can
 * manage ..." policies to service_role in a FOREACH loop, so this check kept
 * reporting user_subscriptions as public after it was fixed; a loop going the
 * other way would have passed silently. expandDynamicPolicies() reads that
 * loop's idiom: an ARRAY of 'table:policy' strings split with
 * string_to_array(t, ':'), then format('... %I ON public.%I', parts[2],
 * parts[1]). Any other EXECUTE format(...) touching a policy is reported as
 * unreadable and FAILS the check, so the blind spot cannot reopen quietly.
 *
 *   node scripts/check-identity-read-policies.mjs           # check
 *   node scripts/check-identity-read-policies.mjs --write   # re-baseline
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const TYPES = join(ROOT, 'src', 'integrations', 'supabase', 'types.ts');
const BASELINE = join(ROOT, '.github', 'identity-read-baseline.json');
const WRITE = process.argv.includes('--write');

/**
 * A column that names a PERSON. user_id is the obvious one; the others appear
 * on this schema's join tables, where the person is the row's whole point.
 * host_user_id was missing until WEB-SEC-070, which is how swipe_sessions
 * (every group session's host, readable by anon) passed this check.
 */
const IDENTITY_COLUMNS = /^(user_id|host_user_id|voter_id|participant_id|author_id|actor|created_by|owner_id)$/;

function readBalanced(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return src.slice(open + 1);
}

/** CREATE POLICY statements, in file order. Same parse as audit-rls.ts. */
function parsePolicies(sql, file) {
  const out = [];
  const re =
    /CREATE\s+POLICY\s+(?:IF\s+NOT\s+EXISTS\s+)?("(?:[^"]+)"|[A-Za-z0-9_]+)\s+ON\s+([A-Za-z0-9_."]+)/gi;
  let m;
  while ((m = re.exec(sql))) {
    const name = m[1].replace(/"/g, '');
    const table = m[2].replace(/"/g, '').replace(/^public\./, '');
    let depth = 0;
    let end = sql.length;
    for (let i = re.lastIndex; i < sql.length; i++) {
      const c = sql[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ';' && depth === 0) { end = i; break; }
    }
    const body = sql.slice(re.lastIndex, end);
    const command = (body.match(/\bFOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\b/i)?.[1] ?? 'ALL').toUpperCase();
    const roles =
      body.match(/\bTO\s+([A-Za-z0-9_,\s]+?)(?:\bUSING\b|\bWITH\b|$)/i)?.[1].trim().replace(/\s+/g, ' ') ??
      'public';
    let using = null;
    const usingIdx = body.search(/\bUSING\s*\(/i);
    if (usingIdx >= 0) using = readBalanced(body, body.indexOf('(', usingIdx)).trim().replace(/\s+/g, ' ');
    out.push({ name, table, command, roles, using, file });
  }
  return out;
}

/** DROP POLICY, so a policy replaced by a later migration is not still counted. */
function parseDrops(sql) {
  const out = [];
  const re = /DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?("(?:[^"]+)"|[A-Za-z0-9_]+)\s+ON\s+([A-Za-z0-9_."]+)/gi;
  let m;
  while ((m = re.exec(sql))) {
    out.push({
      name: m[1].replace(/"/g, ''),
      table: m[2].replace(/"/g, '').replace(/^public\./, ''),
    });
  }
  return out;
}

/** Body of every DO block (between its dollar-quote tags). */
function doBlocks(sql) {
  const out = [];
  const re = /\bDO\s+(\$[A-Za-z0-9_]*\$)/gi;
  let m;
  while ((m = re.exec(sql))) {
    const tag = m[1];
    const start = re.lastIndex;
    const end = sql.indexOf(tag, start);
    if (end < 0) break;
    out.push(sql.slice(start, end));
    re.lastIndex = end + tag.length;
  }
  return out;
}

/** Quote an identifier the way format('%I') would, for the static parsers. */
const quoteIdent = (v) => `"${v.replace(/"/g, '""')}"`;

/**
 * Expand the policy statements a DO block runs through EXECUTE format(...)
 * into the static SQL they execute, so parseDrops/parsePolicies can read them.
 *
 * Understood: a FOREACH <var> IN ARRAY loop over string literals (inline
 * ARRAY[...] or a declared text[] := ARRAY[...]), whose format() arguments are
 * the loop variable itself (20260709000052, 'crm_leads') or pieces of it split
 * with string_to_array(<var>, ':') (20260612000001, 'table:policy'). The
 * template may be single- or dollar-quoted and use %I, %s, %L or positional
 * %1$s. Returns { sql, unreadable }: `sql` is the expanded statements ('' when
 * there are none); `unreadable` lists each dynamic policy statement that could
 * not be resolved. Anything outside the idiom is unreadable on purpose: a
 * guess would put a wrong answer into a security check.
 */
export function expandDynamicPolicies(sql) {
  const expanded = [];
  const unreadable = [];
  const IDENT = '[A-Za-z_][A-Za-z0-9_]*';
  const literals = (src) => [...src.matchAll(/'((?:[^']|'')*)'/g)].map((x) => x[1].replace(/''/g, "'"));

  for (const block of doBlocks(sql)) {
    const calls = [];
    const callRe = /\bEXECUTE\s+format\s*\(/gi;
    let c;
    while ((c = callRe.exec(block))) {
      const open = block.indexOf('(', c.index);
      const rest = block.slice(open + 1);
      // Template: '...' or $tag$...$tag$. The argument list follows it.
      const q = rest.match(/^\s*'((?:[^']|'')*)'/) ?? rest.match(/^\s*(\$[A-Za-z0-9_]*\$)([\s\S]*?)\1/);
      if (!q) {
        const args = readBalanced(block, open);
        // A template held in a variable cannot be read statically, so it is
        // flagged whenever the block mentions a policy at all.
        if (/\bPOLICY\b/i.test(block)) unreadable.push(`format(${args.trim().replace(/\s+/g, ' ').slice(0, 100)})`);
        continue;
      }
      const template = q.length === 2 ? q[1].replace(/''/g, "'") : q[2];
      if (!/\bPOLICY\b/i.test(template)) continue;
      const tail = readBalanced(`(${rest.slice(q[0].length)}`, 0);
      const params = tail.split(',').map((a) => a.trim()).filter(Boolean);
      calls.push({ template, params });
    }
    if (calls.length === 0) continue;

    const loop = block.match(new RegExp(`FOREACH\\s+(${IDENT})\\s+IN\\s+ARRAY\\s+(ARRAY\\s*\\[[^\\]]*\\]|${IDENT})`, 'i'));
    let rows = [];
    if (loop) {
      const source = /^ARRAY/i.test(loop[2])
        ? loop[2]
        : block.match(new RegExp(`\\b${loop[2]}\\s+text\\s*\\[\\s*\\]\\s*:=\\s*(ARRAY\\s*\\[[^\\]]*\\])`, 'i'))?.[1];
      if (source) rows = literals(source);
    }
    const split = loop
      ? block.match(new RegExp(`(${IDENT})\\s*:=\\s*string_to_array\\s*\\(\\s*${loop[1]}\\s*,\\s*'([^']*)'\\s*\\)`, 'i'))
      : null;

    /** The value one format() argument takes for one array element, or undefined. */
    const valueOf = (param, row) => {
      if (param === loop[1]) return row;
      const r = split && param.match(new RegExp(`^${split[1]}\\[(\\d+)\\]$`));
      return r ? row.split(split[2])[Number(r[1]) - 1] : undefined;
    };

    for (const { template, params } of calls) {
      const holes = [...template.matchAll(/%(?:(\d+)\$)?([IsL])/g)];
      const ok =
        rows.length > 0 &&
        holes.length > 0 &&
        holes.every((h, i) => (h[1] ? Number(h[1]) : i + 1) <= params.length) &&
        rows.every((row) => params.every((p) => valueOf(p, row)));
      if (!ok) {
        unreadable.push(template.trim().replace(/\s+/g, ' ').slice(0, 120));
        continue;
      }
      for (const row of rows) {
        let next = 0;
        const stmt = template.replace(/%(?:(\d+)\$)?([IsL])/g, (_, pos, kind) => {
          const v = valueOf(params[pos ? Number(pos) - 1 : next++], row);
          if (kind === 'I') return quoteIdent(v);
          if (kind === 'L') return `'${v.replace(/'/g, "''")}'`;
          return v;
        });
        expanded.push(`${stmt.trim().replace(/;$/, '')};`);
      }
    }
  }
  return { sql: expanded.join('\n'), unreadable };
}

/**
 * Replay migrations in order, last-wins per (table, policy), and return the
 * identity-bearing tables whose current policies let public/anon read rows.
 *
 * @param {{ file: string, sql: string }[]} migrations  sorted chronologically
 * @param {Set<string>} withIdentity  tables carrying an identity column
 */
export function computeExposure(migrations, withIdentity) {
  const current = new Map();
  const unreadable = [];
  for (const { file, sql } of migrations) {
    const dyn = expandDynamicPolicies(sql);
    for (const u of dyn.unreadable) unreadable.push(`${file}: ${u}`);
    // Static statements first, then the DO-block expansions. The one dynamic
    // case in the tree rescopes policies earlier files created; a file mixing
    // both for one policy would be ambiguous to a human reader too.
    const all = dyn.sql ? `${sql}\n${dyn.sql}` : sql;
    for (const d of parseDrops(all)) current.delete(`${d.table}|${d.name}`);
    for (const p of parsePolicies(all, file)) current.set(`${p.table}|${p.name}`, p);
  }

  const PUBLIC_ROLE = /\b(public|anon)\b/i;
  const exposed = new Set();
  const detail = [];
  for (const p of current.values()) {
    if (p.command !== 'SELECT' && p.command !== 'ALL') continue;
    if (!PUBLIC_ROLE.test(p.roles)) continue;
    if (p.using !== 'true') continue;
    if (!withIdentity.has(p.table)) continue;
    exposed.add(p.table);
    detail.push(`${p.table}  "${p.name}"  (${p.file})`);
  }
  return { current, exposed, detail, unreadable };
}

/** Tables that carry an identity column, read from the generated types. */
function identityTables() {
  if (!existsSync(TYPES)) return null;
  const src = readFileSync(TYPES, 'utf8');
  const tables = new Set();
  // Each table block starts `      <name>: {` and its Row block lists columns.
  const re = /^ {6}([a-z0-9_]+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/gm;
  let m;
  while ((m = re.exec(src))) {
    const [, table, rowBody] = m;
    for (const line of rowBody.split('\n')) {
      const col = line.trim().split(':')[0];
      if (IDENTITY_COLUMNS.test(col)) {
        tables.add(table);
        break;
      }
    }
  }
  return tables;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) main();

function main() {
  if (!existsSync(MIGRATIONS)) {
    console.error('[identity-read] supabase/migrations is missing - refusing to pass.');
    process.exit(1);
  }

  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();

  const withIdentity = identityTables();
  if (!withIdentity || withIdentity.size === 0) {
    console.error(
      '[identity-read] parsed no identity columns out of the generated types - refusing to pass.\n' +
        '  An empty set means the parse broke, not that the schema is clean.',
    );
    process.exit(1);
  }

  const { current, exposed, detail, unreadable } = computeExposure(
    files.map((file) => ({ file, sql: readFileSync(join(MIGRATIONS, file), 'utf8') })),
    withIdentity,
  );

  if (current.size === 0) {
    console.error('[identity-read] parsed no policies at all - refusing to pass on that.');
    process.exit(1);
  }

  if (unreadable.length > 0) {
    console.error('[identity-read] a migration changes a policy through dynamic SQL this check cannot read:\n');
    for (const u of unreadable) console.error(`  ${u}`);
    console.error(
      "\nA policy the parser cannot see is a grant nobody is checking. Write the\n" +
        "statement statically, or use the ARRAY['table:policy'] + string_to_array\n" +
        'idiom of 20260612000001_rls_audit_fixes.sql, which expandDynamicPolicies() reads.',
    );
    process.exit(1);
  }

  const tables = [...exposed].sort();

  if (WRITE) {
    writeFileSync(
      BASELINE,
      `${JSON.stringify(
        {
          _comment:
            'Tables carrying an identity column (user_id and friends) whose SELECT policy is USING(true) for public/anon - anyone with the bundled anon key can read who did what. WEB-SEC-025 AC7. Whether each is public BY DESIGN is a product decision per table, so this list is triage, not a vulnerability list. It must only ever SHRINK. Tightening one is a multi-release deprecation when a shipped mobile binary reads it (CLAUDE.md).',
          generated: new Date().toISOString().slice(0, 10),
          tables,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`[identity-read] baseline written: ${tables.length} table(s).`);
    process.exit(0);
  }

  if (!existsSync(BASELINE)) {
    console.error('[identity-read] no baseline. Run: node scripts/check-identity-read-policies.mjs --write');
    process.exit(1);
  }

  const known = new Set(JSON.parse(readFileSync(BASELINE, 'utf8')).tables ?? []);
  const added = tables.filter((t) => !known.has(t));

  console.log(
    `[identity-read] ${current.size} policies over ${withIdentity.size} identity-bearing table(s); ` +
      `${tables.length} readable by anyone (baseline ${known.size}).`,
  );

  if (added.length === 0) {
    const gone = [...known].filter((t) => !exposed.has(t));
    if (gone.length) console.log(`OK Down ${gone.length}: ${gone.join(', ')}. Re-baseline with --write.`);
    else console.log('OK No new table links a person to a signal anyone can read.');
    process.exit(0);
  }

  console.error('\nX A new table exposes who did what to anyone with the anon key:\n');
  for (const t of added) {
    for (const d of detail.filter((x) => x.startsWith(`${t}  `))) console.error(`  ${d}`);
  }
  console.error(
    '\nThe anon key ships in the client bundle, so USING(true) on a table with a\n' +
      'user_id means any visitor can enumerate who did what. Scope the SELECT to\n' +
      'the owner (auth.uid() = user_id) plus admins, and publish aggregates through\n' +
      'a SECURITY DEFINER function - voting_category_tallies() and\n' +
      'voting_results(uuid) are the worked example.\n' +
      '\nIf a shipped mobile binary already reads the table directly, that tightening\n' +
      'is a MULTI-RELEASE deprecation (CLAUDE.md): add the aggregate, migrate every\n' +
      'client, wait for MIN_SUPPORTED_APP_VERSION, then replace the policy.\n',
  );
  process.exit(1);
}

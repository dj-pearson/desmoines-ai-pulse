#!/usr/bin/env node
/**
 * Static audit for Supabase queries that reference a table, column, or RPC
 * which does not exist in the generated schema.
 *
 * WHY THIS EXISTS (WEB-QA-017)
 * PostgREST resolves table/column/function names at request time, so a query
 * naming something that isn't there is not a TypeScript error under this repo's
 * config — the Supabase client types accept a plain string for `.select()`, and
 * hooks routinely cast with `as unknown as` to silence the rest. The failure is
 * invisible: the request 400s with 42703 ("column does not exist"), the hook
 * falls into its catch, and the UI renders its empty state. Nobody sees a bug;
 * the feature simply never worked.
 *
 * This is not hypothetical. A single stale column (`archived_at` in
 * EVENT_LIST_COLUMNS, which lives on archived_events and never on events) took
 * the production homepage's entire events feed to zero rows, and stayed
 * undiagnosed because the error object was logged un-expanded. A subsequent
 * audit of every call site found 14 missing tables, ~30 missing RPCs, and a
 * dozen missing columns — whole modules (CRM, billing, session management,
 * trip-plan persistence) written against a schema that was never deployed.
 *
 * The generated types are the source of truth. If a name is absent there, the
 * query cannot succeed against the database those types were generated from.
 *
 * Deliberately conservative — it reports only what it can prove:
 *   - `.select('*')` and template-literal / variable selects are skipped
 *     (no literal column list to check).
 *   - Embedded resource syntax (`author:profiles(name)`) is parsed for the
 *     relation name but its inner columns are not walked.
 *   - Only `.from()` / `.rpc()` reached on a recognisable supabase client are
 *     considered, so `.from()` on storage buckets and other builders is ignored.
 *
 * Known-pending migrations can be allowlisted below so that code which is
 * correct-but-not-yet-deployed does not block CI.
 *
 * RATCHET: the existing violations are too numerous to fix in one pass, and
 * several need a product decision (write the missing migration, or delete the
 * dead UI?). So this runs as a ratchet, matching the strictNullChecks approach
 * already used in this repo: known findings are frozen in schema-baseline.json
 * and only NEW ones fail the build. Burn the baseline down over time; it must
 * never grow.
 *
 * Usage:
 *   node scripts/check-schema-usage.mjs            # ratchet against baseline
 *   node scripts/check-schema-usage.mjs --all      # report everything, ignore baseline
 *   node scripts/check-schema-usage.mjs --update   # re-freeze the baseline
 *   node scripts/check-schema-usage.mjs --json     # machine-readable
 * Exits 1 if any un-baselined reference is found.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = join(ROOT, 'src');

/**
 * Roots to scan. `src/` was the original scope, but limiting it there let a
 * real bug through: scripts/generate-dynamic-sitemaps.ts queries public.guides,
 * a table that does not exist, and has been failing on every build. Because the
 * generator logs the error and continues, the stale sitemap it failed to
 * rewrite kept shipping — no stack trace, no red build (WEB-SEO-003).
 *
 * Build scripts and edge functions are exactly where a schema mismatch does
 * damage quietly: nobody is watching a browser console, and the failure path is
 * usually a log line next to a `continue`.
 */
const SCAN_ROOTS = [
  SRC,
  join(ROOT, 'scripts'),
  join(ROOT, 'supabase', 'functions'),
];
const TYPES = join(SRC, 'integrations', 'supabase', 'types.ts');
const BASELINE = join(ROOT, 'schema-baseline.json');
const EXTENSIONS = ['.ts', '.tsx', '.mjs'];

/**
 * References that are correct in code but await an unapplied migration.
 * Each entry MUST cite the migration that resolves it. Remove the entry once
 * that migration is applied to production — a stale allowlist silently
 * re-opens the exact bug class this script exists to catch.
 *
 * Omit `column` to allowlist a whole table that the migration creates.
 */
const PENDING_MIGRATIONS = [
  { table: 'event_discussions', column: 'message_type', migration: '20260718000003' },
  { table: 'event_discussions', column: 'media_url', migration: '20260718000003' },
  // Menu scraper diagnostics. The scraper writes this best-effort inside a
  // try/catch, so a missing table degrades logging only — but the reference is
  // still real and must not be baselined as a permanent violation.
  { table: 'menu_scrape_attempts', migration: '20260730000001' },
  // Billing interval, needed so the trial-conversion notice can state the real
  // amount (WEB-LEGAL-006). Additive nullable column; readers must treat NULL
  // as "unknown" rather than assuming monthly.
  { table: 'user_subscriptions', column: 'billing_interval', migration: '20260817000001' },
];

const isPending = (table, column) =>
  PENDING_MIGRATIONS.some(
    (p) => p.table === table && (p.column === undefined || p.column === column),
  );

// ---------------------------------------------------------------------------
// Schema extraction
// ---------------------------------------------------------------------------

/**
 * Parse the generated types by indentation. The file is machine-generated and
 * rigidly formatted: `public:` at 2 spaces, section keys at 4, entity names at
 * 6, `Row:` at 8, and column names at 10.
 */
function parseSchema() {
  const lines = readFileSync(TYPES, 'utf8').split('\n');

  const tables = new Map(); // name -> Set<column>
  const functions = new Set();

  let section = null; // 'Tables' | 'Views' | 'Functions'
  let entity = null;
  let inRow = false;
  let seenPublic = false;

  for (const line of lines) {
    if (/^ {2}public: \{/.test(line)) {
      // The file declares `public` twice (Database, then the helper block).
      // Only the first carries the real definitions.
      if (seenPublic) break;
      seenPublic = true;
      continue;
    }
    if (!seenPublic) continue;

    const sectionMatch = /^ {4}(Tables|Views|Functions|Enums|CompositeTypes): \{/.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1];
      entity = null;
      inRow = false;
      continue;
    }

    // `name: {` OR a bare `name:` whose body starts on the next line. The
    // codegen emits OVERLOADED functions as a union:
    //       get_active_ads:
    //         | { Args: ...; Returns: ... }
    //         | { Args: ...; Returns: ... }
    // so requiring ` {` on the same line made every overloaded function
    // invisible, and this script then reported it as "no such function in
    // the generated schema". get_active_ads, fuzzy_search_events,
    // fuzzy_search_restaurants and calculate_campaign_pricing were all
    // baselined that way while existing in production the whole time.
    // \s*$ also tolerates the trailing CR of a CRLF checkout.
    const entityMatch = /^ {6}(\w+):(?: \{| *\r?$)/.exec(line);
    if (entityMatch) {
      entity = entityMatch[1];
      inRow = false;
      if (section === 'Functions') functions.add(entity);
      // Views expose a Row just like tables and are queryable via .from().
      if ((section === 'Tables' || section === 'Views') && !tables.has(entity)) {
        tables.set(entity, new Set());
      }
      continue;
    }

    if (section === 'Tables' || section === 'Views') {
      if (/^ {8}Row: \{/.test(line)) { inRow = true; continue; }
      if (inRow && /^ {8}\}/.test(line)) { inRow = false; continue; }
      if (inRow && entity) {
        const col = /^ {10}(\w+)\??:/.exec(line);
        if (col) tables.get(entity).add(col[1]);
      }
    }
  }

  return { tables, functions };
}

// ---------------------------------------------------------------------------
// Source scanning
// ---------------------------------------------------------------------------

/**
 * Blank out comments while preserving line structure. Deleting a block comment
 * outright collapses its newlines and shifts every reported line number after
 * it, which points reviewers at unrelated code (an interface declaration, say,
 * instead of the query 60 lines below).
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      walk(full, out);
    } else if (EXTENSIONS.some((e) => entry.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

const lineOf = (src, index) => src.slice(0, index).split('\n').length;

/**
 * Split a PostgREST select list on top-level commas, discarding embedded
 * resource bodies but remembering that an entry HAD one:
 *   `id, author:profiles(name), title`
 *     -> [{text:'id'}, {text:'author:profiles', embed:true}, {text:'title'}]
 *
 * The embed flag matters: the parens are consumed here, so `columnOf` can no
 * longer tell `author:profiles(name)` (a relation) from `author:profiles` (an
 * aliased column) on its own. Losing that distinction reports every embedded
 * resource as a missing column.
 */
function splitSelect(select) {
  const parts = [];
  let depth = 0;
  let current = '';
  let embed = false;
  for (const ch of select) {
    if (ch === '(') { depth++; embed = true; continue; }
    if (ch === ')') { depth--; continue; }
    if (ch === ',' && depth === 0) { parts.push({ text: current, embed }); current = ''; embed = false; continue; }
    if (depth === 0) current += ch;
  }
  parts.push({ text: current, embed });
  return parts
    .map((p) => ({ text: p.text.trim(), embed: p.embed }))
    .filter((p) => p.text);
}

/**
 * Extract the bare column name from one select entry, or null if this entry
 * cannot be statically checked (embed, wildcard, json path, cast, aggregate).
 */
/**
 * PostgREST aggregate keywords are valid in a select list but are not columns.
 * `select=count` on any table returns a row count, so flagging it as a missing
 * column is wrong (it is a common shape for health-check probes).
 */
const AGGREGATES = new Set(['count', 'sum', 'avg', 'min', 'max']);

function columnOf({ text: entry, embed }) {
  if (embed) return null;                    // embedded resource, not a column
  if (entry === '*') return null;
  if (AGGREGATES.has(entry)) return null;    // aggregate, not a column
  if (entry.includes('->')) return null;     // json path into a jsonb column
  if (entry.includes('!')) return null;      // explicit relationship hint
  // alias:column  ->  column
  const aliased = entry.includes(':') ? entry.slice(entry.indexOf(':') + 1) : entry;
  const bare = aliased.split('::')[0].trim(); // strip ::type cast
  return /^\w+$/.test(bare) ? bare : null;
}

function scanFile(file, schema, findings) {
  const raw = readFileSync(file, 'utf8');
  const src = stripComments(raw);
  const rel = relative(ROOT, file).replace(/\\/g, '/');

  // --- RPCs -------------------------------------------------------------
  for (const m of src.matchAll(/\.rpc[<(]\s*[<(]?\s*['"`](\w+)['"`]/g)) {
    const fn = m[1];
    if (!schema.functions.has(fn)) {
      findings.push({
        kind: 'rpc', file: rel, line: lineOf(src, m.index),
        name: fn, error: 'PGRST202 (function not found)',
        detail: `.rpc('${fn}') — no such function in the generated schema`,
      });
    }
  }

  // --- Tables and their chained columns ---------------------------------
  for (const m of src.matchAll(/\.from\(\s*['"`](\w+)['"`]\s*\)/g)) {
    const table = m[1];
    const line = lineOf(src, m.index);

    // `.from()` also exists on the storage client; only flag names we can
    // attribute to PostgREST. A name absent from the schema that is also
    // reached via `.storage` on the same line is skipped.
    const lineText = src.split('\n')[line - 1] ?? '';
    if (/\.storage\b/.test(lineText)) continue;

    if (!schema.tables.has(table)) {
      if (isPending(table)) continue;
      findings.push({
        kind: 'table', file: rel, line,
        name: table, error: '42P01 / PGRST205 (relation does not exist)',
        detail: `.from('${table}') — no such table or view in the generated schema`,
      });
      continue; // columns are unverifiable without a table
    }

    const columns = schema.tables.get(table);

    // Inspect the chained call segment following this `.from()`. Bounded to
    // the next `.from(` or end of statement-ish region to avoid bleeding into
    // an adjacent query.
    const rest = src.slice(m.index + m[0].length);
    const nextFrom = rest.search(/\.from\(\s*['"`]/);
    const segment = nextFrom === -1 ? rest.slice(0, 2000) : rest.slice(0, Math.min(nextFrom, 2000));

    const report = (col, at, api, error) => {
      if (columns.has(col)) return;
      if (isPending(table, col)) return;
      findings.push({
        kind: 'column', file: rel, line: lineOf(src, m.index + m[0].length + at),
        name: `${table}.${col}`, error,
        detail: `${api} references ${table}.${col}, which is not in the generated schema`,
      });
    };

    for (const s of segment.matchAll(/\.select\(\s*(['"`])([\s\S]*?)\1/g)) {
      for (const entry of splitSelect(s[2])) {
        const col = columnOf(entry);
        if (col) report(col, s.index, `.select('${entry.text}')`, '42703 (column does not exist)');
      }
    }

    for (const f of segment.matchAll(/\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|order)\(\s*['"`](\w+)['"`]/g)) {
      report(f[2], f.index, `.${f[1]}('${f[2]}')`, '42703 (column does not exist)');
    }

    // --- profiles: id is the row PK, user_id is the auth.users FK ----------
    //
    // WEB-SEC-023 AC4. public.profiles has BOTH. `id` defaults to its own uuid
    // and has nothing to do with auth; `user_id` is what auth.uid() matches.
    // Keying by `id` with a user id is a query that type-checks, passes this
    // script's column check, and quietly returns zero rows — which on an
    // authorization path means a real admin is denied. Four sites did exactly
    // that, three of them role lookups: useSecurityContext, security/middleware,
    // _shared/securityLayers and parse-menu-upload.
    //
    // Prose in a doc could not have caught those. This can.
    if (table === 'profiles') {
      for (const f of segment.matchAll(
        /\.(eq|in)\(\s*['"`]id['"`]\s*,\s*([^)]+?)\s*\)/g
      )) {
        const arg = f[2];
        // `user_id` is deliberately first. The original pattern used \buser\b,
        // which cannot match inside "user_id" — `_` is a word character, so
        // there is no boundary after "user". That is exactly the form a DB row
        // hands you, and it let .eq("id", campaign.user_id) through twice in
        // useAdminCampaigns.ts: a lookup that type-checks, passes the column
        // check above, and returns nothing, so the admin campaign list rendered
        // blank owner emails. A rule that misses the most common spelling of
        // the thing it guards is not a rule.
        if (!/user_id|\buser\b|\buserId\b|\bauthUser\b|\bsession\b|auth\.uid|\.user\.id/i.test(arg)) continue;
        findings.push({
          kind: 'profiles-key', file: rel,
          line: lineOf(src, m.index + m[0].length + f.index),
          name: 'profiles.id',
          error: 'wrong key (silently returns zero rows)',
          detail:
            `.${f[1]}('id', ${arg}) on profiles — profiles.id is the row PK, not the ` +
            `auth user id. Use .${f[1]}('user_id', ${arg}), or call isAdminUserId() ` +
            `from supabase/functions/_shared/apiKeyAuth.ts if this is a role check.`,
        });
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------

/**
 * Baseline identity deliberately excludes the line number: moving a query
 * around a file must not surface it as a new violation, but changing WHICH
 * table/column/function it names must.
 */
const fingerprint = (f) => `${f.kind}|${f.file}|${f.name}`;

function loadBaseline() {
  try {
    return new Set(JSON.parse(readFileSync(BASELINE, 'utf8')).findings);
  } catch {
    return new Set();
  }
}

function main() {
  const asJson = process.argv.includes('--json');
  const showAll = process.argv.includes('--all');
  const update = process.argv.includes('--update');
  const schema = parseSchema();

  if (schema.tables.size === 0) {
    console.error('check-schema-usage: parsed 0 tables from types.ts — the generated format likely changed.');
    process.exit(2);
  }

  const all = [];
  for (const root of SCAN_ROOTS) {
    if (!existsSync(root)) continue;
    for (const file of walk(root)) scanFile(file, schema, all);
  }

  if (update) {
    const fingerprints = [...new Set(all.map(fingerprint))].sort();
    writeFileSync(
      BASELINE,
      JSON.stringify(
        {
          $comment:
            'Known unresolvable Supabase references, frozen by scripts/check-schema-usage.mjs --update. ' +
            'This list must only ever SHRINK. Each entry is a feature that silently does nothing in production.',
          generated: all.length,
          findings: fingerprints,
        },
        null,
        2
      ) + '\n'
    );
    console.log(`check-schema-usage: baseline updated with ${fingerprints.length} known finding(s).`);
    process.exit(0);
  }

  const baseline = showAll ? new Set() : loadBaseline();
  const findings = all.filter((f) => !baseline.has(fingerprint(f)));

  if (asJson) {
    console.log(JSON.stringify({ findings, total: all.length, baselined: all.length - findings.length }, null, 2));
    process.exit(findings.length ? 1 : 0);
  }

  console.log(
    `check-schema-usage: ${schema.tables.size} tables/views, ${schema.functions.size} functions in generated schema.`
  );
  if (!showAll && baseline.size) {
    console.log(`${all.length - findings.length} known finding(s) suppressed by schema-baseline.json.`);
  }
  console.log('');

  if (findings.length === 0) {
    console.log('No NEW unresolvable Supabase references found.');
    if (!showAll && baseline.size) {
      console.log(`Baseline still holds ${baseline.size} finding(s) — run with --all to see them.`);
    }
    process.exit(0);
  }

  for (const kind of ['table', 'rpc', 'column', 'profiles-key']) {
    const group = findings.filter((f) => f.kind === kind);
    if (!group.length) continue;
    const label = {
      table: 'MISSING TABLES',
      rpc: 'MISSING RPCs',
      column: 'MISSING COLUMNS',
      'profiles-key': 'WRONG KEY ON profiles',
    }[kind];
    console.log(`${label} (${group.length})`);
    for (const f of group.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
      console.log(`  ${f.file}:${f.line}`);
      console.log(`    ${f.detail}`);
      console.log(`    -> ${f.error}`);
    }
    console.log('');
  }

  const tables = new Set(findings.filter((f) => f.kind === 'table').map((f) => f.name));
  const rpcs = new Set(findings.filter((f) => f.kind === 'rpc').map((f) => f.name));
  const cols = new Set(findings.filter((f) => f.kind === 'column').map((f) => f.name));
  const keys = findings.filter((f) => f.kind === 'profiles-key').length;
  console.log(
    `${findings.length} unresolvable reference(s): ` +
    `${tables.size} distinct table(s), ${rpcs.size} function(s), ${cols.size} column(s)` +
    `${keys ? `, ${keys} wrong-key query(ies)` : ''}.`
  );
  console.log('Each one fails silently at runtime. See the header of this script.');
  process.exit(1);
}

main();

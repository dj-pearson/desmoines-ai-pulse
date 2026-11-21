#!/usr/bin/env node
/**
 * Every view in public runs as its caller (WEB-SEC-081).
 *
 * A Postgres view checks permissions and RLS as its OWNER unless
 * security_invoker is on. Migrations run as a role RLS does not stop, and
 * Supabase grants every new public view to anon, so a view written the
 * ordinary way hands the anon key whatever the tables underneath it hold.
 * 20260511000000_fix_security_lints.sql fixed the seven views that existed
 * then. Eight more were written afterwards with neither security_invoker nor a
 * REVOKE, including agent_tasks_overdue (`SELECT t.*` over admin-only
 * agent_tasks, payload and all), and nothing noticed for six months, because
 * the sibling checks only read tables.
 *
 * WHAT IT DOES. Replays supabase/migrations/*.sql in order and tracks each
 * public view's security_invoker:
 *   CREATE [OR REPLACE] VIEW ... [WITH (security_invoker = on)] AS
 *       sets it from the WITH clause, and OFF without one. CREATE OR REPLACE
 *       resets a view's options in Postgres (checked in PGlite 17.5), so
 *       redefining a fixed view without the WITH clause turns the fix off
 *       again. That is the regression this check exists for.
 *   ALTER VIEW [IF EXISTS] v SET (security_invoker = on|off)   sets it
 *   ALTER VIEW [IF EXISTS] v RESET (security_invoker)          turns it off
 *   ALTER VIEW [IF EXISTS] v RENAME TO w                        moves it
 *   DROP VIEW [IF EXISTS] v[, ...]                              forgets it
 * and fails on any view still defined without it at the end.
 *
 * THE ESCAPE HATCH. A view that must expose an aggregate to anon on purpose
 * (a public count, say) can stay definer if the line directly above its
 * CREATE carries
 *     -- view-security-definer-ok: <why anon may read every row of this>
 * with a reason. The marker applies to that CREATE only; a later CREATE OR
 * REPLACE needs its own.
 *
 * NOT CHECKED, deliberately: materialized views (RLS does not apply to them;
 * a GRANT decides who reads one) and views outside public (PostgREST does not
 * expose them). A CREATE VIEW built inside dynamic SQL (EXECUTE '...') is
 * invisible here; none exists today.
 *
 *   node scripts/check-view-security-invoker.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MARKER = /--\s*view-security-definer-ok:\s*(\S.*)$/;

const IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][\w$]*)`;
const QNAME = String.raw`(${IDENT}(?:\s*\.\s*${IDENT})?)`;

const CREATE_RE = new RegExp(
  String.raw`\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:TEMP|TEMPORARY)\s+)?(?:RECURSIVE\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?` +
    QNAME +
    String.raw`(?:\s*\([^)]*\))?\s*(?:WITH\s*\(([^)]*)\))?\s*AS\b`,
  'gi',
);
const ALTER_SET_RE = new RegExp(
  String.raw`\bALTER\s+VIEW\s+(?:IF\s+EXISTS\s+)?` + QNAME + String.raw`\s+SET\s*\(([^)]*)\)`,
  'gi',
);
const ALTER_RESET_RE = new RegExp(
  String.raw`\bALTER\s+VIEW\s+(?:IF\s+EXISTS\s+)?` + QNAME + String.raw`\s+RESET\s*\(([^)]*)\)`,
  'gi',
);
const ALTER_RENAME_RE = new RegExp(
  String.raw`\bALTER\s+VIEW\s+(?:IF\s+EXISTS\s+)?` + QNAME + String.raw`\s+RENAME\s+TO\s+(${IDENT})`,
  'gi',
);
const DROP_RE = /\bDROP\s+VIEW\s+(?:IF\s+EXISTS\s+)?([^;]+?)\s*(?:\bCASCADE\b|\bRESTRICT\b)?\s*;/gi;

/** "public"."Foo" -> public.Foo; bare names land in public. */
export function normalizeName(raw) {
  const parts = raw.split('.').map((p) => {
    const t = p.trim();
    return t.startsWith('"') ? t.slice(1, -1) : t.toLowerCase();
  });
  return parts.length === 1 ? `public.${parts[0]}` : `${parts[0]}.${parts[1]}`;
}

/**
 * security_invoker from an option list like `security_invoker = on, foo = 1`:
 * true, false, or undefined when the list does not mention it.
 */
export function invokerOption(list) {
  const m = /\bsecurity_invoker\b\s*(?:=\s*'?(\w+)'?)?/i.exec(list ?? '');
  if (!m) return undefined;
  if (m[1] === undefined) return true; // bare boolean option means true
  return /^(on|true|1|yes|t|y)$/i.test(m[1]);
}

/**
 * The SQL with comments blanked to spaces (newlines kept), so offsets still
 * map to line numbers and a commented-out CREATE VIEW is not a definition.
 */
export function blankComments(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (two === '--') {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
    } else if (two === '/*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      out += sql.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (sql[i] === "'") {
      // Keep string literals whole so a '--' inside one is not a comment.
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j++;
      }
      out += sql.slice(i, j + 1);
      i = j + 1;
    } else {
      out += sql[i];
      i++;
    }
  }
  return out;
}

function lineAt(text, offset) {
  let n = 1;
  for (let i = 0; i < offset; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

/** The marker reason on the line directly above `line` (1-based), if any. */
function markerAbove(rawLines, line) {
  const above = rawLines[line - 2];
  if (above === undefined) return null;
  const m = MARKER.exec(above.trim());
  return m ? m[1].trim() : null;
}

/** Statement events in one file, in file order. */
export function fileEvents(name, raw) {
  const sql = blankComments(raw);
  const rawLines = raw.split('\n');
  const events = [];
  for (const m of sql.matchAll(CREATE_RE)) {
    const line = lineAt(sql, m.index);
    events.push({
      at: m.index,
      kind: 'create',
      view: normalizeName(m[1]),
      invoker: invokerOption(m[2]) === true,
      allowed: markerAbove(rawLines, line),
      where: `${name}:${line}`,
    });
  }
  for (const m of sql.matchAll(ALTER_SET_RE)) {
    const v = invokerOption(m[2]);
    if (v !== undefined) events.push({ at: m.index, kind: 'set', view: normalizeName(m[1]), invoker: v });
  }
  for (const m of sql.matchAll(ALTER_RESET_RE)) {
    if (invokerOption(m[2]) !== undefined) events.push({ at: m.index, kind: 'set', view: normalizeName(m[1]), invoker: false });
  }
  for (const m of sql.matchAll(ALTER_RENAME_RE)) {
    const from = normalizeName(m[1]);
    const to = `${from.split('.')[0]}.${normalizeName(m[2]).split('.')[1]}`;
    events.push({ at: m.index, kind: 'rename', view: from, to });
  }
  for (const m of sql.matchAll(DROP_RE)) {
    for (const part of m[1].split(',')) {
      if (part.trim()) events.push({ at: m.index, kind: 'drop', view: normalizeName(part) });
    }
  }
  return events.sort((a, b) => a.at - b.at);
}

/**
 * Replays the files (already in apply order) and returns the public views
 * that end up without security_invoker and without a marker.
 */
export function analyze(files) {
  const views = new Map();
  for (const { name, text } of files) {
    for (const e of fileEvents(name, text)) {
      if (e.kind === 'create') {
        views.set(e.view, { invoker: e.invoker, allowed: e.allowed, where: e.where });
      } else if (e.kind === 'set') {
        const v = views.get(e.view);
        if (v) v.invoker = e.invoker;
      } else if (e.kind === 'rename') {
        const v = views.get(e.view);
        if (v) {
          views.delete(e.view);
          views.set(e.to, v);
        }
      } else if (e.kind === 'drop') {
        views.delete(e.view);
      }
    }
  }
  const offenders = [];
  const allowed = [];
  for (const [view, v] of views) {
    if (!view.startsWith('public.')) continue;
    if (v.invoker) continue;
    if (v.allowed) allowed.push({ view, where: v.where, reason: v.allowed });
    else offenders.push({ view, where: v.where });
  }
  offenders.sort((a, b) => a.view.localeCompare(b.view));
  return { views: views.size, offenders, allowed };
}

export function loadMigrations(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({ name: f, text: readFileSync(join(dir, f), 'utf8') }));
}

function main() {
  const dir = join(process.cwd(), 'supabase', 'migrations');
  if (!existsSync(dir)) {
    console.error('[view-security-invoker] run from the repo root (no supabase/migrations here).');
    process.exit(1);
  }
  const files = loadMigrations(dir);
  const { views, offenders, allowed } = analyze(files);
  if (views === 0) {
    // A scan that finds no views at all has stopped parsing; that is not a pass.
    console.error('[view-security-invoker] found 0 views in supabase/migrations. That is not a pass.');
    process.exit(1);
  }
  if (offenders.length) {
    console.error(`[view-security-invoker] ${offenders.length} public view(s) run with the owner's rights and skip RLS:`);
    for (const o of offenders) console.error(`  X ${o.view}  (last defined ${o.where})`);
    console.error(
      '\nAdd `WITH (security_invoker = on)` to the CREATE VIEW, or follow it with\n' +
        '`ALTER VIEW <name> SET (security_invoker = on);`. CREATE OR REPLACE resets\n' +
        'the option, so a redefinition needs it again. If anon must read every row\n' +
        'on purpose, put `-- view-security-definer-ok: <reason>` on the line above.',
    );
    process.exit(1);
  }
  const note = allowed.length ? `; ${allowed.length} definer by decision (${allowed.map((a) => a.view).join(', ')})` : '';
  console.log(`[view-security-invoker] ${views} views tracked; every public view runs as its caller${note}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();

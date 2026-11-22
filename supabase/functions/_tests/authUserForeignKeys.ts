/**
 * Every foreign key from a public table to auth.users or public.profiles, as
 * the migrations leave it (WEB-LEGAL-015).
 *
 * Account deletion ends with auth.admin.deleteUser, which is a DELETE on
 * auth.users. A referencing column with no ON DELETE clause (NO ACTION) or
 * with RESTRICT makes that DELETE fail with 23503 after the edge function has
 * already purged the profile, the storage and the Stripe customer, so the user
 * is left with a live login and nothing behind it. contact_submissions.user_id
 * did exactly that for anyone who used the contact form signed in.
 *
 * This replays supabase/migrations in filename order, which is the order the
 * migrator applies them, and keeps a small model: tables, their columns, which
 * columns are NOT NULL, their CHECK constraints and their foreign keys to the
 * two user tables. It understands the DDL the repo actually uses (CREATE TABLE
 * [IF NOT EXISTS], ALTER TABLE ADD/DROP COLUMN, ADD/DROP CONSTRAINT, ALTER
 * COLUMN DROP/SET NOT NULL, RENAME TO, DROP TABLE) and the
 * pg_temp.set_user_fk_action(table, column, action) calls in
 * 20261122000030_user_fk_on_delete.sql (which only replace NO ACTION and
 * RESTRICT) and the pg_temp.change_fk_action calls in 20261122000060 (which
 * replace any action). It is a model, not Postgres: a
 * statement it cannot read is skipped, which is why the test that uses it also
 * asserts the model found the FKs it is known to contain.
 */

export type OnDelete = "NO ACTION" | "RESTRICT" | "CASCADE" | "SET NULL" | "SET DEFAULT";

export interface UserFk {
  table: string;
  column: string;
  /** "auth.users" or "profiles" */
  target: string;
  targetColumn: string;
  onDelete: OnDelete;
  constraint: string;
  /** the migration that last set this FK's action */
  file: string;
}

export interface TableModel {
  columns: Set<string>;
  notNull: Set<string>;
  /** constraint name -> CHECK expression */
  checks: Map<string, string>;
  fks: Map<string, UserFk>;
}

export type Model = Map<string, TableModel>;

const MIGRATIONS = new URL("../../migrations/", import.meta.url);

export async function readMigrations(): Promise<{ file: string; sql: string }[]> {
  const files: string[] = [];
  for await (const e of Deno.readDir(MIGRATIONS)) {
    if (e.isFile && e.name.endsWith(".sql")) files.push(e.name);
  }
  files.sort();
  const out: { file: string; sql: string }[] = [];
  for (const file of files) {
    out.push({ file, sql: await Deno.readTextFile(new URL(file, MIGRATIONS)) });
  }
  return out;
}

/** Comments out, string literals kept (a ';' inside one must not split). */
function stripComments(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'") {
      const end = skipQuote(sql, i);
      out += sql.slice(i, end);
      i = end;
    } else if (c === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
    } else if (c === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end < 0 ? sql.length : end + 2;
      out += " ";
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function skipQuote(sql: string, i: number): number {
  let j = i + 1;
  while (j < sql.length) {
    if (sql[j] === "'") {
      if (sql[j + 1] === "'") {
        j += 2;
        continue;
      }
      return j + 1;
    }
    j++;
  }
  return j;
}

/**
 * Split at ';' outside quotes and parentheses. Dollar-quoted bodies are NOT
 * opaque on purpose: DDL inside DO $$ ... $$ blocks is real DDL, and splitting
 * it at its own semicolons is what lets the scanner below see it.
 */
function statements(sql: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'") {
      i = skipQuote(sql, i);
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === ";" && depth === 0) {
      out.push(sql.slice(start, i));
      start = i + 1;
    }
    i++;
  }
  out.push(sql.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Split at commas outside parentheses and quotes. */
function topLevelCommas(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "'") {
      i = skipQuote(s, i);
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
    i++;
  }
  out.push(s.slice(start));
  return out.map((x) => x.trim()).filter(Boolean);
}

/** The text inside the parenthesis that opens at `open`. */
function balanced(s: string, open: number): string {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "'") {
      i = skipQuote(s, i) - 1;
      continue;
    }
    if (s[i] === "(") depth++;
    else if (s[i] === ")") {
      depth--;
      if (depth === 0) return s.slice(open + 1, i);
    }
  }
  return s.slice(open + 1);
}

const IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][\w$]*)`;
const QNAME = String.raw`${IDENT}(?:\s*\.\s*${IDENT})?`;

function unquote(s: string): string {
  return s.replace(/"/g, "").replace(/\s+/g, "").toLowerCase();
}

/** public.x -> x; other schemas keep their prefix (and are ignored). */
function tableName(raw: string): string {
  const n = unquote(raw);
  return n.startsWith("public.") ? n.slice(7) : n;
}

function isPublic(name: string): boolean {
  return !name.includes(".");
}

/** The referenced table: "auth.users", or a public table without its schema. */
function fkTarget(raw: string): string {
  const n = unquote(raw);
  return n.startsWith("public.") ? n.slice(7) : n;
}

/** The two tables an account deletion removes rows from directly. */
export const USER_TABLES: readonly string[] = ["auth.users", "profiles"];

const ON_DELETE = /\bON\s+DELETE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)\b/i;

function onDeleteOf(fragment: string): OnDelete {
  const m = ON_DELETE.exec(fragment);
  return (m ? m[1].replace(/\s+/g, " ").toUpperCase() : "NO ACTION") as OnDelete;
}

const REFERENCES = new RegExp(String.raw`\bREFERENCES\s+(${QNAME})\s*(?:\(\s*(${IDENT})\s*\))?`, "i");

function defaultFkName(table: string, column: string): string {
  return `${table}_${column}_fkey`.slice(0, 63);
}

function newTable(): TableModel {
  return { columns: new Set(), notNull: new Set(), checks: new Map(), fks: new Map() };
}

/** A column definition: name, NOT NULL, and an inline FK or CHECK. */
function applyColumnDef(table: string, t: TableModel, def: string, file: string) {
  const m = new RegExp(`^(${IDENT})\\s+(.*)$`, "is").exec(def);
  if (!m) return;
  const col = unquote(m[1]);
  const rest = m[2];
  t.columns.add(col);
  if (/\bNOT\s+NULL\b/i.test(rest) || /\bPRIMARY\s+KEY\b/i.test(rest)) t.notNull.add(col);
  const check = /\bCHECK\s*\(/i.exec(rest);
  if (check) t.checks.set(`${table}_${col}_check`.slice(0, 63), balanced(rest, check.index + check[0].length - 1));
  const ref = REFERENCES.exec(rest);
  if (ref) {
    const target = fkTarget(ref[1]);
    {
      const name = defaultFkName(table, col);
      t.fks.set(name, {
        table,
        column: col,
        target,
        targetColumn: ref[2] ? unquote(ref[2]) : "id",
        onDelete: onDeleteOf(rest.slice(ref.index)),
        constraint: name,
        file,
      });
    }
  }
}

/** CONSTRAINT x FOREIGN KEY (...) / CHECK (...), table-level. */
function applyTableConstraint(table: string, t: TableModel, def: string, file: string): boolean {
  const named = new RegExp(`^CONSTRAINT\\s+(${IDENT})\\s+(.*)$`, "is").exec(def);
  const name = named ? unquote(named[1]) : null;
  const body = named ? named[2] : def;
  const fk = new RegExp(`^FOREIGN\\s+KEY\\s*\\(([^)]*)\\)\\s*(.*)$`, "is").exec(body);
  if (fk) {
    const cols = fk[1].split(",").map(unquote);
    const ref = REFERENCES.exec(fk[2]);
    if (ref && cols.length === 1) {
      const target = fkTarget(ref[1]);
      {
        const cname = name ?? defaultFkName(table, cols[0]);
        if (t.fks.has(cname)) return true; // re-adding an existing name errors, and the repo wraps those in duplicate_object handlers
        t.fks.set(cname, {
          table,
          column: cols[0],
          target,
          targetColumn: ref[2] ? unquote(ref[2]) : "id",
          onDelete: onDeleteOf(fk[2]),
          constraint: cname,
          file,
        });
      }
    }
    return true;
  }
  const check = /^CHECK\s*\(/i.exec(body);
  if (check) {
    t.checks.set(name ?? `${table}_check_${t.checks.size}`, balanced(body, check[0].length - 1));
    return true;
  }
  return /^(CONSTRAINT|PRIMARY\s+KEY|UNIQUE|EXCLUDE|LIKE)\b/i.test(def);
}

const CREATE_TABLE = new RegExp(
  String.raw`\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(IF\s+NOT\s+EXISTS\s+)?(${QNAME})\s*\(`,
  "i",
);
const ALTER_TABLE = new RegExp(
  String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(${QNAME})\s+([\s\S]*)$`,
  "i",
);
const DROP_TABLE = /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([\w."\s,]+?)(?:\s+(?:CASCADE|RESTRICT))?\s*$/i;
const SET_ACTION = /pg_temp\.set_user_fk_action\(\s*'(\w+)'\s*,\s*'(\w+)'\s*,\s*'(CASCADE|SET NULL)'\s*\)/gi;
/** 20261122000060: the same call, but it replaces whatever action the FK had. */
const CHANGE_ACTION = /pg_temp\.change_fk_action\(\s*'(\w+)'\s*,\s*'(\w+)'\s*,\s*'(CASCADE|SET NULL)'\s*\)/gi;

function applyAlter(model: Model, table: string, rest: string, file: string) {
  const t = model.get(table);
  if (!t) return;
  const rename = new RegExp(`^RENAME\\s+TO\\s+(${IDENT})`, "i").exec(rest);
  if (rename) {
    const to = unquote(rename[1]);
    model.delete(table);
    model.set(to, t);
    for (const fk of t.fks.values()) fk.table = to;
    return;
  }
  const renameCol = new RegExp(`^RENAME\\s+(?:COLUMN\\s+)?(${IDENT})\\s+TO\\s+(${IDENT})`, "i").exec(rest);
  if (renameCol) {
    const from = unquote(renameCol[1]);
    const to = unquote(renameCol[2]);
    if (t.columns.delete(from)) t.columns.add(to);
    if (t.notNull.delete(from)) t.notNull.add(to);
    for (const fk of t.fks.values()) if (fk.column === from) fk.column = to;
    return;
  }
  for (const clause of topLevelCommas(rest)) {
    let m: RegExpExecArray | null;
    if ((m = new RegExp(`^ADD\\s+COLUMN\\s+(IF\\s+NOT\\s+EXISTS\\s+)?(.*)$`, "is").exec(clause))) {
      const col = unquote(new RegExp(`^(${IDENT})`).exec(m[2])?.[1] ?? "");
      // ADD COLUMN IF NOT EXISTS on an existing column is skipped WHOLE,
      // including any REFERENCES in it.
      if (m[1] && t.columns.has(col)) continue;
      applyColumnDef(table, t, m[2], file);
    } else if ((m = /^ADD\s+(.*)$/is.exec(clause))) {
      if (!applyTableConstraint(table, t, m[1], file)) applyColumnDef(table, t, m[1], file);
    } else if ((m = new RegExp(`^DROP\\s+CONSTRAINT\\s+(?:IF\\s+EXISTS\\s+)?(${IDENT})`, "i").exec(clause))) {
      const name = unquote(m[1]);
      t.fks.delete(name);
      t.checks.delete(name);
    } else if ((m = new RegExp(`^DROP\\s+(?:COLUMN\\s+)?(?:IF\\s+EXISTS\\s+)?(${IDENT})`, "i").exec(clause))) {
      const col = unquote(m[1]);
      t.columns.delete(col);
      t.notNull.delete(col);
      for (const [k, fk] of t.fks) if (fk.column === col) t.fks.delete(k);
    } else if ((m = new RegExp(`^ALTER\\s+(?:COLUMN\\s+)?(${IDENT})\\s+(DROP|SET)\\s+NOT\\s+NULL`, "i").exec(clause))) {
      const col = unquote(m[1]);
      if (m[2].toUpperCase() === "DROP") t.notNull.delete(col);
      else t.notNull.add(col);
    }
  }
}

/** Replay every migration and return the final model. */
export function buildModel(migrations: { file: string; sql: string }[]): Model {
  const model: Model = new Map();
  for (const { file, sql } of migrations) {
    for (const stmt of statements(stripComments(sql))) {
      let m: RegExpExecArray | null;
      if ((m = CREATE_TABLE.exec(stmt))) {
        const name = tableName(m[2]);
        if (!isPublic(name)) continue;
        if (m[1] && model.has(name)) continue; // IF NOT EXISTS on an existing table is a no-op
        const t = newTable();
        model.set(name, t);
        const body = balanced(stmt, m.index + m[0].length - 1);
        for (const def of topLevelCommas(body)) {
          if (!applyTableConstraint(name, t, def, file)) applyColumnDef(name, t, def, file);
        }
        continue;
      }
      if ((m = ALTER_TABLE.exec(stmt))) {
        const name = tableName(m[1]);
        if (isPublic(name)) applyAlter(model, name, m[2].trim(), file);
        continue;
      }
      if ((m = DROP_TABLE.exec(stmt))) {
        for (const raw of m[1].split(",")) model.delete(tableName(raw.trim()));
        continue;
      }
    }
    for (const call of sql.matchAll(SET_ACTION)) {
      const t = model.get(call[1].toLowerCase());
      if (!t) continue;
      const col = call[2].toLowerCase();
      for (const fk of t.fks.values()) {
        if (fk.column !== col || (fk.onDelete !== "NO ACTION" && fk.onDelete !== "RESTRICT")) continue;
        fk.onDelete = call[3].toUpperCase() as OnDelete;
        fk.file = file;
        if (fk.onDelete === "SET NULL") t.notNull.delete(col);
      }
    }
    for (const call of sql.matchAll(CHANGE_ACTION)) {
      const t = model.get(call[1].toLowerCase());
      if (!t) continue;
      const col = call[2].toLowerCase();
      for (const fk of t.fks.values()) {
        if (fk.column !== col) continue;
        fk.onDelete = call[3].toUpperCase() as OnDelete;
        fk.file = file;
      }
    }
  }
  return model;
}

export function allFks(model: Model): UserFk[] {
  const out: UserFk[] = [];
  for (const t of model.values()) out.push(...t.fks.values());
  return out.sort((a, b) => `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`));
}

/**
 * Tables that can lose rows when an auth user is deleted: auth.users,
 * profiles, and everything that reaches them through ON DELETE CASCADE. A FK
 * into any of these is a FK the account deletion has to get past.
 */
export function deletedOnAccountDeletion(model: Model): Set<string> {
  const out = new Set<string>(USER_TABLES);
  let grew = true;
  while (grew) {
    grew = false;
    for (const fk of allFks(model)) {
      if (fk.onDelete === "CASCADE" && out.has(fk.target) && !out.has(fk.table)) {
        out.add(fk.table);
        grew = true;
      }
    }
  }
  return out;
}

/** Every FK into a table that account deletion removes rows from. */
export function fksIntoDeletedRows(model: Model): UserFk[] {
  const deleted = deletedOnAccountDeletion(model);
  return allFks(model).filter((fk) => deleted.has(fk.target));
}

export function blocks(fk: UserFk): boolean {
  return fk.onDelete === "NO ACTION" || fk.onDelete === "RESTRICT";
}

/** CHECK expressions on `table` that name `column`. */
export function checksNaming(t: TableModel, column: string): string[] {
  const re = new RegExp(`\\b${column}\\b`, "i");
  return [...t.checks.values()].filter((c) => re.test(c));
}

// Run with:
//   deno test --allow-read --allow-net --allow-env --allow-sys supabase/functions/_tests/user-fk-on-delete.test.ts
//
// WEB-LEGAL-015. Account deletion ends with auth.admin.deleteUser, a DELETE on
// auth.users. Any FK into a row that delete removes, with NO ACTION or
// RESTRICT, fails it with 23503 after delete-user-account has already purged
// the profile, the files and the Stripe customer. contact_submissions.user_id
// did that for every user who sent the contact form signed in; deal_redemptions
// did it with a SET NULL its own CHECK refused (23514).
//
// Two halves. The static half replays supabase/migrations and fails when a FK
// into a deleted row blocks, or when a SET NULL lands on a NOT NULL or CHECKed
// column. The PGlite half builds every one of those tables as the migrations
// before 20261122000030 leave them, gives one user a row in each, runs the
// migration, and deletes the user.

import { strict as assert } from "node:assert";
import * as pglite from "npm:@electric-sql/pglite@0.3.15";
import {
  blocks,
  buildModel,
  checksNaming,
  deletedOnAccountDeletion,
  fksIntoDeletedRows,
  type Model,
  readMigrations,
  type UserFk,
} from "./authUserForeignKeys.ts";

interface PGlite {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
const PGlite = (pglite as unknown as { PGlite: new () => PGlite }).PGlite;

const FIX = "20261122000030_user_fk_on_delete.sql";

/**
 * SET NULL into a column a CHECK names is allowed only here, with the reason
 * the CHECK still passes. Anything else in that shape fails the suite.
 */
const CHECKED_SET_NULL: Record<string, string> = {
  "deal_redemptions.user_id":
    "deal_redemptions_mark_erased stamps subject_erased_at when user_id goes NULL, and the CHECK accepts it",
};

const migrations = await readMigrations();
const before = buildModel(migrations.filter((m) => m.file < FIX));
const after = buildModel(migrations);

/** What would stop an auth.users DELETE, in plain words, one line each. */
function problems(model: Model): string[] {
  const out: string[] = [];
  for (const fk of fksIntoDeletedRows(model)) {
    const t = model.get(fk.table)!;
    const key = `${fk.table}.${fk.column}`;
    if (blocks(fk)) {
      out.push(`${key} -> ${fk.target} is ${fk.onDelete} (${fk.file}); give it ON DELETE CASCADE or SET NULL`);
    } else if (fk.onDelete === "SET NULL" && t.notNull.has(fk.column)) {
      out.push(`${key} is SET NULL into a NOT NULL column (${fk.file}); the delete fails with 23502`);
    } else if (fk.onDelete === "SET NULL" && checksNaming(t, fk.column).length > 0 && !(key in CHECKED_SET_NULL)) {
      out.push(`${key} is SET NULL and a CHECK names it (${checksNaming(t, fk.column).join(" | ")}); the delete may fail with 23514`);
    }
  }
  return out;
}

// --------------------------------------------------------------------- static

Deno.test("the replay found the FKs this story is about, as they were", () => {
  const fks = fksIntoDeletedRows(before);
  assert(fks.length > 100, `expected well over 100 FKs into user rows, parsed ${fks.length}`);
  const cs = fks.find((f) => f.table === "contact_submissions" && f.column === "user_id");
  assert.equal(cs?.onDelete, "NO ACTION", "contact_submissions.user_id was declared with no ON DELETE");
  const dr = fks.find((f) => f.table === "deal_redemptions" && f.column === "user_id");
  assert.equal(dr?.onDelete, "SET NULL");
  assert.match(checksNaming(before.get("deal_redemptions")!, "user_id").join(), /session_hash IS NOT NULL/);
  // Already correct before this story, so the replay is reading actions, not
  // defaulting everything to NO ACTION.
  assert.equal(
    fks.find((f) => f.table === "business_profiles" && f.column === "user_id")?.onDelete,
    "CASCADE",
  );
});

Deno.test("before the fix the checker names the blockers (the counter-assertion)", () => {
  const p = problems(before);
  assert(p.some((l) => l.startsWith("contact_submissions.user_id ")), p.join("\n"));
  assert(p.some((l) => l.startsWith("system_events.user_id ")), p.join("\n"));
  assert(p.some((l) => l.startsWith("geofence_events.user_id ")), p.join("\n"));
  assert(p.length >= 46, `expected at least 46 blocking FKs before the fix, found ${p.length}`);
});

Deno.test("after every migration, nothing stops an auth.users delete", () => {
  assert.deepEqual(problems(after), []);
});

Deno.test("system_events and geofence_events are decided, not swept", () => {
  const fk = (t: string, c: string) => fksIntoDeletedRows(after).find((f) => f.table === t && f.column === c);
  // system_events is retained (operational record): keep the row, drop the link.
  assert.equal(fk("system_events", "user_id")?.onDelete, "SET NULL");
  assert.equal(fk("system_events", "resolved_by")?.onDelete, "SET NULL");
  // geofence_events is where the user's device was: it goes with the account.
  assert.equal(fk("geofence_events", "user_id")?.onDelete, "CASCADE");
  assert.equal(fk("contact_submissions", "user_id")?.onDelete, "SET NULL");
});

Deno.test("a new FK to auth.users without ON DELETE fails the check", () => {
  const probe = [
    ...migrations,
    {
      file: "99999999999999_probe.sql",
      sql: `CREATE TABLE public.zz_probe (id uuid PRIMARY KEY, owner_id uuid REFERENCES auth.users(id));
            ALTER TABLE public.zz_probe ADD COLUMN IF NOT EXISTS editor_id uuid
              REFERENCES auth.users (id) ON DELETE RESTRICT;
            ALTER TABLE public.zz_probe ADD COLUMN noted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL;`,
    },
  ];
  const p = problems(buildModel(probe));
  assert.deepEqual(
    p.filter((l) => l.startsWith("zz_probe.")).map((l) => l.split(" ")[0]),
    ["zz_probe.editor_id", "zz_probe.noted_by", "zz_probe.owner_id"],
    p.join("\n"),
  );
});

Deno.test("an allowed CHECKed SET NULL is still backed by the trigger it names", async () => {
  const sql = await Deno.readTextFile(new URL(`../../migrations/${FIX}`, import.meta.url));
  assert.match(sql, /CREATE TRIGGER deal_redemptions_mark_erased\s+BEFORE UPDATE OF user_id ON public\.deal_redemptions/);
  assert.match(sql, /CHECK \(user_id IS NOT NULL OR session_hash IS NOT NULL OR subject_erased_at IS NOT NULL\)/);
});

// --------------------------------------------------------------------- PGlite

const USER = "00000000-0000-0000-0000-0000000000aa";
const OTHER = "00000000-0000-0000-0000-0000000000bb";
const KEYWORDS = new Set(["is", "not", "null", "or", "and", "true", "false", "in", "between", "like"]);

function q(id: string): string {
  return `"${id}"`;
}

/**
 * Every table that holds a FK into a deleted row, plus the tables in between,
 * as the given model declares them: an id, the FK columns with their action
 * and NOT NULL, any CHECK that names one of them, and a note column whose
 * survival the tests read.
 */
function schemaFor(model: Model): { ddl: string; fks: UserFk[]; tables: string[] } {
  const fks = fksIntoDeletedRows(model);
  const deleted = deletedOnAccountDeletion(model);
  const tables = [...new Set([...fks.map((f) => f.table), ...[...deleted].filter((t) => t !== "auth.users" && t !== "profiles")])].sort();
  const ddl: string[] = [];
  for (const name of tables) {
    const t = model.get(name);
    const cols = new Map<string, string>([["id", "uuid PRIMARY KEY"], ["note", "text"]]);
    const mine = fks.filter((f) => f.table === name);
    for (const fk of mine) cols.set(fk.column, `uuid${t?.notNull.has(fk.column) ? " NOT NULL" : ""}`);
    const checks: string[] = [];
    for (const fk of mine) {
      // Only a CHECK that tests a FK column for NULL can turn a SET NULL into
      // a failure. Others (follower_id <> following_id) would only refuse the
      // seed row, which points every FK at the same user.
      for (const c of (t ? checksNaming(t, fk.column) : []).filter((x) => /\bIS\s+(NOT\s+)?NULL\b/i.test(x))) {
        if (checks.includes(c)) continue;
        checks.push(c);
        for (const word of c.match(/[a-z_][a-z0-9_]*/gi) ?? []) {
          if (!KEYWORDS.has(word.toLowerCase()) && !cols.has(word.toLowerCase())) cols.set(word.toLowerCase(), "text");
        }
      }
    }
    // A FK into an in-between table may name a column other than id.
    for (const fk of fks.filter((f) => f.target === name && f.targetColumn !== "id")) {
      cols.set(fk.targetColumn, "uuid UNIQUE");
    }
    const body = [...cols].map(([c, ty]) => `${q(c)} ${ty}`);
    // The constraint names the migrations would give them, so the fix finds
    // them the way it finds them in production: through pg_constraint.
    for (const c of checks) {
      const named = [...(t?.checks ?? new Map<string, string>())].find(([, expr]) => expr === c)?.[0];
      body.push(`CONSTRAINT ${q(named ?? `${name}_chk_${checks.indexOf(c)}`)} CHECK (${c})`);
    }
    ddl.push(`CREATE TABLE public.${q(name)} (${body.join(", ")});`);
  }
  for (const fk of fks) {
    const ref = fk.target === "auth.users" ? "auth.users" : `public.${q(fk.target)}`;
    ddl.push(
      `ALTER TABLE public.${q(fk.table)} ADD CONSTRAINT ${q(fk.constraint)} FOREIGN KEY (${q(fk.column)}) ` +
        `REFERENCES ${ref} (${q(fk.targetColumn)}) ON DELETE ${fk.onDelete};`,
    );
  }
  return { ddl: ddl.join("\n"), fks, tables };
}

/** Insert order: a table after every table its FKs point at (self-references aside). */
function insertOrder(fks: UserFk[], tables: string[]): string[] {
  const done = new Set<string>(["auth.users", "profiles"]);
  const out: string[] = [];
  while (out.length < tables.length) {
    const next = tables.find((t) =>
      !done.has(t) && fks.filter((f) => f.table === t && f.target !== t).every((f) => done.has(f.target))
    );
    assert(next, `FK cycle among ${tables.filter((t) => !done.has(t)).join(", ")}`);
    done.add(next);
    out.push(next);
  }
  return out;
}

async function seeded(model: Model): Promise<{ pg: PGlite; fks: UserFk[]; tables: string[]; rowIds: Map<string, string> }> {
  const pg = new PGlite();
  const { ddl, fks, tables } = schemaFor(model);
  await pg.exec(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE);
    INSERT INTO auth.users VALUES ('${USER}', 'leaving@example.com'), ('${OTHER}', 'staying@example.com');
    INSERT INTO public.profiles VALUES ('${USER}', '${USER}'), ('${OTHER}', '${OTHER}');
    ${ddl}
  `);
  // One row per table, every FK column pointing at the leaving user's row in
  // the table it references.
  const rowIds = new Map<string, string>([["auth.users", USER], ["profiles", USER]]);
  let n = 0;
  for (const table of insertOrder(fks, tables)) {
    const id = `00000000-0000-0000-0001-${String(++n).padStart(12, "0")}`;
    rowIds.set(table, id);
    const cols = ["id", "note"];
    const vals: unknown[] = [id, `kept:${table}`];
    for (const fk of fks.filter((f) => f.table === table)) {
      if (cols.includes(fk.column)) continue;
      cols.push(fk.column);
      vals.push(fk.target === table ? id : rowIds.get(fk.target));
    }
    for (const fk of fks.filter((f) => f.target === table && f.targetColumn !== "id")) {
      if (!cols.includes(fk.targetColumn)) {
        cols.push(fk.targetColumn);
        vals.push(id);
      }
    }
    await pg.query(
      `INSERT INTO public.${q(table)} (${cols.map(q).join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})`,
      vals,
    );
  }
  return { pg, fks, tables, rowIds };
}

async function errCode(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "error";
  }
}

const fixSql = await Deno.readTextFile(new URL(`../../migrations/${FIX}`, import.meta.url));

Deno.test("without the fix, deleting the auth user fails with 23503 (negative control)", async () => {
  const { pg } = await seeded(before);
  assert.equal(await errCode(pg.query(`DELETE FROM auth.users WHERE id = $1`, [USER])), "23503");
});

Deno.test("the deal_redemptions CHECK alone refuses the SET NULL without the fix (23514)", async () => {
  const pg = new PGlite();
  await pg.exec(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES ('${USER}');
    CREATE TABLE public.deal_redemptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      session_hash text,
      CONSTRAINT deal_redemptions_subject_present CHECK (user_id IS NOT NULL OR session_hash IS NOT NULL)
    );
    INSERT INTO public.deal_redemptions (user_id, session_hash) VALUES ('${USER}', NULL);
  `);
  assert.equal(await errCode(pg.query(`DELETE FROM auth.users WHERE id = $1`, [USER])), "23514");
});

Deno.test("with the fix, a user with a row in every such table deletes, and the right rows stay", async () => {
  const { pg, fks, tables, rowIds } = await seeded(before);
  await pg.exec(fixSql);
  assert.equal(await errCode(pg.query(`DELETE FROM auth.users WHERE id = $1`, [USER])), null);
  assert.equal((await pg.query(`SELECT 1 FROM auth.users WHERE id = $1`, [USER])).rows.length, 0);
  assert.equal((await pg.query(`SELECT 1 FROM auth.users WHERE id = $1`, [OTHER])).rows.length, 1);

  // Expected outcome per table, from the model the migrations leave behind.
  const afterFks = new Map(fksIntoDeletedRows(after).map((f) => [`${f.table}.${f.column}`, f]));
  const gone = new Set<string>(["profiles"]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of fks) {
      const action = afterFks.get(`${f.table}.${f.column}`)?.onDelete;
      if (!gone.has(f.table) && action === "CASCADE" && (f.target === "auth.users" || gone.has(f.target))) {
        gone.add(f.table);
        grew = true;
      }
    }
  }
  const wrong: string[] = [];
  for (const table of tables) {
    const rows = (await pg.query<Record<string, unknown>>(`SELECT * FROM public.${q(table)} WHERE id = $1`, [rowIds.get(table)])).rows;
    if (gone.has(table)) {
      if (rows.length !== 0) wrong.push(`${table}: expected the row to cascade away`);
      continue;
    }
    if (rows.length !== 1) {
      wrong.push(`${table}: expected the row to stay`);
      continue;
    }
    if (rows[0].note !== `kept:${table}`) wrong.push(`${table}: note changed`);
    for (const f of fks.filter((x) => x.table === table && (x.target === "auth.users" || gone.has(x.target)))) {
      if (rows[0][f.column] !== null) wrong.push(`${table}.${f.column}: expected NULL, got ${rows[0][f.column]}`);
    }
  }
  assert.deepEqual(wrong, []);
  assert(gone.size > 20 && tables.length - gone.size > 40, `cascaded ${gone.size}, kept ${tables.length - gone.size}`);

  // The two the story names, read directly.
  const cs = (await pg.query<{ note: string; user_id: string | null }>(
    `SELECT note, user_id FROM public.contact_submissions`,
  )).rows;
  assert.deepEqual(cs, [{ note: "kept:contact_submissions", user_id: null }]);
  const dr = (await pg.query<{ user_id: string | null; erased: boolean }>(
    `SELECT user_id, subject_erased_at IS NOT NULL AS erased FROM public.deal_redemptions`,
  )).rows;
  assert.deepEqual(dr, [{ user_id: null, erased: true }], "the claim stays and still counts");
  const ge = (await pg.query(`SELECT 1 FROM public.geofence_events`)).rows;
  assert.equal(ge.length, 0, "location history goes with the account");
});

Deno.test("the fix keeps constraint names and leaves no NOT NULL under a SET NULL", async () => {
  const { pg } = await seeded(before);
  await pg.exec(fixSql);
  const rows = (await pg.query<{ conname: string; confdeltype: string; convalidated: boolean }>(`
    SELECT c.conname, c.confdeltype, c.convalidated FROM pg_constraint c
    WHERE c.contype = 'f' AND c.confrelid = 'auth.users'::regclass AND c.conrelid::regclass::text <> 'profiles'
  `)).rows;
  assert.equal(rows.filter((r) => r.confdeltype === "a" || r.confdeltype === "r").length, 0);
  assert.equal(rows.filter((r) => !r.convalidated).length, 0, "every swapped FK is validated");
  assert(rows.some((r) => r.conname === "contact_submissions_user_id_fkey"));
  const notNull = (await pg.query(`
    SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confdeltype = 'n' AND a.attnotnull
  `)).rows;
  assert.equal(notNull.length, 0);
});

Deno.test("the sweep catches a blocking FK the list does not name, and keeps its rows", async () => {
  const pg = new PGlite();
  await pg.exec(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY);
    CREATE TABLE public.deal_redemptions (id uuid PRIMARY KEY, user_id uuid, session_hash text);
    CREATE TABLE public.zz_made_in_dashboard (id int PRIMARY KEY, owner uuid NOT NULL REFERENCES auth.users(id));
    INSERT INTO auth.users VALUES ('${USER}');
    INSERT INTO public.zz_made_in_dashboard VALUES (1, '${USER}');
  `);
  assert.equal(await errCode(pg.query(`DELETE FROM auth.users`)), "23503", "the probe blocks before the fix");
  await pg.exec(fixSql);
  assert.equal(await errCode(pg.query(`DELETE FROM auth.users`)), null);
  assert.deepEqual((await pg.query(`SELECT id, owner FROM public.zz_made_in_dashboard`)).rows, [{ id: 1, owner: null }]);
});

Deno.test("the fix is safe to run twice", async () => {
  const { pg } = await seeded(before);
  await pg.exec(fixSql);
  await pg.exec(fixSql);
  assert.equal(await errCode(pg.query(`DELETE FROM auth.users WHERE id = $1`, [USER])), null);
});

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * WEB-ADS-030. Only the double opt-in confirm may make a newsletter reader
 * 'active'.
 *
 * newsletter_subscribers_admin_update (20261005000003) let any admin session
 * write status = 'active' through PostgREST, which put an address on the
 * mailing list with no consent record and a live confirm token.
 * 20261108000083 adds a BEFORE INSERT OR UPDATE trigger that refuses a fresh
 * 'active' from the anon and authenticated roles.
 *
 * The behaviour was exercised on Postgres 16 when this landed (admin
 * pending/unsubscribed/bounced -> active refused with 42501; admin
 * unsubscribe, bounce and edits of active rows allowed; the confirm RPC, the
 * service role and postgres still activate; re-apply is a no-op). These cases
 * pin the source facts that keep that true.
 */

const MIGRATIONS = "supabase/migrations";
const GUARD_FILE = "20261108000083_newsletter_activation_only_by_confirm.sql";
const GUARD_FN = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.newsletter_subscribers_guard_activation\s*\(/i;
const DEFINES_CONFIRM = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.newsletter_confirm_by_token\s*\(/i;

function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function readMigration(name: string): string {
  return stripSqlComments(readFileSync(join(MIGRATIONS, name), "utf8"));
}

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/** Header (signature and attributes) and body of a function definition. */
function splitFunction(sql: string, definer: RegExp): { header: string; body: string } {
  const start = sql.search(definer);
  expect(start).toBeGreaterThanOrEqual(0);
  const open = sql.indexOf("$$", start);
  const close = sql.indexOf("$$", open + 2);
  return { header: sql.slice(start, open), body: sql.slice(open + 2, close) };
}

describe("newsletter activation only through the confirm link (WEB-ADS-030)", () => {
  it("the guard runs as the caller, so current_user is the PostgREST role", () => {
    const { header } = splitFunction(readMigration(GUARD_FILE), GUARD_FN);
    expect(header).toMatch(/RETURNS\s+trigger/i);
    expect(header).not.toMatch(/SECURITY\s+DEFINER/i);
  });

  it("refuses a fresh 'active' from anon and authenticated only", () => {
    const { body } = splitFunction(readMigration(GUARD_FILE), GUARD_FN);
    const cond = body.replace(/\s+/g, " ");
    expect(cond).toMatch(/IF NEW\.status = 'active'/);
    expect(cond).toMatch(/AND \(TG_OP = 'INSERT' OR OLD\.status IS DISTINCT FROM 'active'\)/);
    expect(cond).toMatch(/AND current_user IN \('anon', 'authenticated'\)/);
    expect(cond).toMatch(/RAISE EXCEPTION/);
    expect(cond).toMatch(/ERRCODE = '42501'/);
    expect(cond).toMatch(/RETURN NEW;/);
  });

  it("fires before every insert and update of a row, and re-applies cleanly", () => {
    const sql = readMigration(GUARD_FILE).replace(/\s+/g, " ");
    const drop = sql.indexOf(
      "DROP TRIGGER IF EXISTS newsletter_subscribers_guard_activation ON public.newsletter_subscribers;",
    );
    const create = sql.search(
      /CREATE TRIGGER newsletter_subscribers_guard_activation BEFORE INSERT OR UPDATE ON public\.newsletter_subscribers FOR EACH ROW EXECUTE FUNCTION public\.newsletter_subscribers_guard_activation\(\);/,
    );
    expect(drop).toBeGreaterThan(0);
    expect(create).toBeGreaterThan(drop);
  });

  it("the confirm RPC stays SECURITY DEFINER, which is how it gets past the guard", () => {
    const definers = migrationFiles().filter((f) => DEFINES_CONFIRM.test(readMigration(f)));
    const newest = definers[definers.length - 1];
    const { header } = splitFunction(readMigration(newest), DEFINES_CONFIRM);
    expect(header).toMatch(/SECURITY\s+DEFINER/i);
  });

  it("no later migration drops the trigger or redefines the guard", () => {
    const later = migrationFiles().filter((f) => f > GUARD_FILE);
    for (const f of later) {
      const sql = readMigration(f);
      expect(sql, f).not.toMatch(/DROP\s+TRIGGER[\s\S]{0,40}newsletter_subscribers_guard_activation/i);
      expect(sql, f).not.toMatch(GUARD_FN);
    }
  });

  it("the admin subscriber page never writes status 'active'", () => {
    const page = readFileSync("src/components/admin/NewsletterSubscribersManager.tsx", "utf8");
    // One write, and its status is a constant 'unsubscribed'. (The row type's
    // `status: "active" | ...` union is a type, not a write.)
    expect(page.match(/\.update\(/g)).toHaveLength(1);
    expect(page).toMatch(/const next = "unsubscribed";/);
    expect(page).not.toMatch(/status:\s*["']active["']\s*[,}]/);
  });
});

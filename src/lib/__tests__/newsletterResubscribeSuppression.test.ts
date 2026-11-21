import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * WEB-ADS-022. A reader who unsubscribed and then signed up again never got
 * another newsletter.
 *
 * newsletter_unsubscribe_by_token writes an 'unsubscribe' row to
 * email_suppressions, _shared/email.ts drops every marketing send to an
 * address with one, and nothing removed it when the reader came back through
 * the double opt-in. 20261108000037 makes newsletter_confirm_by_token lift the
 * reader's own unsubscribe (and nothing stronger) once the confirm succeeds.
 *
 * The behaviour was exercised against Postgres (PGlite) when this landed; these
 * cases pin the source facts that keep it true: the newest definition of the
 * RPC still does the delete, only for reason 'unsubscribe', only after the
 * status update matched a row, with the same signature and grants, and the
 * backfill is scoped the same way.
 */

const MIGRATIONS = "supabase/migrations";
const FIX_FILE = "20261108000037_newsletter_confirm_lifts_unsubscribe_suppression.sql";
const ORIGINAL_FILE = "20260918000002_newsletter_double_optin.sql";
const DEFINES_CONFIRM = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.newsletter_confirm_by_token\s*\(/i;

function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function readMigration(name: string): string {
  return stripSqlComments(readFileSync(join(MIGRATIONS, name), "utf8"));
}

/** The function body between the $$ quotes of the confirm RPC's definition. */
function confirmBody(sql: string): string {
  const start = sql.search(DEFINES_CONFIRM);
  expect(start).toBeGreaterThanOrEqual(0);
  const open = sql.indexOf("$$", start);
  const close = sql.indexOf("$$", open + 2);
  return sql.slice(open + 2, close);
}

function signature(sql: string): string {
  const start = sql.search(DEFINES_CONFIRM);
  const open = sql.indexOf("$$", start);
  return sql.slice(start, open).replace(/\s+/g, " ").trim();
}

describe("newsletter resubscribe lifts the reader's own unsubscribe (WEB-ADS-022)", () => {
  it("the newest definition of newsletter_confirm_by_token is the fix", () => {
    const definers = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) => DEFINES_CONFIRM.test(readMigration(f)));
    expect(definers[definers.length - 1]).toBe(FIX_FILE);
  });

  it("deletes only reason 'unsubscribe' for the confirming address", () => {
    const body = confirmBody(readMigration(FIX_FILE));
    const deletes = [...body.matchAll(/DELETE\s+FROM\s+public\.email_suppressions\s+WHERE([\s\S]*?);/gi)];
    expect(deletes).toHaveLength(1);
    const where = deletes[0][1].replace(/\s+/g, " ");
    expect(where).toMatch(/email = lower\(btrim\(v_row\.email\)\)/);
    expect(where).toMatch(/AND reason = 'unsubscribe'/);
    expect(where).not.toMatch(/\bOR\b/i);
  });

  it("lifts it only after the status update matched a row", () => {
    const body = confirmBody(readMigration(FIX_FILE));
    const guard = body.search(/IF\s+v_updated\s*=\s*0\s+THEN/i);
    const del = body.search(/DELETE\s+FROM\s+public\.email_suppressions/i);
    const already = body.search(/IF\s+v_row\.status\s*=\s*'active'/i);
    expect(guard).toBeGreaterThan(0);
    expect(already).toBeGreaterThan(0);
    expect(del).toBeGreaterThan(guard);
    expect(del).toBeGreaterThan(already);
  });

  it("keeps the signature, return shape and grants the confirm page calls", () => {
    const fix = readMigration(FIX_FILE);
    expect(signature(fix)).toBe(signature(readMigration(ORIGINAL_FILE)));
    expect(fix).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.newsletter_confirm_by_token\(TEXT\)\s+TO\s+anon;/i);
    expect(fix).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.newsletter_confirm_by_token\(TEXT\)\s+TO\s+authenticated;/i,
    );
    // Everything else the original body did is still there.
    const body = confirmBody(fix);
    for (const step of [/confirm_token\s*=\s*NULL/i, /unsubscribed_at\s*=\s*NULL/i, /INSERT\s+INTO\s+public\.consent_records/i]) {
      expect(body).toMatch(step);
    }
  });

  it("the backfill touches only newsletter unsubscribes of readers who are active again", () => {
    const fix = readMigration(FIX_FILE);
    const tail = fix.slice(fix.indexOf("$$;", fix.search(DEFINES_CONFIRM)));
    const backfills = [...tail.matchAll(/DELETE\s+FROM\s+public\.email_suppressions\s+s\s+USING([\s\S]*?);/gi)];
    expect(backfills).toHaveLength(1);
    const where = backfills[0][1].replace(/\s+/g, " ");
    expect(where).toMatch(/s\.reason = 'unsubscribe'/);
    expect(where).toMatch(/s\.source IN \('unsubscribe_token', 'backfill_newsletter_status'\)/);
    expect(where).toMatch(/n\.status = 'active'/);
    expect(where).toMatch(/n\.unsubscribed_at IS NULL/);
  });

  it("an unsubscribe suppression still blocks marketing mail, which is why the delete is needed", () => {
    const email = readFileSync("supabase/functions/_shared/email.ts", "utf8");
    const fn = email.slice(email.indexOf("export function isBlocked"));
    expect(fn).toMatch(/if \(category === "marketing"\) return true;/);
    expect(fn).toMatch(/return reason !== "unsubscribe";/);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * WEB-FEAT-077. user_email_preferences.weekly_digest_enabled was created
 * DEFAULT true (20251110000005), and get_weekly_digest_recipients mails every
 * row with the flag set, so an insert that left the column out subscribed the
 * user to the weekly digest. 20261108000101 sets the default to false.
 *
 * This pins the newest statement that sets the column's default: a later
 * migration that put `DEFAULT true` back (a re-created table, a copied
 * ALTER) would fail here before it reached anyone's inbox.
 */

const MIGRATIONS = "supabase/migrations";
const FIX_FILE = "20261108000101_user_email_preferences_digest_default_off.sql";

function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Every default the migrations give weekly_digest_enabled, in file order. */
function digestDefaults(): { file: string; value: string }[] {
  const found: { file: string; value: string }[] = [];
  const column = /weekly_digest_enabled\s+BOOLEAN[^,\n]*?\bDEFAULT\s+(\w+)/gi;
  const alter = /ALTER\s+COLUMN\s+weekly_digest_enabled\s+SET\s+DEFAULT\s+(\w+)/gi;
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS, file), "utf8"));
    const hits: { index: number; value: string }[] = [];
    for (const m of sql.matchAll(column)) hits.push({ index: m.index ?? 0, value: m[1] });
    for (const m of sql.matchAll(alter)) hits.push({ index: m.index ?? 0, value: m[1] });
    hits.sort((a, b) => a.index - b.index);
    for (const h of hits) found.push({ file, value: h.value.toLowerCase() });
  }
  return found;
}

describe("weekly digest is opt-in at the column default (WEB-FEAT-077)", () => {
  it("finds the original DEFAULT true, so the scan is reading the schema", () => {
    expect(digestDefaults()[0]).toEqual({
      file: "20251110000005_add_weekly_email_digest.sql",
      value: "true",
    });
  });

  it("the newest default set on weekly_digest_enabled is false", () => {
    const defaults = digestDefaults();
    expect(defaults[defaults.length - 1]).toEqual({ file: FIX_FILE, value: "false" });
  });

  it("changes only the default: no row update, no NOT NULL, no drop", () => {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS, FIX_FILE), "utf8"));
    expect(sql).not.toMatch(/\bUPDATE\b/i);
    expect(sql).not.toMatch(/NOT\s+NULL/i);
    expect(sql).not.toMatch(/\bDROP\b/i);
  });
});

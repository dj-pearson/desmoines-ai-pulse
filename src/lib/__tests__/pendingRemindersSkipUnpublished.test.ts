import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * get_pending_reminders feeds send-event-reminders, which emails "starts in
 * 3 hours" with a link to the event. An event a submitter unpublished
 * (is_hidden) or the unpublish switch retired (archived_at) must not get that
 * email (WEB-FEAT-098); every public read already filters both.
 *
 * Postgres is not available in CI, so this reads the newest migration that
 * defines the function, the same way reminderWindowsCoverHourlyCron does.
 */
const DIR = "supabase/migrations";
const BEFORE = "20261115000103_reminder_windows_cover_hourly_cron.sql";

function definingFiles(): string[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) =>
      /create or replace function public\.get_pending_reminders/i.test(readFileSync(`${DIR}/${f}`, "utf8")),
    );
}

/** The WHERE clause of the function body, comments stripped. */
function whereClause(file: string): string {
  const sql = readFileSync(`${DIR}/${file}`, "utf8").replace(/--[^\n]*/g, "");
  const body = /\bWHERE\b([\s\S]*?)\bORDER BY\b/i.exec(sql);
  if (!body) throw new Error(`${file}: no WHERE ... ORDER BY in get_pending_reminders`);
  return body[1].replace(/\s+/g, " ");
}

const HIDDEN = /\be\.is_hidden IS NOT TRUE\b|\bCOALESCE\(e\.is_hidden, false\) = false\b|\bNOT COALESCE\(e\.is_hidden, false\)/i;
const ARCHIVED = /\be\.archived_at IS NULL\b/i;

describe("get_pending_reminders skips unpublished events", () => {
  const files = definingFiles();
  const current = files[files.length - 1];

  it("finds the gap in the definition before this fix", () => {
    // Guards the reader: the previous definition had no visibility filter.
    const before = whereClause(BEFORE);
    expect(before).not.toMatch(HIDDEN);
    expect(before).not.toMatch(ARCHIVED);
  });

  it("filters hidden events", () => {
    expect(current).not.toBe(BEFORE);
    expect(whereClause(current)).toMatch(HIDDEN);
  });

  it("filters archived events", () => {
    expect(whereClause(current)).toMatch(ARCHIVED);
  });

  it("does not drop reminders on merged rows (the merge repoints them)", () => {
    expect(whereClause(current)).not.toMatch(/is_merged/i);
  });

  it("keeps the function service_role only", () => {
    const sql = readFileSync(`${DIR}/${current}`, "utf8");
    expect(sql).toContain(
      "REVOKE EXECUTE ON FUNCTION public.get_pending_reminders(text) FROM PUBLIC, anon, authenticated;",
    );
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.get_pending_reminders(text) TO service_role;");
    expect(sql).toMatch(/set search_path to 'public', 'pg_temp'/i);
  });
});

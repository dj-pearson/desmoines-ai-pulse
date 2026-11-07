import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * WEB-ADS-019. Members cannot write their own referrals rows.
 *
 * 20251126000000's "Users can create referrals" policy let any signed-in user
 * insert a row naming themselves as referrer with any status and any
 * referred_user_id, which inflated their paid count and could squat on
 * another member's attribution. 20261107000113 drops it. These cases pin the
 * three things that make that drop correct: it names the policy that was
 * actually created (DROP POLICY IF EXISTS on a misspelt name succeeds and
 * changes nothing), no later migration puts a client write back, and no
 * client writes to the table directly (they would start failing with 42501).
 */

const MIGRATIONS = "supabase/migrations";
const DROP_FILE = "20261107000113_drop_referrals_self_insert_policy.sql";
const CREATE_FILE = "20251126000000_add_newsletter_and_subscriptions.sql";

function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function readMigration(name: string): string {
  return stripSqlComments(readFileSync(join(MIGRATIONS, name), "utf8"));
}

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "build" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, exts, out);
    else if (exts.some((ext) => entry.endsWith(ext))) out.push(full);
  }
  return out;
}

const INSERT_POLICY_ON_REFERRALS =
  /CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+(?:public\.)?referrals\s+FOR\s+(?:INSERT|ALL)\b/gi;

describe("referrals write surface (WEB-ADS-019)", () => {
  it("drops the exact policy 20251126000000 created", () => {
    const created = [...readMigration(CREATE_FILE).matchAll(INSERT_POLICY_ON_REFERRALS)].map(
      (m) => m[1],
    );
    expect(created).toEqual(["Users can create referrals"]);

    const drop = readMigration(DROP_FILE);
    const dropped = [
      ...drop.matchAll(/DROP\s+POLICY\s+IF\s+EXISTS\s+"([^"]+)"\s+ON\s+public\.referrals\s*;/gi),
    ].map((m) => m[1]);
    expect(dropped).toEqual(created);
  });

  it("changes nothing else", () => {
    const statements = readMigration(DROP_FILE)
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/^DROP\s+POLICY\s+IF\s+EXISTS\b/i);
  });

  it("no later migration grants a client INSERT on referrals again", () => {
    const later = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql") && f > DROP_FILE)
      .filter((f) => readMigration(f).match(INSERT_POLICY_ON_REFERRALS) !== null);
    expect(later).toEqual([]);
  });

  it("no web, edge-function, iOS or Android code touches the referrals table directly", () => {
    // Reads go through get_my_referral_stats(), writes through
    // attribute_referral() and the user_subscriptions trigger. A direct
    // .from("referrals") call on any client would now be refused on write and
    // would bypass the RPCs on read. event_promotion_referrals is a different
    // table, hence the quote anchors.
    const direct = /from\(\s*['"]referrals['"]\s*\)|\/rest\/v1\/referrals\b/;
    const files = [
      ...walk("src", [".ts", ".tsx"]),
      ...walk("supabase/functions", [".ts"]),
      ...walk("ios", [".swift"]),
      ...walk("android", [".kt"]),
    ].filter((f) => !f.includes("__tests__") && !f.endsWith("integrations/supabase/types.ts"));

    expect(files.length).toBeGreaterThan(100);
    const offenders = files.filter((f) => direct.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});

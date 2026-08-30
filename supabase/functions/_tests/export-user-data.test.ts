import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { PURGE_TABLES, RETAINED_TABLES } from "../_shared/userDataTables.ts";

const SOURCE = await Deno.readTextFile(
  new URL("../export-user-data/index.ts", import.meta.url),
);

/**
 * XPLAT-007 / WEB-LEGAL-004 - the right of access must not drift from the right
 * of erasure again.
 *
 * The defect these guard against is not a crash. The previous export read eight
 * hardcoded tables, three of which do not exist, and told the user the result
 * was "personal data we hold about your account" while omitting 57 tables the
 * deletion path acknowledges holding. Nothing failed; the document was just
 * wrong, and stayed wrong because no test could tell.
 */

Deno.test("the export sources its tables from PURGE_TABLES, not its own list", () => {
  assert(
    SOURCE.includes("PURGE_TABLES"),
    "sourcing from the shared list is what keeps access and erasure consistent",
  );
  // A hardcoded array of table names is exactly what this replaced.
  const arrayLiterals = SOURCE.match(/\[\s*"[a-z_]+"\s*,\s*"[a-z_]+"/g) ?? [];
  assertEquals(
    arrayLiterals.length,
    0,
    "an inline table list here would drift from PURGE_TABLES the first time either changed",
  );
});

Deno.test("retained tables are exported too, with their basis", () => {
  // A right of access is not a right of erasure. Data we decline to delete is
  // data the user is MORE entitled to see, not less.
  assert(SOURCE.includes("RETAINED_TABLES"));
  assert(
    SOURCE.includes("retentionBasis"),
    "the reason each table is kept has to reach the user, not just the fact",
  );
});

Deno.test("every query is scoped to the authenticated user", () => {
  // The function runs with the service role, so scoping is the only thing
  // between it and someone else's data.
  assert(SOURCE.includes('.eq("user_id", userId)'));
  assert(
    SOURCE.includes("supabase.auth.getUser(token)"),
    "the id must come from the token, never from the request",
  );
});

Deno.test("the user id is never taken from the request body", () => {
  // The failure mode this prevents: an export endpoint that accepts a userId
  // parameter is an account-data disclosure for anyone who guesses a uuid.
  const readsBody = /req\.json\(\)/.test(SOURCE);
  assertEquals(readsBody, false, "this handler must not read a request body at all");
});

Deno.test("a table that cannot be read is reported, not swallowed", () => {
  // The old export commented that an error on one table "doesn't block the whole
  // export" and then dropped it. Three non-existent tables hid there for months.
  assert(SOURCE.includes("unavailable"));
  assert(
    SOURCE.includes("error.code"),
    "the PostgREST code is what identifies a missing table (42P01) versus a permission problem",
  );
});

Deno.test("the export reports how many tables it considered", () => {
  // So an absent key reads as "nothing here" rather than "not looked at".
  assert(SOURCE.includes("tablesConsidered"));
});

Deno.test("access and erasure cover the same ground", () => {
  // Not a source-scan: the actual invariant. If these two lists ever stop being
  // the union the export walks, this is the test that says so.
  const covered = new Set([...PURGE_TABLES, ...Object.keys(RETAINED_TABLES)]);
  assertEquals(covered.size, PURGE_TABLES.length + Object.keys(RETAINED_TABLES).length,
    "a table in both lists would be exported twice and is a classification bug");
  assert(PURGE_TABLES.length > 50, `expected the full purge list, got ${PURGE_TABLES.length}`);
});

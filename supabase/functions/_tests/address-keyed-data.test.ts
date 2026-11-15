import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  ADDRESS_KEYED_TABLES,
  addressRetentionBasis,
  normalizeAddress,
  purgeAddressKeyedData,
  readAddressKeyedData,
  type AddressDataClient,
  type Filtered,
} from "../_shared/addressKeyedData.ts";
import { PURGE_TABLES, RETAINED_TABLES } from "../_shared/userDataTables.ts";

/**
 * WEB-FEAT-095. Mail data is keyed by address, not user_id, so the
 * user_id lists and their types.ts drift test never saw it. Erasure left every
 * email_log row (to_email kept, user_id blanked by ON DELETE SET NULL), and the
 * export never included newsletter_subscribers, email_log or email_suppressions.
 */

const DELETE_SRC = await Deno.readTextFile(
  new URL("../delete-user-account/index.ts", import.meta.url),
);
const EXPORT_SRC = await Deno.readTextFile(
  new URL("../export-user-data/index.ts", import.meta.url),
);

type Row = Record<string, unknown>;

/** An in-memory PostgREST: select/delete with chained eq filters. */
function fakeClient(tables: Record<string, Row[]>, failing: Set<string> = new Set()) {
  const calls: string[] = [];
  const client: AddressDataClient = {
    from(table: string) {
      const build = <T>(op: "select" | "delete"): Filtered<T> => {
        const filters: [string, string][] = [];
        const builder: Filtered<T> = {
          eq(column, value) {
            filters.push([column, value]);
            return builder;
          },
          then(onFulfilled, onRejected) {
            calls.push(`${op} ${table} ${filters.map(([c, v]) => `${c}=${v}`).join("&")}`);
            const match = (r: Row) => filters.every(([c, v]) => r[c] === v);
            let result;
            if (failing.has(table)) {
              result = { data: null, error: { code: "42P01", message: `relation "${table}" does not exist` } };
            } else if (op === "select") {
              result = { data: (tables[table] ?? []).filter(match) as T, error: null };
            } else {
              tables[table] = (tables[table] ?? []).filter((r) => !match(r));
              result = { data: null, error: null };
            }
            return Promise.resolve(result).then(onFulfilled, onRejected);
          },
        };
        return builder;
      };
      return { select: () => build<Row[]>("select"), delete: () => build<unknown>("delete") };
    },
  };
  return { client, calls, tables };
}

const ME = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

function seed() {
  return {
    newsletter_subscribers: [
      { id: "n1", email: "reader@example.com", ip_address: "203.0.113.9" },
      { id: "n2", email: "someone@example.com" },
    ],
    email_log: [
      { id: "l1", to_email: "reader@example.com", user_id: null, template: "weekly-digest" },
      { id: "l2", to_email: "reader@example.com", user_id: ME, template: "event-reminder" },
      { id: "l3", to_email: "old-address@example.com", user_id: ME, template: "welcome" },
      { id: "l4", to_email: "someone@example.com", user_id: OTHER, template: "welcome" },
    ],
    email_suppressions: [
      { email: "reader@example.com", reason: "unsubscribe" },
      { email: "someone@example.com", reason: "bounce" },
    ],
  };
}

Deno.test("erasure deletes the address's mail log and newsletter row, nobody else's", async () => {
  const { client, tables } = fakeClient(seed());
  const result = await purgeAddressKeyedData(client, ME, "  Reader@Example.com ");

  assertEquals(result.failures, []);
  assertEquals(tables.newsletter_subscribers.map((r) => r.id), ["n2"]);
  // l3 was sent under an older address and still names the user.
  assertEquals(tables.email_log.map((r) => r.id), ["l4"]);
});

Deno.test("erasure keeps the suppression record, which is what stops mail for good", async () => {
  const { client, tables, calls } = fakeClient(seed());
  await purgeAddressKeyedData(client, ME, "reader@example.com");
  assertEquals(tables.email_suppressions.length, 2);
  assert(!calls.some((c) => c.startsWith("delete email_suppressions")));
});

Deno.test("erasure never runs an unfiltered delete when the account has no email", async () => {
  const { client, tables, calls } = fakeClient(seed());
  await purgeAddressKeyedData(client, ME, null);
  // Only the user_id-matched email_log rows go; no delete without a filter.
  assert(calls.every((c) => /=/.test(c)), calls.join("\n"));
  assertEquals(tables.newsletter_subscribers.length, 2);
  assertEquals(tables.email_log.map((r) => r.id), ["l1", "l4"]);
});

Deno.test("an erasure failure is reported and the rest still runs", async () => {
  const { client, tables } = fakeClient(seed(), new Set(["newsletter_subscribers"]));
  const result = await purgeAddressKeyedData(client, ME, "reader@example.com");
  assertEquals(result.failures.map((f) => [f.table, f.code]), [["newsletter_subscribers", "42P01"]]);
  assertEquals(tables.email_log.map((r) => r.id), ["l4"]);
});

Deno.test("the export includes all three tables, each row once, only this user's", async () => {
  const { client } = fakeClient(seed());
  const { data, unavailable } = await readAddressKeyedData(client, ME, "reader@example.com");

  assertEquals(unavailable, []);
  assertEquals((data.newsletter_subscribers as Row[]).map((r) => r.id), ["n1"]);
  // l2 matches both the address and the user id; it must appear once.
  assertEquals((data.email_log as Row[]).map((r) => r.id).sort(), ["l1", "l2", "l3"]);
  assertEquals((data.email_suppressions as Row[]).map((r) => r.reason), ["unsubscribe"]);
});

Deno.test("an unreadable table is listed in unavailable, not dropped silently", async () => {
  const { client } = fakeClient(seed(), new Set(["email_log"]));
  const { data, unavailable } = await readAddressKeyedData(client, ME, "reader@example.com");
  assertEquals(unavailable.map((f) => f.table), ["email_log"]);
  assert(!("email_log" in data));
  assert("newsletter_subscribers" in data);
});

Deno.test("addresses are normalized the way email.ts writes to_email", () => {
  assertEquals(normalizeAddress("  A.B@Example.COM "), "a.b@example.com");
  assertEquals(normalizeAddress(""), null);
  assertEquals(normalizeAddress(undefined), null);
});

Deno.test("every retained entry states its basis, and the export carries it", () => {
  for (const [table, entry] of Object.entries(ADDRESS_KEYED_TABLES)) {
    if (entry.erasure === "retain") {
      assert((entry.basis ?? "").length >= 20, `${table} is retained without a basis`);
    }
  }
  assert("email_suppressions" in addressRetentionBasis());
  assert(!("email_log" in addressRetentionBasis()));
});

Deno.test("no address-keyed table is also classified by user_id", () => {
  for (const table of Object.keys(ADDRESS_KEYED_TABLES)) {
    assert(!PURGE_TABLES.includes(table), `${table} is in PURGE_TABLES too`);
    assert(!(table in RETAINED_TABLES), `${table} is in RETAINED_TABLES too`);
  }
});

Deno.test("every table and column exists in a migration", async () => {
  // types.ts is stale for email_log, which is how it escaped the user_id test,
  // so this checks the migrations instead.
  const dir = new URL("../../migrations/", import.meta.url);
  let sql = "";
  for await (const f of Deno.readDir(dir)) {
    if (f.name.endsWith(".sql")) sql += await Deno.readTextFile(new URL(f.name, dir));
  }
  for (const [table, entry] of Object.entries(ADDRESS_KEYED_TABLES)) {
    const create = new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?(?:public\\.)?${table}\\s*\\(([\\s\\S]*?)\\n\\);`, "i");
    const m = sql.match(create);
    assert(m, `no CREATE TABLE for ${table}`);
    for (const col of [entry.emailColumn, entry.userIdColumn].filter(Boolean)) {
      assert(new RegExp(`\\n\\s*${col}\\s`).test(m[1]), `${table}.${col} not in its CREATE TABLE`);
    }
  }
});

Deno.test("both rights walk the shared list; no inline newsletter delete is left", () => {
  assert(DELETE_SRC.includes("purgeAddressKeyedData("));
  assert(EXPORT_SRC.includes("readAddressKeyedData("));
  assert(EXPORT_SRC.includes("addressRetentionBasis()"));
  assert(
    !/\.from\(["']newsletter_subscribers["']\)/.test(DELETE_SRC),
    "an inline delete here would drift from ADDRESS_KEYED_TABLES",
  );
});

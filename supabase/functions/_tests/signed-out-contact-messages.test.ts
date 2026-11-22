/**
 * Signed-out contact-form messages on account deletion (WEB-LEGAL-015, owner
 * decision 2026-11-22).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/signed-out-contact-messages.test.ts
 *
 * The SQL half (the case-insensitive match, the signed-in and other-address
 * messages that must survive) runs in PGlite in user-fk-on-delete.test.ts.
 * This half pins the edge-function side against a stubbed client: the RPC is
 * called with the account's address, a failure comes back as a failure rather
 * than a silent skip, and delete-user-account reports it before the auth user
 * is removed.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  type ContactPurgeClient,
  purgeSignedOutContactMessages,
  SIGNED_OUT_CONTACT_RPC,
} from "../_shared/signedOutContactMessages.ts";

type Reply = { data: unknown; error: { code?: string; message: string } | null } | Error;

function stub(reply: Reply): { client: ContactPurgeClient; calls: [string, { p_email: string }][] } {
  const calls: [string, { p_email: string }][] = [];
  return {
    calls,
    client: {
      rpc(fn, args) {
        calls.push([fn, args]);
        return reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply);
      },
    },
  };
}

Deno.test("calls the service-role RPC with the account's address and reports the count", async () => {
  const { client, calls } = stub({ data: 2, error: null });
  const result = await purgeSignedOutContactMessages(client, "  Leaving@Example.com ");
  assertEquals(calls, [[SIGNED_OUT_CONTACT_RPC, { p_email: "Leaving@Example.com" }]]);
  assertEquals(result, { attempted: true, deleted: 2, failure: null });
});

Deno.test("a failed delete comes back as a contact_submissions failure", async () => {
  const { client } = stub({ data: null, error: { code: "PGRST202", message: "function not found" } });
  const result = await purgeSignedOutContactMessages(client, "leaving@example.com");
  assertEquals(result.failure, { table: "contact_submissions", code: "PGRST202", message: "function not found" });
  assertEquals(result.attempted, true);
});

Deno.test("a thrown network error is a failure too, not a skip", async () => {
  const { client } = stub(new Error("fetch failed"));
  const result = await purgeSignedOutContactMessages(client, "leaving@example.com");
  assertEquals(result.failure, { table: "contact_submissions", message: "fetch failed" });
});

Deno.test("an account with no address makes no call and reports no failure", async () => {
  for (const email of [null, undefined, "", "   "]) {
    const { client, calls } = stub({ data: 0, error: null });
    const result = await purgeSignedOutContactMessages(client, email);
    assertEquals(calls, []);
    assertEquals(result, { attempted: false, deleted: null, failure: null });
  }
});

Deno.test("the RPC name is the one the migration creates", async () => {
  const sql = await Deno.readTextFile(
    new URL("../../migrations/20261122000070_account_deletion_billing_and_site_history.sql", import.meta.url),
  );
  assert(sql.includes(`FUNCTION public.${SIGNED_OUT_CONTACT_RPC}(p_email text)`));
  const src = await Deno.readTextFile(new URL("../_shared/signedOutContactMessages.ts", import.meta.url));
  assert(src.includes(`client.rpc("${SIGNED_OUT_CONTACT_RPC}"`), "the literal call and the constant agree");
});

Deno.test("delete-user-account runs it before deleteUser and reports a failure as incomplete", async () => {
  const src = await Deno.readTextFile(new URL("../delete-user-account/index.ts", import.meta.url));
  const purge = src.indexOf("await purgeSignedOutContactMessages(");
  const deleteUser = src.indexOf("supabase.auth.admin.deleteUser(");
  assert(purge > 0, "the purge is called");
  assert(purge < deleteUser, "the purge needs the address, so it runs before the auth user is removed");
  const block = src.slice(purge, deleteUser);
  assert(/if \(contactPurge\.failure\) \{\s*tableFailures\.push\(contactPurge\.failure\)/.test(block));
  // The failure reaches the response through tableFailures.
  assert(src.includes("complete: tableFailures.length === 0"));
  assert(src.includes("tables_incomplete: tableFailures.map((f) => f.table)"));
});

/**
 * IOS-DD-MONETIZATION-02: one Apple subscription, one account.
 *
 * Run: `deno test supabase/functions/_shared/appleOwnership.test.ts`
 */
import { assertEquals } from "jsr:@std/assert@1";
import { decideAppleOwnership, OWNED_BY_ANOTHER_ACCOUNT } from "./appleOwnership.ts";

const ME = "6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab";
const OTHER = "11111111-2222-4333-8444-555555555555";

Deno.test("token naming another account is refused", () => {
  assertEquals(
    decideAppleOwnership({ callerId: ME, appAccountToken: OTHER, otherActiveOwnerIds: [], transferRequested: true }),
    { action: "refuse", reason: OWNED_BY_ANOTHER_ACCOUNT },
  );
});

Deno.test("token naming the caller binds when nobody else holds it", () => {
  assertEquals(
    decideAppleOwnership({ callerId: ME, appAccountToken: ME, otherActiveOwnerIds: [], transferRequested: false }),
    { action: "bind" },
  );
});

Deno.test("token naming the caller takes it back from another account, even without Restore", () => {
  assertEquals(
    decideAppleOwnership({ callerId: ME, appAccountToken: ME, otherActiveOwnerIds: [OTHER], transferRequested: false }),
    { action: "transfer" },
  );
});

Deno.test("token compare is case-insensitive (Swift uppercases UUIDs, Postgres lowercases)", () => {
  assertEquals(
    decideAppleOwnership({
      callerId: ME,
      appAccountToken: ME.toUpperCase(),
      otherActiveOwnerIds: [],
      transferRequested: false,
    }),
    { action: "bind" },
  );
});

Deno.test("no token and no other holder binds", () => {
  assertEquals(
    decideAppleOwnership({ callerId: ME, appAccountToken: null, otherActiveOwnerIds: [], transferRequested: false }),
    { action: "bind" },
  );
});

Deno.test("no token, another holder, explicit Restore transfers", () => {
  assertEquals(
    decideAppleOwnership({ callerId: ME, otherActiveOwnerIds: [OTHER], transferRequested: true }),
    { action: "transfer" },
  );
});

Deno.test("no token, another holder, no Restore is refused", () => {
  assertEquals(
    decideAppleOwnership({ callerId: ME, otherActiveOwnerIds: [OTHER], transferRequested: false }),
    { action: "refuse", reason: OWNED_BY_ANOTHER_ACCOUNT },
  );
});

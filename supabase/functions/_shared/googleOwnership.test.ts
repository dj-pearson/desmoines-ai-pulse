/**
 * WEB-SEC-050: one Google Play purchase token, one account.
 *
 * Run: `deno test supabase/functions/_shared/googleOwnership.test.ts`
 */
import { assertEquals } from "jsr:@std/assert@1";
import {
  ACCOUNT_ID_MISMATCH,
  decideGoogleOwnership,
  hashAccountId,
  isOwnershipEnforced,
  OWNED_BY_ANOTHER_ACCOUNT,
} from "./googleOwnership.ts";

const ME = "6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab";
const OTHER = "11111111-2222-4333-8444-555555555555";

Deno.test("hashAccountId matches BillingService.obfuscatedAccountId (sha256 hex)", async () => {
  // sha256("abc"), the FIPS 180-2 test vector.
  assertEquals(
    await hashAccountId("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assertEquals((await hashAccountId(ME)).length, 64);
});

Deno.test("same user: obfuscated id hashes to the caller and nobody else holds it", async () => {
  const mine = await hashAccountId(ME);
  assertEquals(
    decideGoogleOwnership({ callerAccountHash: mine, obfuscatedExternalAccountId: mine, otherActiveOwnerIds: [] }),
    { action: "allow" },
  );
});

Deno.test("same user, no obfuscated id, already the only holder", async () => {
  assertEquals(
    decideGoogleOwnership({ callerAccountHash: await hashAccountId(ME), otherActiveOwnerIds: [] }),
    { action: "allow" },
  );
});

Deno.test("different user holding the token, obfuscated id absent, is a conflict", async () => {
  assertEquals(
    decideGoogleOwnership({
      callerAccountHash: await hashAccountId(ME),
      obfuscatedExternalAccountId: null,
      otherActiveOwnerIds: [OTHER],
    }),
    { action: "conflict", reason: OWNED_BY_ANOTHER_ACCOUNT },
  );
});

Deno.test("obfuscated id naming another account is a conflict even with no other holder", async () => {
  assertEquals(
    decideGoogleOwnership({
      callerAccountHash: await hashAccountId(ME),
      obfuscatedExternalAccountId: await hashAccountId(OTHER),
      otherActiveOwnerIds: [],
    }),
    { action: "conflict", reason: ACCOUNT_ID_MISMATCH },
  );
});

Deno.test("obfuscated id naming the caller wins over another account holding the token", async () => {
  const mine = await hashAccountId(ME);
  assertEquals(
    decideGoogleOwnership({ callerAccountHash: mine, obfuscatedExternalAccountId: mine, otherActiveOwnerIds: [OTHER] }),
    { action: "allow" },
  );
});

Deno.test("obfuscated id compare ignores case and surrounding space", async () => {
  const mine = await hashAccountId(ME);
  assertEquals(
    decideGoogleOwnership({
      callerAccountHash: mine,
      obfuscatedExternalAccountId: ` ${mine.toUpperCase()} `,
      otherActiveOwnerIds: [],
    }),
    { action: "allow" },
  );
});

Deno.test("empty obfuscated id is treated as absent", async () => {
  assertEquals(
    decideGoogleOwnership({
      callerAccountHash: await hashAccountId(ME),
      obfuscatedExternalAccountId: "",
      otherActiveOwnerIds: [OTHER],
    }),
    { action: "conflict", reason: OWNED_BY_ANOTHER_ACCOUNT },
  );
});

Deno.test("enforcement is on only for the literal true", () => {
  assertEquals(isOwnershipEnforced("true"), true);
  assertEquals(isOwnershipEnforced(" TRUE "), true);
  assertEquals(isOwnershipEnforced("1"), false);
  assertEquals(isOwnershipEnforced(""), false);
  assertEquals(isOwnershipEnforced(undefined), false);
});

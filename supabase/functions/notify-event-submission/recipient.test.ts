import { assertEquals } from "jsr:@std/assert@1";
import { chooseDecisionRecipient } from "./recipient.ts";

const OWNER_ID = "11111111-1111-1111-1111-111111111111";
const VERIFIED = { email: "Organizer@Example.com", email_confirmed_at: "2026-01-01T00:00:00Z" };

Deno.test("contact_email matching the owner (any case) mails the owner", () => {
  const r = chooseDecisionRecipient({
    ownerId: OWNER_ID,
    owner: VERIFIED,
    contactEmail: "  organizer@example.COM ",
  });
  assertEquals(r.to, "Organizer@Example.com");
  assertEquals(r.reason, "owner_verified");
  assertEquals(r.contactEmailMatches, true);
});

Deno.test("a mismatched contact_email is never the recipient", () => {
  const r = chooseDecisionRecipient({
    ownerId: OWNER_ID,
    owner: VERIFIED,
    contactEmail: "victim@elsewhere.test",
  });
  assertEquals(r.to, "Organizer@Example.com");
  assertEquals(r.contactEmailMatches, false);
});

Deno.test("an empty contact_email still mails the verified owner", () => {
  const r = chooseDecisionRecipient({ ownerId: OWNER_ID, owner: VERIFIED, contactEmail: null });
  assertEquals(r.to, "Organizer@Example.com");
  assertEquals(r.contactEmailMatches, false);
});

Deno.test("no owner on the submission sends nothing, whatever contact_email says", () => {
  for (const ownerId of [null, undefined, ""]) {
    const r = chooseDecisionRecipient({ ownerId, owner: VERIFIED, contactEmail: "victim@elsewhere.test" });
    assertEquals(r.to, null);
    assertEquals(r.reason, "no_owner");
  }
});

Deno.test("an owner the lookup could not find sends nothing", () => {
  const r = chooseDecisionRecipient({ ownerId: OWNER_ID, owner: null, contactEmail: "victim@elsewhere.test" });
  assertEquals(r.to, null);
  assertEquals(r.reason, "owner_not_found");
});

Deno.test("an unverified owner email sends nothing, even when contact_email matches", () => {
  const r = chooseDecisionRecipient({
    ownerId: OWNER_ID,
    owner: { email: "victim@elsewhere.test", email_confirmed_at: null },
    contactEmail: "victim@elsewhere.test",
  });
  assertEquals(r.to, null);
  assertEquals(r.reason, "owner_unverified");
});

Deno.test("an owner with no email (e.g. phone-only) sends nothing", () => {
  const r = chooseDecisionRecipient({
    ownerId: OWNER_ID,
    owner: { email: "  ", email_confirmed_at: "2026-01-01T00:00:00Z" },
    contactEmail: "victim@elsewhere.test",
  });
  assertEquals(r.to, null);
  assertEquals(r.reason, "owner_no_email");
});

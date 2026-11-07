/**
 * WEB-SEC-051: sandbox App Store purchases only become premium for the
 * allowlist, and only once IOS_SANDBOX_ENFORCE=true.
 *
 * Run: `deno test supabase/functions/_shared/appleSandboxPolicy.test.ts`
 */
import { assertEquals } from "jsr:@std/assert@1";
import { decideSandboxGrant, isSandboxEnforced, type SandboxPolicyInput } from "./appleSandboxPolicy.ts";

const ME = "6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab";

const base: SandboxPolicyInput = {
  environment: "Sandbox",
  userId: ME,
  email: "tester@example.com",
  enforceFlag: "true",
  allowedEmails: "",
  allowedUserIds: "",
};

Deno.test("production purchases are always granted", () => {
  assertEquals(
    decideSandboxGrant({ ...base, environment: "Production" }),
    { grant: true, reason: "production", wouldRefuse: false },
  );
});

Deno.test("enforcement off (unset) grants sandbox but flags it", () => {
  assertEquals(
    decideSandboxGrant({ ...base, enforceFlag: undefined }),
    { grant: true, reason: "sandbox_not_enforced", wouldRefuse: true },
  );
});

Deno.test("enforcement only switches on for the literal 'true'", () => {
  for (const flag of ["", "false", "1", "yes", "on", null]) {
    assertEquals(decideSandboxGrant({ ...base, enforceFlag: flag }).grant, true, String(flag));
  }
  assertEquals(isSandboxEnforced(" TRUE "), true);
});

Deno.test("enforced and not allowlisted: refused", () => {
  assertEquals(
    decideSandboxGrant(base),
    { grant: false, reason: "sandbox_refused", wouldRefuse: true },
  );
});

Deno.test("enforced and email allowlisted (case and spaces ignored): granted", () => {
  assertEquals(
    decideSandboxGrant({ ...base, email: "Reviewer@Example.com", allowedEmails: " other@x.com , reviewer@example.COM " }),
    { grant: true, reason: "sandbox_allowlisted", wouldRefuse: false },
  );
});

Deno.test("enforced and user id allowlisted: granted", () => {
  assertEquals(
    decideSandboxGrant({ ...base, email: null, allowedUserIds: ME.toUpperCase() }),
    { grant: true, reason: "sandbox_allowlisted", wouldRefuse: false },
  );
});

Deno.test("a user with no email does not match an empty allowlist entry", () => {
  assertEquals(
    decideSandboxGrant({ ...base, email: "", allowedEmails: ",, ," }).grant,
    false,
  );
});

Deno.test("unknown environments are treated as non-production", () => {
  for (const env of ["Xcode", "LocalTesting", "production", ""]) {
    assertEquals(decideSandboxGrant({ ...base, environment: env }).grant, false, env);
  }
});

import { describe, it, expect } from "vitest";
import { SecurityUtils } from "@/lib/securityUtils";
import {
  PASSWORD_RULES,
  calculatePasswordStrength,
  passwordSchema,
} from "@/lib/passwordStrength";

/**
 * Account plan WP1 item 2. validateEmail ran containsSQLInjection, which
 * matches whole words like EXEC, UPDATE, DROP and UNION, so these real
 * addresses could not sign in or sign up. On the sign-in form the failure
 * surfaced as "Too Many Attempts".
 */
const REAL_ADDRESSES = [
  "exec@firm.com",
  "jane.update@gmail.com",
  "hr@drop.io",
  "sam@union.edu",
  // `--` is an SQL comment marker, and a legal local part.
  "a--b@x.io",
];

describe("SecurityUtils.validateEmail", () => {
  it.each(REAL_ADDRESSES)("accepts %s", (address) => {
    expect(SecurityUtils.validateEmail(address)).toEqual({ isValid: true, errors: [] });
  });

  it("still rejects a malformed address", () => {
    expect(SecurityUtils.validateEmail("not-an-address").isValid).toBe(false);
    expect(SecurityUtils.validateEmail("a@b@c.io").isValid).toBe(false);
    expect(SecurityUtils.validateEmail("").isValid).toBe(false);
  });

  it("still caps the length", () => {
    const long = `${"a".repeat(250)}@x.io`;
    expect(SecurityUtils.validateEmail(long).isValid).toBe(false);
  });
});

/**
 * WP1 item 9. The meter and the validator used different special-character
 * sets, so each accepted passwords the other refused.
 */
describe("one password rule set", () => {
  const samples = ["abc-DEF-123", "abcDEF123~", "Abcdefg1!", "abcdefgh", "Short1!", "NoSymbol123"];

  it.each(samples)("the meter, the schema and the validator agree on %s", (pw) => {
    const meterAllMet = calculatePasswordStrength(pw).requirements.every((r) => r.met);
    const schemaOk = passwordSchema.safeParse(pw).success;
    const validatorOk = SecurityUtils.validatePassword(pw).isValid;
    expect(schemaOk).toBe(meterAllMet);
    expect(validatorOk).toBe(meterAllMet);
  });

  it("the meter lists exactly the rules", () => {
    expect(calculatePasswordStrength("x").requirements.map((r) => r.label)).toEqual(
      PASSWORD_RULES.map((r) => r.label),
    );
  });
});

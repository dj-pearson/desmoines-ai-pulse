import { z } from "zod";

/**
 * One password rule set for the whole site (account plan WP1 item 9).
 *
 * There used to be three: this meter, SecurityUtils.validatePassword and a copy
 * in ResetPassword. The meter's special-character class was
 * `[!@#$%^&*(),.?":{}|<>]` and the validator's was a different set, so "abc-DEF-123"
 * showed a red cross next to "special character" on the meter and then passed
 * validation, and "abcDEF123~" did the opposite. Everything now derives from
 * PASSWORD_RULES: the meter's checklist, passwordSchema (React Hook Form), and
 * SecurityUtils.validatePassword.
 *
 * SYMBOLS matches the set GoTrue checks when the project's password policy asks
 * for symbols, so a password this page accepts is one the server accepts.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const SYMBOLS = /[!@#$%^&*()_+\-=[\]{};'\\:"|<>?,./`~]/;

export interface PasswordRule {
  id: "length" | "lowercase" | "uppercase" | "number" | "symbol";
  /** Checklist wording, shown next to a tick or a cross. */
  label: string;
  /** Error wording, shown when this rule is the one that failed. */
  message: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: "length",
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    message: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
    test: (password) => password.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: "lowercase",
    label: "A lowercase letter",
    message: "Add a lowercase letter.",
    test: (password) => /[a-z]/.test(password),
  },
  {
    id: "uppercase",
    label: "An uppercase letter",
    message: "Add an uppercase letter.",
    test: (password) => /[A-Z]/.test(password),
  },
  {
    id: "number",
    label: "A number",
    message: "Add a number.",
    test: (password) => /\d/.test(password),
  },
  {
    id: "symbol",
    label: "A symbol, like ! or -",
    message: "Add a symbol, like ! or -.",
    test: (password) => SYMBOLS.test(password),
  },
];

/** The messages for every rule a password breaks, in rule order. */
export function passwordRuleErrors(password: string): string[] {
  const errors = PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.message);
  if (password.length > PASSWORD_MAX_LENGTH) {
    errors.push(`Keep it under ${PASSWORD_MAX_LENGTH} characters.`);
  }
  return errors;
}

/**
 * The Zod schema for a new password. superRefine rather than a chain of
 * `.regex()` calls so the rules stay defined in one place; the first broken
 * rule is the message a form shows.
 */
export const passwordSchema = z.string().superRefine((password, ctx) => {
  if (!password) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a password." });
    return;
  }
  const [first] = passwordRuleErrors(password);
  if (first) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: first });
  }
});

export type PasswordStrength = "weak" | "fair" | "good" | "strong";

export interface PasswordRequirement {
  label: string;
  met: boolean;
}

export interface PasswordStrengthResult {
  strength: PasswordStrength;
  score: number; // 0-4
  requirements: PasswordRequirement[];
  /** Tailwind background class for the bar. Theme tokens, so dark mode follows. */
  color: string;
  percentage: number;
}

/**
 * Strength for the meter. "strong" means every rule passes, so the meter can
 * never say strong about a password the form will then refuse.
 */
export function calculatePasswordStrength(password: string): PasswordStrengthResult {
  const requirements: PasswordRequirement[] = PASSWORD_RULES.map((rule) => ({
    label: rule.label,
    met: rule.test(password),
  }));

  const metCount = requirements.filter((req) => req.met).length;

  let strength: PasswordStrength;
  let score: number;
  let color: string;

  if (password.length === 0) {
    strength = "weak";
    score = 0;
    color = "bg-muted";
  } else if (metCount <= 2) {
    strength = "weak";
    score = 1;
    color = "bg-destructive";
  } else if (metCount === 3) {
    strength = "fair";
    score = 2;
    color = "bg-warning";
  } else if (metCount === 4) {
    strength = "good";
    score = 3;
    color = "bg-primary/70";
  } else {
    strength = "strong";
    score = 4;
    color = "bg-primary";
  }

  return {
    strength,
    score,
    requirements,
    color,
    percentage: (score / 4) * 100,
  };
}

/**
 * Get a human-readable message for password strength
 */
export function getStrengthMessage(strength: PasswordStrength): string {
  switch (strength) {
    case "weak":
      return "Too weak";
    case "fair":
      return "Fair";
    case "good":
      return "Almost there";
    case "strong":
      return "Strong";
  }
}

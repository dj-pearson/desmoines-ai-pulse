export type PasswordStrength = "weak" | "fair" | "good" | "strong";

export interface PasswordRequirement {
  label: string;
  met: boolean;
}

export interface PasswordStrengthResult {
  strength: PasswordStrength;
  score: number; // 0-4
  requirements: PasswordRequirement[];
  color: string;
  percentage: number;
}

/**
 * Calculate password strength and check requirements
 */
export function calculatePasswordStrength(password: string): PasswordStrengthResult {
  const requirements: PasswordRequirement[] = [
    {
      label: "At least 8 characters",
      met: password.length >= 8,
    },
    {
      label: "Contains a number",
      met: /\d/.test(password),
    },
    {
      label: "Contains uppercase letter",
      met: /[A-Z]/.test(password),
    },
    {
      label: "Contains lowercase letter",
      met: /[a-z]/.test(password),
    },
    {
      label: "Contains special character",
      met: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    },
  ];

  const metCount = requirements.filter((req) => req.met).length;

  let strength: PasswordStrength;
  let score: number;
  let color: string;

  if (password.length === 0) {
    strength = "weak";
    score = 0;
    color = "bg-gray-300";
  } else if (metCount <= 1) {
    strength = "weak";
    score = 1;
    color = "bg-red-500";
  } else if (metCount === 2) {
    strength = "fair";
    score = 2;
    color = "bg-orange-500";
  } else if (metCount === 3 || metCount === 4) {
    strength = "good";
    score = 3;
    color = "bg-yellow-500";
  } else {
    strength = "strong";
    score = 4;
    color = "bg-green-500";
  }

  const percentage = (score / 4) * 100;

  return {
    strength,
    score,
    requirements,
    color,
    percentage,
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
      return "Good";
    case "strong":
      return "Strong";
  }
}

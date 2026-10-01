import { useMemo } from "react";
import { Check, X } from "lucide-react";
import { calculatePasswordStrength, getStrengthMessage } from "@/lib/passwordStrength";
import { cn } from "@/lib/utils";

interface PasswordStrengthMeterProps {
  password: string;
  showRequirements?: boolean;
  /** Lets a form point aria-describedby at the checklist. */
  id?: string;
}

/**
 * Strength bar and checklist for a new password. Both come from PASSWORD_RULES
 * in @/lib/passwordStrength, the same rules passwordSchema and
 * SecurityUtils.validatePassword enforce, so a tick here means the form will
 * accept that rule.
 */
export function PasswordStrengthMeter({
  password,
  showRequirements = false,
  id,
}: PasswordStrengthMeterProps) {
  const result = useMemo(() => calculatePasswordStrength(password), [password]);

  if (!password) return null;

  return (
    <div className="space-y-2" id={id}>
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Password strength</span>
          <span
            className={cn(
              "font-medium",
              result.strength === "weak" && "text-destructive",
              result.strength === "fair" && "text-foreground",
              (result.strength === "good" || result.strength === "strong") && "text-primary",
            )}
          >
            {getStrengthMessage(result.strength)}
          </span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden" aria-hidden="true">
          <div
            className={cn("h-full transition-[width] duration-300 ease-out", result.color)}
            style={{ width: `${result.percentage}%` }}
          />
        </div>
      </div>

      {showRequirements && (
        <ul className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
          {result.requirements.map((req) => (
            <li
              key={req.label}
              className={cn(
                "flex items-center gap-2",
                req.met ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {req.met ? (
                <Check className="h-3 w-3 flex-shrink-0 text-primary" aria-hidden="true" />
              ) : (
                <X className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
              )}
              <span>
                {req.label}
                <span className="sr-only">{req.met ? " (done)" : " (not yet)"}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

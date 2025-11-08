import { useMemo } from "react";
import { Check, X } from "lucide-react";
import {
  calculatePasswordStrength,
  getStrengthMessage,
} from "@/lib/passwordStrength";

interface PasswordStrengthMeterProps {
  password: string;
  showRequirements?: boolean;
}

export function PasswordStrengthMeter({
  password,
  showRequirements = false,
}: PasswordStrengthMeterProps) {
  const result = useMemo(
    () => calculatePasswordStrength(password),
    [password]
  );

  if (!password) return null;

  return (
    <div className="space-y-2">
      {/* Strength Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Password strength:</span>
          <span
            className={`font-medium ${
              result.strength === "weak"
                ? "text-red-600"
                : result.strength === "fair"
                ? "text-orange-600"
                : result.strength === "good"
                ? "text-yellow-600"
                : "text-green-600"
            }`}
          >
            {getStrengthMessage(result.strength)}
          </span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${result.color}`}
            style={{ width: `${result.percentage}%` }}
          />
        </div>
      </div>

      {/* Requirements Checklist */}
      {showRequirements && (
        <div className="space-y-1 text-xs">
          {result.requirements.map((req, index) => (
            <div
              key={index}
              className={`flex items-center gap-2 ${
                req.met ? "text-green-600" : "text-muted-foreground"
              }`}
            >
              {req.met ? (
                <Check className="h-3 w-3 flex-shrink-0" />
              ) : (
                <X className="h-3 w-3 flex-shrink-0" />
              )}
              <span>{req.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

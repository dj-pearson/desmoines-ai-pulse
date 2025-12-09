import { useMemo } from "react";
import { Check, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePasswordPolicy } from "@/hooks/usePasswordPolicy";

interface PasswordStrengthIndicatorProps {
  password: string;
  showRequirements?: boolean;
  className?: string;
}

export function PasswordStrengthIndicator({
  password,
  showRequirements = true,
  className,
}: PasswordStrengthIndicatorProps) {
  const { validatePasswordLocally, calculatePasswordStrength, getPasswordRequirements } =
    usePasswordPolicy();

  const validation = useMemo(
    () => validatePasswordLocally(password),
    [password, validatePasswordLocally]
  );

  const strength = useMemo(
    () => calculatePasswordStrength(password),
    [password, calculatePasswordStrength]
  );

  const requirements = useMemo(
    () => getPasswordRequirements(),
    [getPasswordRequirements]
  );

  // Check which requirements are met
  const requirementsMet = useMemo(() => {
    if (!password) return [];

    const met: boolean[] = [];

    // Minimum length
    met.push(password.length >= 8);

    // Uppercase
    met.push(/[A-Z]/.test(password));

    // Lowercase
    met.push(/[a-z]/.test(password));

    // Numbers
    met.push(/[0-9]/.test(password));

    // Special characters
    met.push(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password));

    return met;
  }, [password]);

  const getStrengthColor = () => {
    switch (strength.level) {
      case 'weak':
        return 'bg-red-500';
      case 'fair':
        return 'bg-orange-500';
      case 'good':
        return 'bg-yellow-500';
      case 'strong':
        return 'bg-lime-500';
      case 'excellent':
        return 'bg-green-500';
      default:
        return 'bg-gray-300';
    }
  };

  const getStrengthLabel = () => {
    switch (strength.level) {
      case 'weak':
        return 'Weak';
      case 'fair':
        return 'Fair';
      case 'good':
        return 'Good';
      case 'strong':
        return 'Strong';
      case 'excellent':
        return 'Excellent';
      default:
        return 'Enter password';
    }
  };

  const getStrengthTextColor = () => {
    switch (strength.level) {
      case 'weak':
        return 'text-red-600';
      case 'fair':
        return 'text-orange-600';
      case 'good':
        return 'text-yellow-600';
      case 'strong':
        return 'text-lime-600';
      case 'excellent':
        return 'text-green-600';
      default:
        return 'text-gray-500';
    }
  };

  if (!password) return null;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Strength Bar */}
      <div className="space-y-1">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-600">Password Strength</span>
          <span className={cn("font-medium", getStrengthTextColor())}>
            {getStrengthLabel()}
          </span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={cn("h-full transition-all duration-300", getStrengthColor())}
            style={{ width: `${strength.score}%` }}
          />
        </div>
      </div>

      {/* Requirements List */}
      {showRequirements && (
        <div className="space-y-1.5">
          <span className="text-sm text-gray-600">Requirements:</span>
          <ul className="grid grid-cols-1 gap-1">
            {requirements.map((req, index) => {
              const isMet = requirementsMet[index];
              return (
                <li
                  key={index}
                  className={cn(
                    "flex items-center gap-2 text-sm transition-colors",
                    isMet ? "text-green-600" : "text-gray-500"
                  )}
                >
                  {isMet ? (
                    <Check className="h-4 w-4 flex-shrink-0" />
                  ) : (
                    <X className="h-4 w-4 flex-shrink-0 text-gray-400" />
                  )}
                  <span>{req}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Validation Errors */}
      {!validation.valid && validation.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              {validation.errors.map((error, index) => (
                <p key={index} className="text-sm text-red-600">
                  {error}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Strength Feedback */}
      {strength.feedback.length > 0 && validation.valid && (
        <div className="text-sm text-gray-600">
          {strength.feedback.map((feedback, index) => (
            <p key={index}>{feedback}</p>
          ))}
        </div>
      )}
    </div>
  );
}

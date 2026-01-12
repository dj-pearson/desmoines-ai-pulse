import * as React from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

interface FormError {
  field: string;
  message: string;
}

interface FormErrorSummaryProps {
  errors: FormError[];
  title?: string;
  className?: string;
  onFieldClick?: (field: string) => void;
}

/**
 * Accessible form error summary component that displays all form errors
 * in a single location and announces them to screen readers.
 *
 * @example
 * ```tsx
 * <FormErrorSummary
 *   errors={[
 *     { field: "email", message: "Email is required" },
 *     { field: "password", message: "Password must be at least 8 characters" },
 *   ]}
 *   onFieldClick={(field) => focusField(field)}
 * />
 * ```
 */
export function FormErrorSummary({
  errors,
  title = "Please correct the following errors:",
  className,
  onFieldClick,
}: FormErrorSummaryProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus the error summary when errors appear
  useEffect(() => {
    if (errors.length > 0 && containerRef.current) {
      containerRef.current.focus();
    }
  }, [errors]);

  if (errors.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      tabIndex={-1}
      className={cn(
        "rounded-lg border border-destructive/50 bg-destructive/10 p-4 mb-6",
        "focus:outline-none focus:ring-2 focus:ring-destructive focus:ring-offset-2",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <AlertCircle
          className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-destructive mb-2">
            {title}
          </h2>
          <ul className="list-disc list-inside space-y-1">
            {errors.map((error, index) => (
              <li key={`${error.field}-${index}`} className="text-sm">
                {onFieldClick ? (
                  <button
                    type="button"
                    onClick={() => onFieldClick(error.field)}
                    className="text-left hover:underline focus:underline focus:outline-none text-destructive"
                    aria-label={`Go to ${formatFieldName(error.field)} field. Error: ${error.message}`}
                  >
                    <span className="font-medium">{formatFieldName(error.field)}:</span>{" "}
                    {error.message}
                  </button>
                ) : (
                  <span>
                    <span className="font-medium">{formatFieldName(error.field)}:</span>{" "}
                    {error.message}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * Formats a field name for display
 */
function formatFieldName(fieldName: string): string {
  return fieldName
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

/**
 * Hook to convert react-hook-form errors to FormError array
 */
export function useFormErrors(
  errors: Record<string, { message?: string } | undefined>
): FormError[] {
  return React.useMemo(() => {
    return Object.entries(errors)
      .filter(([, error]) => error?.message)
      .map(([field, error]) => ({
        field,
        message: error!.message!,
      }));
  }, [errors]);
}

export default FormErrorSummary;

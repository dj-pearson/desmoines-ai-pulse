import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useAccessibility";

interface AccessibleLoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}

/**
 * Accessible loading spinner with proper ARIA attributes and reduced motion support
 */
export function AccessibleLoadingSpinner({ 
  size = "md", 
  className,
  label = "Loading..."
}: AccessibleLoadingSpinnerProps) {
  const prefersReducedMotion = useReducedMotion();

  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6", 
    lg: "h-8 w-8"
  };

  return (
    <div
      role="status"
      aria-label={label}
      aria-live="polite"
      className="flex items-center justify-center"
    >
      <Loader2 
        className={cn(
          sizeClasses[size],
          // Conditional animation based on user preference
          prefersReducedMotion ? "animate-pulse" : "animate-spin",
          className
        )}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
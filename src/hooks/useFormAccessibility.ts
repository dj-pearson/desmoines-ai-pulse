import { useCallback, useRef, useEffect } from "react";

/**
 * Hook for managing form accessibility features including
 * error announcements and focus management.
 *
 * @example
 * ```tsx
 * const { announceErrors, focusFirstError, formRef } = useFormAccessibility();
 *
 * const onSubmit = (data) => {
 *   if (errors.length > 0) {
 *     announceErrors(errors);
 *     focusFirstError();
 *     return;
 *   }
 *   // ... submit logic
 * };
 * ```
 */
export function useFormAccessibility<T extends HTMLFormElement = HTMLFormElement>() {
  const formRef = useRef<T>(null);
  const announcementRef = useRef<HTMLDivElement | null>(null);

  // Create a live region for announcements on mount
  useEffect(() => {
    const liveRegion = document.createElement("div");
    liveRegion.setAttribute("aria-live", "assertive");
    liveRegion.setAttribute("aria-atomic", "true");
    liveRegion.setAttribute("role", "alert");
    liveRegion.className = "sr-only";
    liveRegion.id = "form-error-announcements";
    liveRegion.style.cssText = `
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    `;

    // Only add if not already present
    if (!document.getElementById("form-error-announcements")) {
      document.body.appendChild(liveRegion);
    }
    announcementRef.current = liveRegion;

    return () => {
      // Don't remove on unmount as other forms may be using it
    };
  }, []);

  /**
   * Announces form errors to screen readers
   */
  const announceErrors = useCallback(
    (
      errors: string[] | Record<string, string | undefined>,
      prefix: string = "Form submission error"
    ) => {
      const liveRegion =
        announcementRef.current ||
        document.getElementById("form-error-announcements");
      if (!liveRegion) return;

      let errorMessages: string[];

      if (Array.isArray(errors)) {
        errorMessages = errors.filter(Boolean);
      } else {
        errorMessages = Object.entries(errors)
          .filter(([, message]) => message)
          .map(([field, message]) => `${formatFieldName(field)}: ${message}`);
      }

      if (errorMessages.length === 0) return;

      const announcement =
        errorMessages.length === 1
          ? `${prefix}. ${errorMessages[0]}`
          : `${prefix}. ${errorMessages.length} errors found. ${errorMessages.join(". ")}`;

      // Clear and set to trigger announcement
      liveRegion.textContent = "";
      requestAnimationFrame(() => {
        liveRegion.textContent = announcement;
      });
    },
    []
  );

  /**
   * Announces a single error message
   */
  const announceError = useCallback((message: string) => {
    const liveRegion =
      announcementRef.current ||
      document.getElementById("form-error-announcements");
    if (!liveRegion) return;

    liveRegion.textContent = "";
    requestAnimationFrame(() => {
      liveRegion.textContent = message;
    });
  }, []);

  /**
   * Announces success message
   */
  const announceSuccess = useCallback((message: string) => {
    const liveRegion =
      announcementRef.current ||
      document.getElementById("form-error-announcements");
    if (!liveRegion) return;

    // Temporarily change to polite for success messages
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.textContent = "";
    requestAnimationFrame(() => {
      liveRegion.textContent = message;
      // Reset to assertive after announcement
      setTimeout(() => {
        liveRegion.setAttribute("aria-live", "assertive");
      }, 1000);
    });
  }, []);

  /**
   * Focuses the first element with an error
   */
  const focusFirstError = useCallback(() => {
    if (!formRef.current) return;

    // Find elements with aria-invalid="true"
    const invalidElement = formRef.current.querySelector(
      '[aria-invalid="true"], .error, [data-invalid="true"]'
    ) as HTMLElement;

    if (invalidElement) {
      invalidElement.focus();
      invalidElement.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    // Fallback: find first input/select/textarea with error styling
    const errorInput = formRef.current.querySelector(
      'input:invalid, select:invalid, textarea:invalid, [class*="error"]'
    ) as HTMLElement;

    if (errorInput) {
      errorInput.focus();
      errorInput.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  /**
   * Focuses a specific field by name or id
   */
  const focusField = useCallback((fieldNameOrId: string) => {
    if (!formRef.current) return;

    const field = formRef.current.querySelector(
      `[name="${fieldNameOrId}"], #${fieldNameOrId}`
    ) as HTMLElement;

    if (field) {
      field.focus();
      field.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  /**
   * Creates props for error message elements
   */
  const getErrorProps = useCallback((fieldId: string, errorMessage?: string) => {
    if (!errorMessage) return {};

    return {
      id: `${fieldId}-error`,
      role: "alert" as const,
      "aria-live": "polite" as const,
    };
  }, []);

  /**
   * Creates props for input elements with errors
   */
  const getInputErrorProps = useCallback(
    (fieldId: string, hasError: boolean) => {
      if (!hasError) return {};

      return {
        "aria-invalid": true as const,
        "aria-describedby": `${fieldId}-error`,
      };
    },
    []
  );

  return {
    formRef,
    announceErrors,
    announceError,
    announceSuccess,
    focusFirstError,
    focusField,
    getErrorProps,
    getInputErrorProps,
  };
}

/**
 * Formats a field name for display in error messages
 */
function formatFieldName(fieldName: string): string {
  return fieldName
    .replace(/([A-Z])/g, " $1") // Add space before capitals
    .replace(/[_-]/g, " ") // Replace underscores and hyphens
    .replace(/^\w/, (c) => c.toUpperCase()) // Capitalize first letter
    .trim();
}

/**
 * Component that wraps form error messages for accessibility
 */
export interface FormErrorMessageProps {
  id: string;
  message?: string;
  className?: string;
}

export default useFormAccessibility;

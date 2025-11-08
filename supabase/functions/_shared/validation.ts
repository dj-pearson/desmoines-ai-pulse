/**
 * Input validation utilities for edge functions
 */

export interface ValidationRule {
  type: 'string' | 'number' | 'boolean' | 'email' | 'url';
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  default?: any;
}

export interface ValidationSchema {
  [key: string]: ValidationRule;
}

export interface ValidationResult {
  success: boolean;
  data?: Record<string, any>;
  errors?: Record<string, string>;
}

/**
 * Validate input against a schema
 */
export function validateInput(
  input: Record<string, any>,
  schema: ValidationSchema
): ValidationResult {
  const errors: Record<string, string> = {};
  const data: Record<string, any> = {};

  for (const [key, rule] of Object.entries(schema)) {
    const value = input[key];

    // Check required
    if (rule.required && (value === undefined || value === null || value === '')) {
      errors[key] = `${key} is required`;
      continue;
    }

    // Use default if not provided and not required
    if (value === undefined || value === null || value === '') {
      if (rule.default !== undefined) {
        data[key] = rule.default;
      }
      continue;
    }

    // Type validation
    switch (rule.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors[key] = `${key} must be a string`;
          break;
        }
        if (rule.min !== undefined && value.length < rule.min) {
          errors[key] = `${key} must be at least ${rule.min} characters`;
          break;
        }
        if (rule.max !== undefined && value.length > rule.max) {
          errors[key] = `${key} must be at most ${rule.max} characters`;
          break;
        }
        if (rule.pattern && !rule.pattern.test(value)) {
          errors[key] = `${key} has invalid format`;
          break;
        }
        data[key] = value;
        break;

      case 'number':
        const num = typeof value === 'string' ? parseFloat(value) : value;
        if (isNaN(num)) {
          errors[key] = `${key} must be a number`;
          break;
        }
        if (rule.min !== undefined && num < rule.min) {
          errors[key] = `${key} must be at least ${rule.min}`;
          break;
        }
        if (rule.max !== undefined && num > rule.max) {
          errors[key] = `${key} must be at most ${rule.max}`;
          break;
        }
        data[key] = num;
        break;

      case 'boolean':
        if (typeof value === 'string') {
          data[key] = value === 'true' || value === '1';
        } else {
          data[key] = Boolean(value);
        }
        break;

      case 'email':
        if (typeof value !== 'string') {
          errors[key] = `${key} must be a string`;
          break;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          errors[key] = `${key} must be a valid email`;
          break;
        }
        if (value.length > 254) {
          errors[key] = `${key} is too long`;
          break;
        }
        data[key] = value;
        break;

      case 'url':
        if (typeof value !== 'string') {
          errors[key] = `${key} must be a string`;
          break;
        }
        try {
          new URL(value);
          data[key] = value;
        } catch {
          errors[key] = `${key} must be a valid URL`;
        }
        break;

      default:
        data[key] = value;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  return { success: true, data };
}

/**
 * Sanitize string input to prevent SQL injection
 */
export function sanitizeString(input: string): string {
  // Remove potentially dangerous SQL characters and keywords
  return input
    .replace(/[';\\]/g, '') // Remove quotes and backslashes
    .trim();
}

/**
 * Validate query parameters from URL
 */
export function validateQueryParams(
  url: URL,
  schema: ValidationSchema
): ValidationResult {
  const params: Record<string, any> = {};

  for (const [key] of Object.entries(schema)) {
    const value = url.searchParams.get(key);
    if (value !== null) {
      params[key] = value;
    }
  }

  return validateInput(params, schema);
}

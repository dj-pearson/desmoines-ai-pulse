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

/**
 * SSRF Protection: Validate URL to prevent Server-Side Request Forgery attacks
 * Blocks private IP ranges, localhost, and non-HTTP protocols
 */
export interface SSRFValidationOptions {
  allowedDomains?: string[];
  allowedProtocols?: string[];
  blockPrivateIPs?: boolean;
}

export interface SSRFValidationResult {
  valid: boolean;
  error?: string;
  url?: URL;
}

/**
 * Check if an IP address is in a private range
 */
function isPrivateIP(hostname: string): boolean {
  // Check for localhost variants
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return true;
  }

  // Check for IPv4 private ranges
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);

    // 10.0.0.0/8
    if (a === 10) return true;

    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;

    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;

    // 169.254.0.0/16 (link-local)
    if (a === 169 && b === 254) return true;

    // 127.0.0.0/8 (loopback)
    if (a === 127) return true;

    // 0.0.0.0/8
    if (a === 0) return true;
  }

  // Check for common private hostnames
  const privatePatterns = [
    /^localhost$/i,
    /^127\.\d+\.\d+\.\d+$/,
    /\.local$/i,
    /\.internal$/i,
    /\.localhost$/i,
  ];

  return privatePatterns.some(pattern => pattern.test(hostname));
}

/**
 * Validate a URL for SSRF vulnerabilities
 */
export function validateURLForSSRF(
  urlString: string,
  options: SSRFValidationOptions = {}
): SSRFValidationResult {
  const {
    allowedDomains = [],
    allowedProtocols = ['http:', 'https:'],
    blockPrivateIPs = true,
  } = options;

  // Parse URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Check protocol
  if (!allowedProtocols.includes(parsedUrl.protocol)) {
    return {
      valid: false,
      error: `Protocol not allowed. Only ${allowedProtocols.join(', ')} are permitted`,
    };
  }

  // Check for private/internal IPs
  if (blockPrivateIPs && isPrivateIP(parsedUrl.hostname)) {
    return {
      valid: false,
      error: 'Access to private/internal addresses is not allowed',
    };
  }

  // Check allowed domains if specified
  if (allowedDomains.length > 0) {
    const isAllowed = allowedDomains.some(domain => {
      // Exact match or subdomain match
      return parsedUrl.hostname === domain ||
             parsedUrl.hostname.endsWith('.' + domain);
    });

    if (!isAllowed) {
      return {
        valid: false,
        error: `Domain not allowed. Permitted domains: ${allowedDomains.join(', ')}`,
      };
    }
  }

  // Block URLs with credentials
  if (parsedUrl.username || parsedUrl.password) {
    return {
      valid: false,
      error: 'URLs with embedded credentials are not allowed',
    };
  }

  return { valid: true, url: parsedUrl };
}

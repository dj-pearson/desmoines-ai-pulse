import { z } from "zod";
import DOMPurify from "dompurify";

/**
 * Security utilities for input validation and sanitization
 */
export class SecurityUtils {
  private static readonly MAX_STRING_LENGTH = 10000;
  private static readonly MAX_EMAIL_LENGTH = 254;
  private static readonly MAX_URL_LENGTH = 2048;

  /**
   * Rate limiting store for client-side tracking
   */
  private static rateLimitStore = new Map<string, { count: number; resetTime: number }>();

  /**
   * Sanitize HTML content to prevent XSS attacks
   */
  static sanitizeHTML(dirty: string): string {
    if (typeof window === 'undefined') {
      // Server-side fallback - basic HTML escaping
      return dirty
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
    }
    return DOMPurify.sanitize(dirty, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
      ALLOWED_ATTR: ['href', 'target'],
      ALLOW_DATA_ATTR: false,
    });
  }

  /**
   * Validate and sanitize user input
   */
  static validateInput(input: unknown, schema: z.ZodSchema): z.SafeParseReturnType<unknown, unknown> {
    try {
      return schema.safeParse(input);
    } catch (error) {
      return {
        success: false,
        error: error as z.ZodError,
      };
    }
  }

  /**
   * Check if a string contains potential SQL injection patterns
   */
  static containsSQLInjection(input: string): boolean {
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/i,
      /(;|\-\-|\/\*|\*\/)/,
      /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/i,
      /(\b(OR|AND)\b\s+\w+\s*=\s*\w+)/i,
      /(SCRIPT[\s\S]*?>)/i,
    ];
    
    return sqlPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Validate email format with additional security checks
   */
  static validateEmail(email: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!email || typeof email !== 'string') {
      errors.push('Email is required');
      return { isValid: false, errors };
    }
    
    if (email.length > this.MAX_EMAIL_LENGTH) {
      errors.push(`Email must be less than ${this.MAX_EMAIL_LENGTH} characters`);
    }
    
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    
    if (!emailRegex.test(email)) {
      errors.push('Invalid email format');
    }
    
    if (this.containsSQLInjection(email)) {
      errors.push('Invalid characters detected');
    }
    
    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate URL with security checks
   */
  static validateURL(url: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!url || typeof url !== 'string') {
      errors.push('URL is required');
      return { isValid: false, errors };
    }
    
    if (url.length > this.MAX_URL_LENGTH) {
      errors.push(`URL must be less than ${this.MAX_URL_LENGTH} characters`);
    }
    
    try {
      const parsedUrl = new URL(url);
      
      // Only allow HTTP and HTTPS protocols
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        errors.push('Only HTTP and HTTPS URLs are allowed');
      }
      
      // Block local and private IP ranges
      const hostname = parsedUrl.hostname;
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('172.')
      ) {
        errors.push('Local and private IP addresses are not allowed');
      }
      
    } catch (error) {
      errors.push('Invalid URL format');
    }
    
    if (this.containsSQLInjection(url)) {
      errors.push('Invalid characters detected');
    }
    
    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate password strength
   */
  static validatePassword(password: string): { isValid: boolean; errors: string[]; strength: 'weak' | 'medium' | 'strong' } {
    const errors: string[] = [];
    let strength: 'weak' | 'medium' | 'strong' = 'weak';
    
    if (!password || typeof password !== 'string') {
      errors.push('Password is required');
      return { isValid: false, errors, strength };
    }
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    
    if (password.length > 128) {
      errors.push('Password must be less than 128 characters long');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    
    // Calculate strength
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    const criteriaCount = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;
    
    if (password.length >= 12 && criteriaCount >= 3) {
      strength = 'strong';
    } else if (password.length >= 8 && criteriaCount >= 2) {
      strength = 'medium';
    }
    
    return { isValid: errors.length === 0, errors, strength };
  }

  /**
   * Client-side rate limiting check
   */
  static checkRateLimit(identifier: string, maxRequests: number, windowMs: number): { allowed: boolean; resetTime: number } {
    const now = Date.now();
    const key = `${identifier}_${Math.floor(now / windowMs)}`;
    
    const existing = this.rateLimitStore.get(key);
    const resetTime = Math.ceil(now / windowMs) * windowMs;
    
    if (!existing) {
      this.rateLimitStore.set(key, { count: 1, resetTime });
      return { allowed: true, resetTime };
    }
    
    if (existing.count >= maxRequests) {
      return { allowed: false, resetTime };
    }
    
    existing.count++;
    return { allowed: true, resetTime };
  }

  /**
   * Generate secure random token
   */
  static generateSecureToken(length: number = 32): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      const array = new Uint8Array(length);
      window.crypto.getRandomValues(array);
      
      for (let i = 0; i < length; i++) {
        result += charset[array[i] % charset.length];
      }
    } else {
      // Fallback for environments without crypto API
      for (let i = 0; i < length; i++) {
        result += charset[Math.floor(Math.random() * charset.length)];
      }
    }
    
    return result;
  }

  /**
   * Validate file upload security
   */
  static validateFileUpload(file: File): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'text/plain',
      'text/csv',
    ];
    
    if (!file) {
      errors.push('File is required');
      return { isValid: false, errors };
    }
    
    if (file.size > maxSize) {
      errors.push('File size must be less than 10MB');
    }
    
    if (!allowedTypes.includes(file.type)) {
      errors.push('File type not allowed');
    }
    
    // Check for potentially dangerous file extensions
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.com', '.vbs', '.js', '.jar'];
    const fileName = file.name.toLowerCase();
    
    if (dangerousExtensions.some(ext => fileName.endsWith(ext))) {
      errors.push('File extension not allowed');
    }
    
    return { isValid: errors.length === 0, errors };
  }

  /**
   * Clean up rate limit store periodically
   */
  static cleanupRateLimitStore(): void {
    const now = Date.now();
    for (const [key, value] of this.rateLimitStore.entries()) {
      if (now > value.resetTime) {
        this.rateLimitStore.delete(key);
      }
    }
  }
}

/**
 * Common validation schemas
 */
export const ValidationSchemas = {
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  url: z.string().url().max(2048),
  text: z.string().max(10000),
  id: z.string().uuid(),
  positiveNumber: z.number().positive(),
  nonEmptyString: z.string().min(1).max(1000),
  rating: z.number().min(1).max(5),
  coordinates: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  phoneNumber: z.string().regex(/^\+?[\d\s\-\(\)]{10,}$/, 'Invalid phone number format'),
  slug: z.string().regex(/^[a-z0-9\-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
};
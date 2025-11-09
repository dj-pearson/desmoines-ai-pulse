/**
 * CSRF Protection Utilities
 *
 * Implements Double Submit Cookie pattern for CSRF protection
 *
 * SECURITY FIX: Prevents Cross-Site Request Forgery attacks
 */

import React from 'react';
import { SecurityUtils } from './security';

const CSRF_TOKEN_KEY = 'csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';

export class CSRFProtection {
  private static token: string | null = null;

  /**
   * Generate a new CSRF token
   */
  static generateToken(): string {
    const token = SecurityUtils.generateSecureToken(32);
    this.token = token;

    // Store in sessionStorage (cleared on tab close)
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(CSRF_TOKEN_KEY, token);
    }

    return token;
  }

  /**
   * Get the current CSRF token, generating one if needed
   */
  static getToken(): string {
    if (this.token) {
      return this.token;
    }

    // Try to load from sessionStorage
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem(CSRF_TOKEN_KEY);
      if (stored) {
        this.token = stored;
        return stored;
      }
    }

    // Generate new token if none exists
    return this.generateToken();
  }

  /**
   * Validate CSRF token from request
   */
  static validateToken(token: string): boolean {
    const currentToken = this.getToken();

    if (!token || !currentToken) {
      return false;
    }

    // Constant-time comparison to prevent timing attacks
    return this.constantTimeCompare(token, currentToken);
  }

  /**
   * Constant-time string comparison
   */
  private static constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  /**
   * Add CSRF token to fetch request headers
   */
  static addTokenToHeaders(headers: HeadersInit = {}): HeadersInit {
    return {
      ...headers,
      [CSRF_HEADER_NAME]: this.getToken(),
    };
  }

  /**
   * Clear the current CSRF token (e.g., on logout)
   */
  static clearToken(): void {
    this.token = null;
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(CSRF_TOKEN_KEY);
    }
  }

  /**
   * Refresh token (should be called periodically)
   */
  static refreshToken(): string {
    this.clearToken();
    return this.generateToken();
  }
}

/**
 * Higher-order function to add CSRF protection to fetch calls
 */
export function withCSRF(
  url: string,
  options: RequestInit = {}
): [string, RequestInit] {
  const headers = CSRFProtection.addTokenToHeaders(options.headers);

  return [url, { ...options, headers }];
}

/**
 * React Hook for CSRF token management
 */
export function useCSRF() {
  const getToken = () => CSRFProtection.getToken();
  const refreshToken = () => CSRFProtection.refreshToken();
  const clearToken = () => CSRFProtection.clearToken();

  return {
    token: getToken(),
    getToken,
    refreshToken,
    clearToken,
    addToHeaders: (headers?: HeadersInit) => CSRFProtection.addTokenToHeaders(headers),
  };
}

/**
 * Form component helper to include CSRF token
 */
export function CSRFInput() {
  const token = CSRFProtection.getToken();

  return (
    <input
      type="hidden"
      name="csrf_token"
      value={token}
    />
  );
}

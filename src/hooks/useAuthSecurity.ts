import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SecurityUtils, ValidationSchemas } from "@/lib/securityUtils";
import { createLogger } from '@/lib/logger';

const log = createLogger('useAuthSecurity');

interface AuthSecurityHookReturn {
  isBlocked: boolean;
  timeUntilReset: number;
  checkRateLimit: (email: string) => Promise<{ allowed: boolean; message?: string }>;
  checkDisposableEmail: (email: string) => Promise<{ allowed: boolean; message?: string }>;
  logFailedAttempt: (email: string, attemptType: 'login' | 'signup' | 'password_reset', errorMessage: string) => Promise<void>;
  validateInput: (field: string, value: string) => { isValid: boolean; errors: string[] };
}

export function useAuthSecurity(): AuthSecurityHookReturn {
  const [isBlocked, setIsBlocked] = useState(false);
  const [timeUntilReset, setTimeUntilReset] = useState(0);

  const checkRateLimit = async (email: string): Promise<{ allowed: boolean; message?: string }> => {
    try {
      // Validate email first
      const emailValidation = SecurityUtils.validateEmail(email);
      if (!emailValidation.isValid) {
        return { 
          allowed: false, 
          message: emailValidation.errors[0] 
        };
      }

      // Client-side rate limiting check
      const clientLimit = SecurityUtils.checkRateLimit(
        `auth_${email}`, 
        5, // max 5 attempts
        15 * 60 * 1000 // 15 minutes
      );

      if (!clientLimit.allowed) {
        setIsBlocked(true);
        const resetTimeMs = clientLimit.resetTime - Date.now();
        setTimeUntilReset(Math.max(0, Math.ceil(resetTimeMs / 1000)));
        
        return { 
          allowed: false, 
          message: `Too many attempts. Please try again in ${Math.ceil(resetTimeMs / 1000 / 60)} minutes.` 
        };
      }

      // WEB-SEC-028. This used to call check_auth_rate_limit() and BLOCK on its
      // answer. The table behind it, failed_auth_attempts, had an INSERT policy
      // of WITH CHECK (true), so five unauthenticated PostgREST calls naming any
      // address disabled that address's login and signup buttons for fifteen
      // minutes -- a denial-of-service needing no account and costing nothing.
      //
      // The RPC is no longer called and the anonymous INSERT policy is dropped
      // in migration 20260902000007. The authoritative throttle is the
      // check-login-attempt edge function, keyed on the source address it reads
      // from the request headers, which AuthContext consults before every
      // sign-in.
      //
      // What survives is the local counter above: per browser, reset by a
      // reload, and incapable of affecting anyone but the person in front of it.
      return { allowed: true };
    } catch (error) {
      log.error('checkRateLimit', 'Rate limit check error', { error });
      return { allowed: true }; // Fail open
    }
  };

  /**
   * Check whether the email's domain is on the disposable / blocked list.
   * Calls the `is_email_domain_blocked` RPC which looks the domain up in
   * public.blocked_email_domains. Fails open on transport errors so a
   * database outage never blocks legitimate signups.
   */
  const checkDisposableEmail = async (
    email: string
  ): Promise<{ allowed: boolean; message?: string }> => {
    try {
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return { allowed: true };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)(
        'is_email_domain_blocked',
        { p_email: email.trim().toLowerCase() }
      );

      if (error) {
        log.error('checkDisposableEmail', 'Disposable email RPC failed', { error });
        return { allowed: true }; // fail open
      }

      if (data === true) {
        return {
          allowed: false,
          message:
            'Disposable and temporary email addresses are not allowed. Please use a permanent email.',
        };
      }

      return { allowed: true };
    } catch (error) {
      log.error('checkDisposableEmail', 'Disposable email check error', { error });
      return { allowed: true }; // fail open
    }
  };

  /**
   * WEB-SEC-028: records nothing.
   *
   * This wrote a row into failed_auth_attempts from the browser, and that table
   * fed a throttle that blocked sign-in. Anyone with the anon key could write
   * the same rows for an address they did not own, so the "log" was an input to
   * a lockout rather than a record of one.
   *
   * Failures are recorded server-side by the check-login-attempt edge function,
   * which AuthContext already calls, on the service role and keyed to the source
   * address it observes rather than one supplied in a body. The signature is
   * kept because Auth.tsx awaits it on several paths; making it inert is the
   * whole change.
   */
  const logFailedAttempt = async (
    _email: string,
    _attemptType: 'login' | 'signup' | 'password_reset',
    _errorMessage: string
  ): Promise<void> => {
    // Intentionally empty. See above.
  };

  const validateInput = (field: string, value: string): { isValid: boolean; errors: string[] } => {
    switch (field) {
      case 'email':
        return SecurityUtils.validateEmail(value);
      
      case 'password':
        const result = SecurityUtils.validatePassword(value);
        return { isValid: result.isValid, errors: result.errors };
      
      case 'firstName':
      case 'lastName':
        if (!value || value.trim().length === 0) {
          return { isValid: false, errors: [`${field} is required`] };
        }
        if (value.length > 100) {
          return { isValid: false, errors: [`${field} must be less than 100 characters`] };
        }
        if (SecurityUtils.containsSQLInjection(value)) {
          return { isValid: false, errors: ['Invalid characters detected'] };
        }
        return { isValid: true, errors: [] };
      
      case 'phone':
        if (!value) return { isValid: true, errors: [] }; // Optional field
        
        const phoneValidation = SecurityUtils.validateInput(value, ValidationSchemas.phoneNumber);
        if (!phoneValidation.success) {
          return { 
            isValid: false, 
            errors: phoneValidation.error.errors.map(e => e.message) 
          };
        }
        return { isValid: true, errors: [] };
      
      case 'location':
        if (!value) return { isValid: true, errors: [] }; // Optional field
        
        if (value.length > 200) {
          return { isValid: false, errors: ['Location must be less than 200 characters'] };
        }
        if (SecurityUtils.containsSQLInjection(value)) {
          return { isValid: false, errors: ['Invalid characters detected'] };
        }
        return { isValid: true, errors: [] };
      
      default:
        return { isValid: true, errors: [] };
    }
  };

  return {
    isBlocked,
    timeUntilReset,
    checkRateLimit,
    checkDisposableEmail,
    logFailedAttempt,
    validateInput,
  };
}
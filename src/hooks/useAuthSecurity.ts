import { supabase } from "@/integrations/supabase/client";
import { SecurityUtils, ValidationSchemas } from "@/lib/securityUtils";
import { createLogger } from '@/lib/logger';

const log = createLogger('useAuthSecurity');

/**
 * Client-side checks for /auth.
 *
 * WHAT IS NOT HERE ANY MORE (account plan WP1 item 3). This hook used to carry
 * a second login limiter with an `isBlocked` flag. It counted every press of
 * Sign In, successful ones included, set isBlocked and never cleared it, and
 * froze its countdown at whatever it read on the fifth press, so the banner
 * could say "try again in 15 minutes" forever. The throttles that remain are
 * AuthContext's failure-only counter and the check-login-attempt edge function,
 * which is authoritative and whose `lockoutSeconds` /auth now counts down live.
 *
 * `logFailedAttempt` went with it. It had been inert since WEB-SEC-028 (the
 * server records failures), and a no-op that callers await is a trap.
 */
interface AuthSecurityHookReturn {
  checkDisposableEmail: (email: string) => Promise<{ allowed: boolean; message?: string }>;
  validateInput: (field: string, value: string) => { isValid: boolean; errors: string[] };
}

export function useAuthSecurity(): AuthSecurityHookReturn {
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
   * Field checks. No containsSQLInjection anywhere in here (WP1 item 2): it
   * rejected real names and addresses on whole words like "Union" or "Drop",
   * and every value goes to GoTrue or PostgREST as a parameter anyway.
   */
  const validateInput = (field: string, value: string): { isValid: boolean; errors: string[] } => {
    switch (field) {
      case 'email':
        return SecurityUtils.validateEmail(value);

      case 'password': {
        const result = SecurityUtils.validatePassword(value);
        return { isValid: result.isValid, errors: result.errors };
      }

      case 'firstName':
      case 'lastName':
        if (!value || value.trim().length === 0) {
          return { isValid: false, errors: [`${field} is required`] };
        }
        if (value.length > 100) {
          return { isValid: false, errors: [`${field} must be less than 100 characters`] };
        }
        return { isValid: true, errors: [] };

      case 'phone': {
        if (!value) return { isValid: true, errors: [] }; // Optional field

        const phoneValidation = SecurityUtils.validateInput(value, ValidationSchemas.phoneNumber);
        if (!phoneValidation.success) {
          return {
            isValid: false,
            errors: phoneValidation.error.errors.map(e => e.message)
          };
        }
        return { isValid: true, errors: [] };
      }

      case 'location':
        if (!value) return { isValid: true, errors: [] }; // Optional field
        if (value.length > 200) {
          return { isValid: false, errors: ['Location must be less than 200 characters'] };
        }
        return { isValid: true, errors: [] };

      default:
        return { isValid: true, errors: [] };
    }
  };

  return {
    checkDisposableEmail,
    validateInput,
  };
}

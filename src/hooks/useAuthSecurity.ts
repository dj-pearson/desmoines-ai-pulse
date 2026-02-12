import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SecurityUtils, ValidationSchemas } from "@/lib/securityUtils";
import { createLogger } from '@/lib/logger';

const log = createLogger('useAuthSecurity');

interface AuthSecurityHookReturn {
  isBlocked: boolean;
  remainingAttempts: number;
  timeUntilReset: number;
  checkRateLimit: (email: string) => Promise<{ allowed: boolean; message?: string }>;
  logFailedAttempt: (email: string, attemptType: 'login' | 'signup' | 'password_reset', errorMessage: string) => Promise<void>;
  validateInput: (field: string, value: string) => { isValid: boolean; errors: string[] };
}

export function useAuthSecurity(): AuthSecurityHookReturn {
  const [isBlocked, setIsBlocked] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState(5);
  const [timeUntilReset, setTimeUntilReset] = useState(0);

  const getClientInfo = () => {
    return {
      ip_address: '', // Will be set by server
      user_agent: navigator.userAgent || 'Unknown',
    };
  };

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

      // Server-side rate limiting check via database function
      const { data: rateLimitResult, error } = await supabase.rpc('check_auth_rate_limit', {
        p_email: email,
        p_ip_address: 'client' // Will be set by server middleware
      });

      if (error) {
        log.error('Rate limit check failed', { action: 'checkRateLimit', metadata: { error } });
        return { allowed: true }; // Fail open for rate limiting
      }

      // Type-safe handling of the JSON response
      const rateLimitData = rateLimitResult as any;
      
      if (rateLimitData?.blocked) {
        setIsBlocked(true);
        setRemainingAttempts(0);
        setTimeUntilReset(15 * 60); // 15 minutes
        
        const reason = rateLimitData.email_blocked 
          ? 'Too many failed attempts for this email'
          : 'Too many failed attempts from this location';
          
        return { 
          allowed: false, 
          message: `${reason}. Please try again later.` 
        };
      }

      // Update remaining attempts
      if (rateLimitData?.email_attempts !== undefined) {
        setRemainingAttempts(Math.max(0, 5 - rateLimitData.email_attempts));
      }

      return { allowed: true };
    } catch (error) {
      log.error('Rate limit check error', { action: 'checkRateLimit', metadata: { error } });
      return { allowed: true }; // Fail open
    }
  };

  const logFailedAttempt = async (
    email: string, 
    attemptType: 'login' | 'signup' | 'password_reset', 
    errorMessage: string
  ): Promise<void> => {
    try {
      const clientInfo = getClientInfo();
      
      await supabase.from('failed_auth_attempts').insert({
        email: email,
        attempt_type: attemptType,
        error_message: errorMessage,
        user_agent: clientInfo.user_agent,
        ip_address: clientInfo.ip_address
      });
    } catch (error) {
      log.error('Failed to log auth attempt', { action: 'logFailedAttempt', metadata: { error } });
      // Don't throw - logging failure shouldn't block auth
    }
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
    remainingAttempts,
    timeUntilReset,
    checkRateLimit,
    logFailedAttempt,
    validateInput,
  };
}
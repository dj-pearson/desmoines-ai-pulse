import { useState, useEffect, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface LockoutStatus {
  locked: boolean;
  lockout_until?: string;
  remaining_seconds?: number;
  message?: string;
  recent_failures?: number;
  remaining_attempts?: number;
}

interface LoginAttemptResult {
  success: boolean;
  locked?: boolean;
  lockout_until?: string;
  remaining_attempts?: number;
}

interface AccountLockoutSettings {
  max_attempts: number;
  lockout_duration_minutes: number;
  lockout_escalation: boolean;
  escalation_multiplier: number;
  max_lockout_hours: number;
  permanent_lockout_threshold: number;
  notify_on_lockout: boolean;
  notify_admin_on_permanent: boolean;
}

/**
 * Hook for managing account lockout functionality
 *
 * Provides:
 * - Check if account is locked
 * - Record login attempts (success/failure)
 * - Get lockout countdown timer
 * - Get remaining login attempts
 */
export function useAccountLockout() {
  const [lockoutCountdown, setLockoutCountdown] = useState<number | null>(null);

  // Check if an email is locked
  const checkLockoutMutation = useMutation({
    mutationFn: async (email: string): Promise<LockoutStatus> => {
      const { data, error } = await supabase
        .rpc('is_account_locked', { p_email: email.toLowerCase() });

      if (error) {
        console.error('Error checking lockout status:', error);
        throw error;
      }

      return data as LockoutStatus;
    },
  });

  // Record a login attempt
  const recordAttemptMutation = useMutation({
    mutationFn: async ({
      email,
      success,
      ipAddress,
      userAgent,
      failureReason,
    }: {
      email: string;
      success: boolean;
      ipAddress?: string;
      userAgent?: string;
      failureReason?: string;
    }): Promise<LoginAttemptResult> => {
      const { data, error } = await supabase
        .rpc('record_login_attempt', {
          p_email: email.toLowerCase(),
          p_success: success,
          p_ip_address: ipAddress || null,
          p_user_agent: userAgent || navigator.userAgent,
          p_failure_reason: failureReason || null,
        });

      if (error) {
        console.error('Error recording login attempt:', error);
        throw error;
      }

      return data as LoginAttemptResult;
    },
  });

  // Get lockout settings (for admins)
  const { data: lockoutSettings } = useQuery<AccountLockoutSettings | null>({
    queryKey: ['lockout-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_lockout_settings')
        .select('*')
        .eq('is_active', true)
        .single();

      if (error) {
        console.error('Error fetching lockout settings:', error);
        return null;
      }

      return data as AccountLockoutSettings;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Check if account is locked (convenience method)
  const isAccountLocked = useCallback(async (email: string): Promise<LockoutStatus> => {
    return await checkLockoutMutation.mutateAsync(email);
  }, [checkLockoutMutation]);

  // Record successful login
  const recordSuccessfulLogin = useCallback(async (email: string) => {
    return await recordAttemptMutation.mutateAsync({
      email,
      success: true,
      userAgent: navigator.userAgent,
    });
  }, [recordAttemptMutation]);

  // Record failed login
  const recordFailedLogin = useCallback(async (
    email: string,
    failureReason?: string
  ) => {
    return await recordAttemptMutation.mutateAsync({
      email,
      success: false,
      userAgent: navigator.userAgent,
      failureReason,
    });
  }, [recordAttemptMutation]);

  // Start lockout countdown timer
  const startLockoutCountdown = useCallback((remainingSeconds: number) => {
    setLockoutCountdown(remainingSeconds);
  }, []);

  // Countdown effect
  useEffect(() => {
    if (lockoutCountdown === null || lockoutCountdown <= 0) return;

    const timer = setInterval(() => {
      setLockoutCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [lockoutCountdown]);

  // Format countdown for display
  const formatCountdown = (seconds: number | null): string => {
    if (seconds === null || seconds <= 0) return '';

    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;

    if (minutes > 0) {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
    return `${secs} seconds`;
  };

  // Get lockout message based on remaining attempts
  const getLockoutWarningMessage = (remainingAttempts: number): string | null => {
    if (remainingAttempts <= 0) {
      return 'Your account has been locked due to too many failed attempts.';
    }
    if (remainingAttempts === 1) {
      return 'Warning: This is your last attempt before your account is locked.';
    }
    if (remainingAttempts <= 2) {
      return `Warning: Only ${remainingAttempts} attempts remaining before your account is locked.`;
    }
    return null;
  };

  return {
    // Mutations
    checkLockout: checkLockoutMutation.mutateAsync,
    recordAttempt: recordAttemptMutation.mutateAsync,

    // Convenience methods
    isAccountLocked,
    recordSuccessfulLogin,
    recordFailedLogin,

    // Countdown timer
    lockoutCountdown,
    lockoutCountdownFormatted: formatCountdown(lockoutCountdown),
    startLockoutCountdown,

    // Settings
    lockoutSettings,
    maxAttempts: lockoutSettings?.max_attempts ?? 5,
    lockoutDurationMinutes: lockoutSettings?.lockout_duration_minutes ?? 15,

    // Helpers
    getLockoutWarningMessage,

    // Loading states
    isCheckingLockout: checkLockoutMutation.isPending,
    isRecordingAttempt: recordAttemptMutation.isPending,
  };
}

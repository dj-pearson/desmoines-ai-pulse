import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface MagicLinkSettings {
  max_requests_per_hour: number;
  token_expiry_minutes: number;
  allow_signup: boolean;
  allow_login: boolean;
  require_existing_account: boolean;
}

interface RateLimitResult {
  allowed: boolean;
  remaining?: number;
  message?: string;
  retry_after?: number;
}

interface SendMagicLinkResult {
  success: boolean;
  message: string;
  expiresInMinutes?: number;
}

/**
 * Hook for passwordless authentication via magic links
 *
 * Provides:
 * - Send magic link for login/signup
 * - Rate limiting for magic link requests
 * - Supabase OTP integration
 */
export function useMagicLink() {
  const [lastSentEmail, setLastSentEmail] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Check rate limit before sending
  const checkRateLimitMutation = useMutation({
    mutationFn: async (email: string): Promise<RateLimitResult> => {
      try {
        const { data, error } = await supabase
          .rpc('check_magic_link_rate_limit', { p_email: email.toLowerCase() });

        if (error) throw error;
        return data as RateLimitResult;
      } catch (err) {
        console.error('Error checking magic link rate limit:', err);
        // Fail open - allow the request
        return { allowed: true };
      }
    },
  });

  // Send magic link using Supabase Auth
  const sendMagicLinkMutation = useMutation({
    mutationFn: async ({
      email,
      redirectTo,
      metadata,
    }: {
      email: string;
      redirectTo?: string;
      metadata?: Record<string, unknown>;
    }): Promise<SendMagicLinkResult> => {
      // First check rate limit
      const rateLimit = await checkRateLimitMutation.mutateAsync(email);

      if (!rateLimit.allowed) {
        return {
          success: false,
          message: rateLimit.message || 'Too many requests. Please try again later.',
        };
      }

      // Send magic link via Supabase
      const { error } = await supabase.auth.signInWithOtp({
        email: email.toLowerCase(),
        options: {
          emailRedirectTo: redirectTo || `${window.location.origin}/auth/callback`,
          data: metadata,
          shouldCreateUser: true, // Allow signup via magic link
        },
      });

      if (error) {
        console.error('Error sending magic link:', error);
        return {
          success: false,
          message: error.message || 'Failed to send magic link',
        };
      }

      setLastSentEmail(email);
      setCooldownSeconds(60); // 1 minute cooldown between resends

      return {
        success: true,
        message: 'Magic link sent! Check your email.',
        expiresInMinutes: 15,
      };
    },
  });

  // Verify OTP from magic link (if using token-based verification)
  const verifyMagicLinkMutation = useMutation({
    mutationFn: async ({
      email,
      token,
    }: {
      email: string;
      token: string;
    }) => {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.toLowerCase(),
        token,
        type: 'magiclink',
      });

      if (error) {
        console.error('Error verifying magic link:', error);
        throw error;
      }

      return data;
    },
  });

  // Send magic link
  const sendMagicLink = useCallback(async (
    email: string,
    options: {
      redirectTo?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<SendMagicLinkResult> => {
    // Check cooldown
    if (cooldownSeconds > 0 && email === lastSentEmail) {
      return {
        success: false,
        message: `Please wait ${cooldownSeconds} seconds before requesting another link.`,
      };
    }

    return sendMagicLinkMutation.mutateAsync({
      email,
      redirectTo: options.redirectTo,
      metadata: options.metadata,
    });
  }, [cooldownSeconds, lastSentEmail, sendMagicLinkMutation]);

  // Resend magic link
  const resendMagicLink = useCallback(async (): Promise<SendMagicLinkResult> => {
    if (!lastSentEmail) {
      return {
        success: false,
        message: 'No previous email to resend to.',
      };
    }

    if (cooldownSeconds > 0) {
      return {
        success: false,
        message: `Please wait ${cooldownSeconds} seconds before resending.`,
      };
    }

    return sendMagicLink(lastSentEmail);
  }, [lastSentEmail, cooldownSeconds, sendMagicLink]);

  // Cooldown timer effect (handled externally or via interval)
  const startCooldown = useCallback((seconds: number) => {
    setCooldownSeconds(seconds);

    const interval = setInterval(() => {
      setCooldownSeconds(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Check if email exists (for login-only mode)
  const checkEmailExists = useCallback(async (email: string): Promise<boolean> => {
    try {
      // This is a workaround - Supabase doesn't expose a direct email check
      // We can try to get user by email in profiles
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      return !!data;
    } catch (error) {
      console.error('Error checking email existence:', error);
      return false;
    }
  }, []);

  return {
    // Send magic link
    sendMagicLink,
    resendMagicLink,
    verifyMagicLink: verifyMagicLinkMutation.mutateAsync,

    // State
    lastSentEmail,
    cooldownSeconds,
    isCooldownActive: cooldownSeconds > 0,

    // Loading states
    isSending: sendMagicLinkMutation.isPending,
    isVerifying: verifyMagicLinkMutation.isPending,
    isCheckingRateLimit: checkRateLimitMutation.isPending,

    // Errors
    sendError: sendMagicLinkMutation.error,
    verifyError: verifyMagicLinkMutation.error,

    // Helpers
    checkEmailExists,
    startCooldown,

    // Reset state
    reset: () => {
      setLastSentEmail(null);
      setCooldownSeconds(0);
    },
  };
}

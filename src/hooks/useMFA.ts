import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { createLogger } from '@/lib/logger';
import { handleError } from '@/lib/errorHandler';
import type { AuthMFAEnrollResponse, AuthMFAVerifyResponse, AuthMFAChallengeResponse, Factor } from '@supabase/supabase-js';

const logger = createLogger('useMFA');

export interface MFAFactor {
  id: string;
  friendly_name: string;
  factor_type: 'totp' | 'phone';
  status: 'unverified' | 'verified';
  created_at: string;
  updated_at: string;
}

export interface EnrollmentData {
  qrCode: string;
  secret: string;
  factorId: string;
}

/** What the settings page needs to know about a user's authenticators. */
export interface MFAFactorSummary {
  /** Every TOTP factor on the account, verified or not. */
  all: MFAFactor[];
  verified: MFAFactor[];
  /** Enrolments that were started and never finished. */
  unverified: MFAFactor[];
}

const EMPTY_SUMMARY: MFAFactorSummary = { all: [], verified: [], unverified: [] };

/** One key for the factor list, so SecurityCheckup and MFAManagement share a read. */
export const mfaFactorsKey = (userId: string | undefined) => ['mfa-factors', userId ?? 'anonymous'] as const;

function toFactor(factor: Factor): MFAFactor {
  return {
    id: factor.id,
    friendly_name: factor.friendly_name || 'Authenticator app',
    factor_type: factor.factor_type === 'phone' ? 'phone' : 'totp',
    status: factor.status === 'verified' ? 'verified' : 'unverified',
    created_at: factor.created_at,
    updated_at: factor.updated_at,
  };
}

/**
 * Read the factor list once.
 *
 * `data.totp` from listFactors() holds VERIFIED factors only (auth-js puts a
 * factor in its type bucket only when status is verified), so the old code
 * never saw an abandoned enrolment. Those are what make a second setup fail:
 * GoTrue refuses a duplicate friendly name, and every factor used to be called
 * "Authenticator App". `data.all` is the complete list.
 */
async function fetchFactorSummary(): Promise<MFAFactorSummary> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  const all = (data?.all ?? []).filter((f) => f.factor_type === 'totp').map(toFactor);
  return {
    all,
    verified: all.filter((f) => f.status === 'verified'),
    unverified: all.filter((f) => f.status === 'unverified'),
  };
}

/**
 * The account's authenticators as a query. MFAManagement and SecurityCheckup
 * both read this, so /profile?tab=settings makes one listFactors() call (one
 * GET /auth/v1/user) instead of the three it made before.
 */
export function useMFAFactors() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: mfaFactorsKey(user?.id),
    queryFn: fetchFactorSummary,
    enabled: !!user,
    staleTime: 60 * 1000,
  });
  return {
    ...query,
    summary: query.data ?? EMPTY_SUMMARY,
  };
}

/**
 * The next free "Authenticator N" name. GoTrue rejects a second factor with the
 * same friendly name, so a fixed default made "add a backup" fail every time.
 */
export function nextAuthenticatorName(existing: MFAFactor[]): string {
  const taken = new Set(existing.map((f) => f.friendly_name.trim().toLowerCase()));
  for (let n = existing.length + 1; n < existing.length + 50; n++) {
    const candidate = n === 1 ? 'Authenticator' : `Authenticator ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `Authenticator ${Date.now()}`;
}

/**
 * Custom hook for Multi-Factor Authentication (MFA) management
 * Provides TOTP-based two-factor authentication functionality
 *
 * Features:
 * - Enroll new MFA factors (TOTP)
 * - Verify enrolled factors
 * - Challenge and verify during login
 * - List and unenroll factors
 * - Check AAL (Authenticator Assurance Level)
 */
export function useMFA() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [factors, setFactors] = useState<MFAFactor[]>([]);

  const invalidateFactors = useCallback(
    () => queryClient.invalidateQueries({ queryKey: mfaFactorsKey(user?.id) }),
    [queryClient, user?.id],
  );

  /**
   * Remove enrolments that were started and never verified. Called before a
   * new enrolment and when the setup dialog closes half way, so an abandoned
   * QR code never blocks the next attempt. Failures are logged, not toasted:
   * the enrol that follows will say so if it matters.
   */
  const clearUnverifiedFactors = useCallback(async (): Promise<void> => {
    try {
      const { unverified } = await fetchFactorSummary();
      for (const factor of unverified) {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (error) {
          logger.warn('clearUnverifiedFactors', 'could not remove an unfinished enrolment', { error });
        }
      }
    } catch (error) {
      logger.warn('clearUnverifiedFactors', 'could not list factors', { error });
    }
  }, []);

  /**
   * Enroll a new TOTP factor
   * Returns QR code and secret for authenticator app setup
   */
  const enrollTOTP = useCallback(async (friendlyName?: string): Promise<EnrollmentData | null> => {
    setIsLoading(true);
    try {
      await clearUnverifiedFactors();

      const { data, error }: AuthMFAEnrollResponse = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: friendlyName?.trim() || 'Authenticator',
      });

      if (error) throw error;

      if (!data) {
        throw new Error('No enrollment data returned');
      }

      const qrCode = data.totp?.qr_code || '';
      const secret = data.totp?.secret || '';
      const factorId = data.id;

      return { qrCode, secret, factorId };
    } catch (error) {
      handleError(error, { component: 'useMFA', action: 'enrollTOTP' });
      const message = error instanceof Error ? error.message : '';
      const code = (error as { code?: string } | null)?.code;
      toast({
        title: "Couldn't start setup",
        description: code === 'mfa_factor_name_conflict' || /already exists|friendly name/i.test(message)
          ? 'You already have an authenticator with that name. Pick a different one.'
          : message || 'Try again in a moment.',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsLoading(false);
      void invalidateFactors();
    }
  }, [toast, clearUnverifiedFactors, invalidateFactors]);

  /**
   * Verify an enrolled factor with a TOTP code
   * Completes the enrollment process
   */
  const verifyEnrollment = useCallback(async (factorId: string, code: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const challengeResponse: AuthMFAChallengeResponse = await supabase.auth.mfa.challenge({
        factorId,
      });

      if (challengeResponse.error) throw challengeResponse.error;

      const verifyResponse: AuthMFAVerifyResponse = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeResponse.data?.id || '',
        code,
      });

      if (verifyResponse.error) throw verifyResponse.error;

      toast({
        title: 'Two-step sign-in is on',
        description: 'You will be asked for a code from this app when you sign in.',
      });

      await invalidateFactors();
      return true;
    } catch (error) {
      logger.error('verifyEnrollment', 'MFA verification error', { error });
      toast({
        title: "That code didn't work",
        description: 'Check the six digits in your app and try again. Codes change every 30 seconds.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast, invalidateFactors]);

  /**
   * Create a challenge for an existing factor
   * Used during login to prompt for MFA code
   */
  const createChallenge = useCallback(async (factorId: string): Promise<string | null> => {
    setIsLoading(true);
    try {
      const { data, error }: AuthMFAChallengeResponse = await supabase.auth.mfa.challenge({
        factorId,
      });

      if (error) throw error;

      return data?.id || null;
    } catch (error) {
      logger.error('createChallenge', 'MFA challenge error', { error });
      toast({
        title: 'Challenge Failed',
        description: error instanceof Error ? error.message : 'Failed to create MFA challenge',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  /**
   * Verify a challenge with a TOTP code
   * Used during login after challenge is created
   */
  const verifyChallenge = useCallback(async (
    factorId: string,
    challengeId: string,
    code: string
  ): Promise<boolean> => {
    setIsLoading(true);
    try {
      const { error }: AuthMFAVerifyResponse = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code,
      });

      if (error) throw error;

      // WAS `data?.user?.aal`, WHICH IS NOT A FIELD ON User AND NEVER HAS BEEN.
      // The AAL is a claim inside the session's access token, not a property of
      // the user object, so this read was `undefined` at runtime and the
      // comparison below was always false: every SUCCESSFUL 2FA verification
      // returned false to the caller. supabase-js 2.85+ is the first version
      // whose types say so. mfa.verify() already returns an error when the code
      // is wrong, and getAuthenticatorAssuranceLevel() is the supported way to
      // read the level the new session actually reached.
      const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalError) {
        // mfa.verify() already resolved without an error, which means the code
        // was accepted and the session was upgraded. A failed AAL read after
        // that is a second request going wrong, not a rejected factor, so it
        // must not be reported to the user as a failed verification.
        logger.warn('verifyChallenge', 'AAL read failed after a successful verify', { error: aalError });
      }
      if (aalError || aalData?.currentLevel === 'aal2') {
        toast({
          title: 'Login Successful',
          description: 'Two-factor authentication verified',
        });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('verifyChallenge', 'MFA verification error', { error });
      toast({
        title: 'Verification Failed',
        description: error instanceof Error ? error.message : 'Invalid verification code',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  /**
   * List the account's verified TOTP factors. Kept for existing callers; the
   * settings page reads useMFAFactors() instead.
   */
  const listFactors = useCallback(async (): Promise<MFAFactor[]> => {
    setIsLoading(true);
    try {
      const { verified } = await fetchFactorSummary();
      setFactors(verified);
      return verified;
    } catch (error) {
      logger.error('listFactors', 'List factors error', { error });
      toast({
        title: "Couldn't load your authenticators",
        description: 'Reload the page to try again.',
        variant: 'destructive',
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  /**
   * Remove an MFA factor. When the factor was verified, the account owner is
   * told by email (mfa_disabled), so a stolen session that strips two-step
   * sign-in does not do it silently. The template existed and was never sent.
   */
  const unenrollFactor = useCallback(async (
    factorId: string,
    options: { wasVerified?: boolean } = {},
  ): Promise<boolean> => {
    const wasVerified = options.wasVerified ?? true;
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({
        factorId,
      });

      if (error) throw error;

      if (wasVerified) {
        void supabase.functions
          .invoke('send-security-notification', {
            body: {
              event_type: 'mfa_disabled',
              context: {
                user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
              },
            },
          })
          .catch((err) => logger.warn('unenrollFactor', 'security alert failed', { error: String(err) }));
      }

      toast({
        title: wasVerified ? 'Authenticator removed' : 'Unfinished setup removed',
        description: wasVerified
          ? 'We emailed you to confirm the change.'
          : 'You can start again whenever you like.',
      });

      await invalidateFactors();
      return true;
    } catch (error) {
      handleError(error, { component: 'useMFA', action: 'unenrollFactor' });
      toast({
        title: "Couldn't remove the authenticator",
        description: error instanceof Error ? error.message : 'Try again in a moment.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast, invalidateFactors]);

  /**
   * Get the current Authenticator Assurance Level (AAL)
   * aal1 = first factor only (password/OAuth)
   * aal2 = second factor verified (MFA)
   */
  const getAssuranceLevel = useCallback(async (): Promise<'aal1' | 'aal2' | null> => {
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (error) throw error;

      // AuthenticatorAssuranceLevels is `'aal1' | 'aal2' | (string & {})`, so
      // it carries values this function does not promise. Narrowed rather than
      // cast: an aal3 from a future Supabase release reads as null here, which
      // is the honest answer for a caller that only understands two levels.
      const level = data?.currentLevel;
      return level === 'aal1' ? 'aal1' : level === 'aal2' ? 'aal2' : null;
    } catch (error) {
      logger.error('getAssuranceLevel', 'Get AAL error', { error });
      return null;
    }
  }, []);

  /**
   * Check if user has verified MFA factors
   */
  const hasMFAEnabled = useCallback(async (): Promise<boolean> => {
    const userFactors = await listFactors();
    return userFactors.length > 0;
  }, [listFactors]);

  return {
    // State
    isLoading,
    factors,

    // Enrollment
    enrollTOTP,
    verifyEnrollment,
    clearUnverifiedFactors,

    // Authentication
    createChallenge,
    verifyChallenge,

    // Management
    listFactors,
    unenrollFactor,

    // Status
    getAssuranceLevel,
    hasMFAEnabled,
  };
}

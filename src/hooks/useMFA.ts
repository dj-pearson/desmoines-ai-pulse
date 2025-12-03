import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { AuthMFAEnrollResponse, AuthMFAVerifyResponse, AuthMFAChallengeResponse } from '@supabase/supabase-js';

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
  const [isLoading, setIsLoading] = useState(false);
  const [factors, setFactors] = useState<MFAFactor[]>([]);

  /**
   * Enroll a new TOTP factor
   * Returns QR code and secret for authenticator app setup
   */
  const enrollTOTP = useCallback(async (friendlyName?: string): Promise<EnrollmentData | null> => {
    setIsLoading(true);
    try {
      const { data, error }: AuthMFAEnrollResponse = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: friendlyName || 'Authenticator App',
      });

      if (error) throw error;

      if (!data) {
        throw new Error('No enrollment data returned');
      }

      // Generate QR code URL for display
      const qrCode = data.totp?.qr_code || '';
      const secret = data.totp?.secret || '';
      const factorId = data.id;

      toast({
        title: 'MFA Enrollment Started',
        description: 'Scan the QR code with your authenticator app',
      });

      return { qrCode, secret, factorId };
    } catch (error) {
      console.error('MFA enrollment error:', error);
      toast({
        title: 'Enrollment Failed',
        description: error instanceof Error ? error.message : 'Failed to enroll MFA',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

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
        title: 'MFA Enabled',
        description: 'Two-factor authentication has been successfully enabled',
      });

      await listFactors(); // Refresh factors list
      return true;
    } catch (error) {
      console.error('MFA verification error:', error);
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
      console.error('MFA challenge error:', error);
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
      const { data, error }: AuthMFAVerifyResponse = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code,
      });

      if (error) throw error;

      // Check if we achieved AAL2 (second factor verified)
      const aal = data?.user?.aal;
      if (aal === 'aal2') {
        toast({
          title: 'Login Successful',
          description: 'Two-factor authentication verified',
        });
        return true;
      }

      return false;
    } catch (error) {
      console.error('MFA verification error:', error);
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
   * List all enrolled factors for the current user
   */
  const listFactors = useCallback(async (): Promise<MFAFactor[]> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();

      if (error) throw error;

      const userFactors = (data?.totp || []).map((factor: any) => ({
        id: factor.id,
        friendly_name: factor.friendly_name || 'Authenticator App',
        factor_type: 'totp' as const,
        status: factor.status,
        created_at: factor.created_at,
        updated_at: factor.updated_at,
      }));

      setFactors(userFactors);
      return userFactors;
    } catch (error) {
      console.error('List factors error:', error);
      toast({
        title: 'Failed to Load MFA Factors',
        description: error instanceof Error ? error.message : 'Could not retrieve MFA factors',
        variant: 'destructive',
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  /**
   * Unenroll (remove) an MFA factor
   */
  const unenrollFactor = useCallback(async (factorId: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({
        factorId,
      });

      if (error) throw error;

      toast({
        title: 'MFA Disabled',
        description: 'Two-factor authentication has been removed',
      });

      await listFactors(); // Refresh factors list
      return true;
    } catch (error) {
      console.error('Unenroll error:', error);
      toast({
        title: 'Unenroll Failed',
        description: error instanceof Error ? error.message : 'Could not remove MFA factor',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast, listFactors]);

  /**
   * Get the current Authenticator Assurance Level (AAL)
   * aal1 = first factor only (password/OAuth)
   * aal2 = second factor verified (MFA)
   */
  const getAssuranceLevel = useCallback(async (): Promise<'aal1' | 'aal2' | null> => {
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (error) throw error;

      return data?.currentLevel || null;
    } catch (error) {
      console.error('Get AAL error:', error);
      return null;
    }
  }, []);

  /**
   * Check if user has verified MFA factors
   */
  const hasMFAEnabled = useCallback(async (): Promise<boolean> => {
    const userFactors = await listFactors();
    return userFactors.some(factor => factor.status === 'verified');
  }, [listFactors]);

  return {
    // State
    isLoading,
    factors,

    // Enrollment
    enrollTOTP,
    verifyEnrollment,

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

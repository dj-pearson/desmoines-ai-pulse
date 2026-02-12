import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from '@/lib/logger';

const log = createLogger('usePasswordPolicy');

interface PasswordPolicy {
  id: string;
  name: string;
  min_length: number;
  max_length: number;
  require_uppercase: boolean;
  require_lowercase: boolean;
  require_numbers: boolean;
  require_special_chars: boolean;
  special_char_set: string;
  min_unique_chars: number;
  max_repeated_chars: number;
  password_history_count: number;
  password_expiry_days: number | null;
  is_default: boolean;
  is_active: boolean;
}

interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
  policy: {
    min_length: number;
    require_uppercase: boolean;
    require_lowercase: boolean;
    require_numbers: boolean;
    require_special_chars: boolean;
  };
}

interface PasswordStrength {
  score: number; // 0-100
  level: 'weak' | 'fair' | 'good' | 'strong' | 'excellent';
  feedback: string[];
}

export function usePasswordPolicy() {
  const queryClient = useQueryClient();

  // Fetch active password policy
  const {
    data: policy,
    isLoading: isPolicyLoading,
    error: policyError,
  } = useQuery<PasswordPolicy | null>({
    queryKey: ['password-policy'],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_active_password_policy');

      if (error) {
        log.error('Error fetching password policy', { action: 'fetchPolicy', metadata: { error } });
        return null;
      }

      return data as PasswordPolicy | null;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Validate password against policy
  const validatePasswordMutation = useMutation({
    mutationFn: async ({ password, userId }: { password: string; userId?: string }) => {
      const { data, error } = await supabase
        .rpc('validate_password_policy', {
          p_password: password,
          p_user_id: userId || null,
        });

      if (error) throw error;
      return data as PasswordValidationResult;
    },
  });

  // Client-side password validation (for real-time feedback)
  const validatePasswordLocally = (password: string): PasswordValidationResult => {
    const errors: string[] = [];
    const defaultPolicy = {
      min_length: policy?.min_length ?? 8,
      max_length: policy?.max_length ?? 128,
      require_uppercase: policy?.require_uppercase ?? true,
      require_lowercase: policy?.require_lowercase ?? true,
      require_numbers: policy?.require_numbers ?? true,
      require_special_chars: policy?.require_special_chars ?? true,
      special_char_set: policy?.special_char_set ?? '!@#$%^&*()_+-=[]{}|;:,.<>?',
    };

    if (!password) {
      errors.push('Password is required');
      return { valid: false, errors, policy: defaultPolicy };
    }

    if (password.length < defaultPolicy.min_length) {
      errors.push(`Password must be at least ${defaultPolicy.min_length} characters`);
    }

    if (password.length > defaultPolicy.max_length) {
      errors.push(`Password must be at most ${defaultPolicy.max_length} characters`);
    }

    if (defaultPolicy.require_uppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (defaultPolicy.require_lowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (defaultPolicy.require_numbers && !/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (defaultPolicy.require_special_chars) {
      const specialChars = defaultPolicy.special_char_set;
      const escapedChars = specialChars.replace(/([[\]\\^$.|?*+()])/g, '\\$1');
      const pattern = new RegExp(`[${escapedChars}]`);
      if (!pattern.test(password)) {
        errors.push('Password must contain at least one special character');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      policy: defaultPolicy,
    };
  };

  // Calculate password strength
  const calculatePasswordStrength = (password: string): PasswordStrength => {
    if (!password) {
      return { score: 0, level: 'weak', feedback: ['Enter a password'] };
    }

    let score = 0;
    const feedback: string[] = [];

    // Length scoring
    if (password.length >= 8) score += 10;
    if (password.length >= 12) score += 15;
    if (password.length >= 16) score += 15;
    if (password.length >= 20) score += 10;

    // Character variety
    if (/[a-z]/.test(password)) score += 10;
    if (/[A-Z]/.test(password)) score += 10;
    if (/[0-9]/.test(password)) score += 10;
    if (/[^a-zA-Z0-9]/.test(password)) score += 15;

    // Bonus for mixed character types
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^a-zA-Z0-9]/.test(password);
    const varietyCount = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;

    if (varietyCount >= 3) score += 10;
    if (varietyCount === 4) score += 5;

    // Penalty for common patterns
    if (/(.)\1{2,}/.test(password)) {
      score -= 10;
      feedback.push('Avoid repeated characters');
    }

    if (/^[a-zA-Z]+$/.test(password)) {
      score -= 5;
      feedback.push('Add numbers or symbols');
    }

    if (/^[0-9]+$/.test(password)) {
      score -= 10;
      feedback.push('Add letters and symbols');
    }

    // Common password patterns
    const commonPatterns = [
      /^password/i,
      /^123456/,
      /^qwerty/i,
      /^abc123/i,
      /^admin/i,
      /^letmein/i,
      /^welcome/i,
    ];

    if (commonPatterns.some(p => p.test(password))) {
      score -= 20;
      feedback.push('Avoid common password patterns');
    }

    // Normalize score
    score = Math.max(0, Math.min(100, score));

    // Determine level
    let level: 'weak' | 'fair' | 'good' | 'strong' | 'excellent';
    if (score < 30) {
      level = 'weak';
      if (feedback.length === 0) feedback.push('Password is too weak');
    } else if (score < 50) {
      level = 'fair';
      if (feedback.length === 0) feedback.push('Consider making it stronger');
    } else if (score < 70) {
      level = 'good';
      if (feedback.length === 0) feedback.push('Good password strength');
    } else if (score < 90) {
      level = 'strong';
      if (feedback.length === 0) feedback.push('Strong password');
    } else {
      level = 'excellent';
      if (feedback.length === 0) feedback.push('Excellent password strength');
    }

    return { score, level, feedback };
  };

  // Get password requirements for display
  const getPasswordRequirements = (): string[] => {
    const requirements: string[] = [];
    const p = policy;

    requirements.push(`At least ${p?.min_length ?? 8} characters`);

    if (p?.require_uppercase ?? true) {
      requirements.push('At least one uppercase letter (A-Z)');
    }

    if (p?.require_lowercase ?? true) {
      requirements.push('At least one lowercase letter (a-z)');
    }

    if (p?.require_numbers ?? true) {
      requirements.push('At least one number (0-9)');
    }

    if (p?.require_special_chars ?? true) {
      requirements.push('At least one special character (!@#$%^&*)');
    }

    return requirements;
  };

  return {
    policy,
    isPolicyLoading,
    policyError,
    validatePassword: validatePasswordMutation.mutateAsync,
    validatePasswordLocally,
    calculatePasswordStrength,
    getPasswordRequirements,
    isValidating: validatePasswordMutation.isPending,
  };
}

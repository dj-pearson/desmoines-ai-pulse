import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface LoginActivity {
  id: string;
  user_id: string | null;
  email: string;
  login_type: 'password' | 'oauth_google' | 'oauth_apple' | 'magic_link' | 'mfa_totp';
  ip_address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  country_code: string | null;
  user_agent: string | null;
  device_type: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  browser: string | null;
  browser_version: string | null;
  os: string | null;
  os_version: string | null;
  mfa_verified: boolean;
  session_id: string | null;
  success: boolean;
  failure_reason: string | null;
  risk_score: number;
  risk_factors: string[];
  created_at: string;
}

interface GeoData {
  city?: string;
  region?: string;
  country?: string;
  country_code?: string;
}

interface LogLoginParams {
  email: string;
  loginType: LoginActivity['login_type'];
  success?: boolean;
  mfaVerified?: boolean;
  sessionId?: string;
  failureReason?: string;
  geoData?: GeoData;
}

interface LoginActivityFilters {
  success?: boolean;
  loginType?: LoginActivity['login_type'];
  startDate?: Date;
  endDate?: Date;
  deviceType?: LoginActivity['device_type'];
}

/**
 * Hook for managing login activity logging and viewing
 *
 * Provides:
 * - Log login activities with device/location info
 * - View user's login history
 * - Filter and search login activities
 * - Risk assessment based on login patterns
 */
export function useLoginActivity() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Fetch user's login activity
  const {
    data: loginHistory,
    isLoading: isLoadingHistory,
    error: historyError,
    refetch: refetchHistory,
  } = useQuery<LoginActivity[]>({
    queryKey: ['login-activity', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .rpc('get_user_login_activity', {
          p_user_id: user.id,
          p_limit: 50,
        });

      if (error) {
        console.error('Error fetching login activity:', error);
        throw error;
      }

      return (data as LoginActivity[]) || [];
    },
    enabled: !!user,
    staleTime: 60000, // Cache for 1 minute
  });

  // Log login activity mutation
  const logActivityMutation = useMutation({
    mutationFn: async (params: LogLoginParams): Promise<LoginActivity> => {
      const { data, error } = await supabase
        .rpc('log_login_activity', {
          p_email: params.email.toLowerCase(),
          p_login_type: params.loginType,
          p_success: params.success ?? true,
          p_ip_address: null, // Server will detect
          p_user_agent: navigator.userAgent,
          p_session_id: params.sessionId || null,
          p_mfa_verified: params.mfaVerified ?? false,
          p_failure_reason: params.failureReason || null,
          p_geo_data: params.geoData ? JSON.stringify(params.geoData) : null,
        });

      if (error) {
        console.error('Error logging activity:', error);
        throw error;
      }

      return data as LoginActivity;
    },
    onSuccess: () => {
      // Invalidate login activity cache
      queryClient.invalidateQueries({ queryKey: ['login-activity'] });
    },
  });

  // Log successful login
  const logSuccessfulLogin = async (
    email: string,
    loginType: LoginActivity['login_type'],
    options: { mfaVerified?: boolean; sessionId?: string } = {}
  ) => {
    return logActivityMutation.mutateAsync({
      email,
      loginType,
      success: true,
      mfaVerified: options.mfaVerified,
      sessionId: options.sessionId,
    });
  };

  // Log failed login
  const logFailedLogin = async (
    email: string,
    loginType: LoginActivity['login_type'],
    failureReason: string
  ) => {
    return logActivityMutation.mutateAsync({
      email,
      loginType,
      success: false,
      failureReason,
    });
  };

  // Filter login history
  const filterLoginHistory = (filters: LoginActivityFilters): LoginActivity[] => {
    if (!loginHistory) return [];

    return loginHistory.filter(activity => {
      if (filters.success !== undefined && activity.success !== filters.success) {
        return false;
      }
      if (filters.loginType && activity.login_type !== filters.loginType) {
        return false;
      }
      if (filters.deviceType && activity.device_type !== filters.deviceType) {
        return false;
      }
      if (filters.startDate) {
        const activityDate = new Date(activity.created_at);
        if (activityDate < filters.startDate) return false;
      }
      if (filters.endDate) {
        const activityDate = new Date(activity.created_at);
        if (activityDate > filters.endDate) return false;
      }
      return true;
    });
  };

  // Get login statistics
  const getLoginStats = () => {
    if (!loginHistory || loginHistory.length === 0) {
      return {
        totalLogins: 0,
        successfulLogins: 0,
        failedLogins: 0,
        uniqueDevices: 0,
        uniqueLocations: 0,
        recentRiskScore: 0,
        mfaUsageRate: 0,
      };
    }

    const successfulLogins = loginHistory.filter(a => a.success).length;
    const failedLogins = loginHistory.filter(a => !a.success).length;
    const mfaLogins = loginHistory.filter(a => a.mfa_verified).length;

    const uniqueDevices = new Set(
      loginHistory.map(a => `${a.device_type}-${a.browser}-${a.os}`)
    ).size;

    const uniqueLocations = new Set(
      loginHistory
        .filter(a => a.city || a.country)
        .map(a => `${a.city || ''}-${a.country || ''}`)
    ).size;

    const recentActivities = loginHistory.slice(0, 10);
    const avgRiskScore = recentActivities.length > 0
      ? recentActivities.reduce((sum, a) => sum + a.risk_score, 0) / recentActivities.length
      : 0;

    return {
      totalLogins: loginHistory.length,
      successfulLogins,
      failedLogins,
      successRate: successfulLogins / loginHistory.length * 100,
      uniqueDevices,
      uniqueLocations,
      recentRiskScore: Math.round(avgRiskScore),
      mfaUsageRate: successfulLogins > 0 ? (mfaLogins / successfulLogins) * 100 : 0,
    };
  };

  // Check for suspicious activity
  const checkSuspiciousActivity = (): { suspicious: boolean; reasons: string[] } => {
    if (!loginHistory || loginHistory.length === 0) {
      return { suspicious: false, reasons: [] };
    }

    const reasons: string[] = [];
    const recentActivities = loginHistory.slice(0, 20);

    // Check for multiple failed attempts
    const recentFailures = recentActivities.filter(a => !a.success);
    if (recentFailures.length >= 5) {
      reasons.push('Multiple failed login attempts detected');
    }

    // Check for high risk scores
    const highRiskActivities = recentActivities.filter(a => a.risk_score >= 50);
    if (highRiskActivities.length >= 2) {
      reasons.push('Multiple high-risk login attempts detected');
    }

    // Check for new locations
    const newLocationActivities = recentActivities.filter(
      a => a.risk_factors?.includes('new_ip')
    );
    if (newLocationActivities.length >= 3) {
      reasons.push('Login attempts from multiple new locations');
    }

    // Check for new devices
    const newDeviceActivities = recentActivities.filter(
      a => a.risk_factors?.includes('new_device')
    );
    if (newDeviceActivities.length >= 3) {
      reasons.push('Login attempts from multiple new devices');
    }

    return {
      suspicious: reasons.length > 0,
      reasons,
    };
  };

  // Format activity for display
  const formatActivity = (activity: LoginActivity): {
    title: string;
    description: string;
    time: string;
    status: 'success' | 'failure';
    riskLevel: 'low' | 'medium' | 'high';
  } => {
    const loginTypeLabels: Record<LoginActivity['login_type'], string> = {
      password: 'Password',
      oauth_google: 'Google',
      oauth_apple: 'Apple',
      magic_link: 'Magic Link',
      mfa_totp: 'MFA Verification',
    };

    const date = new Date(activity.created_at);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    let time: string;
    if (diffMins < 1) {
      time = 'Just now';
    } else if (diffMins < 60) {
      time = `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      time = `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
      time = `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    } else {
      time = date.toLocaleDateString();
    }

    const location = [activity.city, activity.country]
      .filter(Boolean)
      .join(', ') || 'Unknown location';

    const device = [activity.browser, activity.os]
      .filter(Boolean)
      .join(' on ') || 'Unknown device';

    let riskLevel: 'low' | 'medium' | 'high';
    if (activity.risk_score >= 60) {
      riskLevel = 'high';
    } else if (activity.risk_score >= 30) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }

    return {
      title: `${loginTypeLabels[activity.login_type]} login`,
      description: activity.success
        ? `${device} from ${location}`
        : `Failed: ${activity.failure_reason || 'Unknown error'}`,
      time,
      status: activity.success ? 'success' : 'failure',
      riskLevel,
    };
  };

  return {
    // Data
    loginHistory: loginHistory || [],
    isLoadingHistory,
    historyError,
    refetchHistory,

    // Logging
    logActivity: logActivityMutation.mutateAsync,
    logSuccessfulLogin,
    logFailedLogin,
    isLogging: logActivityMutation.isPending,

    // Filtering & Stats
    filterLoginHistory,
    getLoginStats,
    checkSuspiciousActivity,

    // Formatting
    formatActivity,
  };
}

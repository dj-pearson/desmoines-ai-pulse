import { useState } from 'react';
import { useAuth } from './useAuth';

interface SecurityEvent {
  id: string;
  event_type: 'rate_limit' | 'auth_failure' | 'validation_error' | 'suspicious_activity' | 'admin_action';
  identifier: string;
  endpoint?: string;
  details: any;
  severity: 'low' | 'medium' | 'high';
  timestamp: string;
  user_id?: string;
  action?: string;
  resource?: string;
  ip_address?: string;
  user_agent?: string;
}

interface AuditFilters {
  eventType?: string;
  severity?: string;
  startDate?: string;
  endDate?: string;
  userId?: string;
  limit?: number;
}

export function useSecurityAudit() {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated, isAdmin } = useAuth();

  /**
   * Log security event (simplified approach)
   */
  const logSecurityEvent = async (event: Omit<SecurityEvent, 'id' | 'timestamp'>) => {
    try {
      if (!isAuthenticated) return;

      // For now, just log to console until the database types are properly updated
      console.log('Security Event:', {
        ...event,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Error logging security event:', err);
    }
  };

  /**
   * Log admin action for audit trail
   */
  const logAdminAction = async (action: string, resource: string, details: any = {}) => {
    try {
      if (!isAuthenticated || !isAdmin) return;

      await logSecurityEvent({
        event_type: 'admin_action',
        identifier: 'admin-user',
        details: {
          action,
          resource,
          ...details,
          timestamp: new Date().toISOString(),
        },
        severity: 'medium',
        action,
        resource,
      });
    } catch (err) {
      console.error('Error logging admin action:', err);
    }
  };

  /**
   * Fetch security events (mock data for now)
   */
  const fetchSecurityEvents = async (filters: AuditFilters = {}) => {
    try {
      if (!isAdmin) {
        setError('Unauthorized to view security events');
        return;
      }

      setLoading(true);
      setError(null);

      // Mock data for demonstration
      const mockEvents: SecurityEvent[] = [
        {
          id: '1',
          event_type: 'rate_limit',
          identifier: '192.168.1.1',
          endpoint: '/api/auth',
          details: { attempts: 5, windowMs: 900000 },
          severity: 'high',
          timestamp: new Date().toISOString(),
        },
        {
          id: '2',
          event_type: 'auth_failure',
          identifier: 'user@example.com',
          endpoint: '/auth/login',
          details: { reason: 'invalid_credentials' },
          severity: 'medium',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
        },
      ];

      setEvents(mockEvents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch security events');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Get security statistics (mock data for now)
   */
  const getSecurityStats = async (timeRange: '24h' | '7d' | '30d' = '24h') => {
    try {
      if (!isAdmin) return null;

      // Mock statistics
      return {
        total: 15,
        rateLimit: 5,
        authFailures: 3,
        validationErrors: 2,
        suspiciousActivity: 1,
        byType: {
          rate_limit: 5,
          auth_failure: 3,
          validation_error: 2,
          suspicious_activity: 1,
          admin_action: 4,
        },
        bySeverity: {
          high: 6,
          medium: 7,
          low: 2,
        },
      };
    } catch (err) {
      console.error('Error fetching security stats:', err);
      return null;
    }
  };

  return {
    events,
    loading,
    error,
    logSecurityEvent,
    logAdminAction,
    fetchSecurityEvents,
    getSecurityStats,
  };
}
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
   * Log security event
   */
  const logSecurityEvent = async (event: Omit<SecurityEvent, 'id' | 'timestamp'>) => {
    try {
      if (!isAuthenticated) return;

      const { error } = await supabase.from('security_audit_logs').insert({
        ...event,
        timestamp: new Date().toISOString(),
      });

      if (error) {
        console.error('Failed to log security event:', error);
      }
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

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await logSecurityEvent({
        event_type: 'admin_action',
        identifier: user.id,
        details: {
          action,
          resource,
          ...details,
          timestamp: new Date().toISOString(),
        },
        severity: 'medium',
        user_id: user.id,
        action,
        resource,
      });
    } catch (err) {
      console.error('Error logging admin action:', err);
    }
  };

  /**
   * Fetch security events with filters
   */
  const fetchSecurityEvents = async (filters: AuditFilters = {}) => {
    try {
      if (!isAdmin) {
        setError('Unauthorized to view security events');
        return;
      }

      setLoading(true);
      setError(null);

      let query = supabase
        .from('security_audit_logs')
        .select('*')
        .order('timestamp', { ascending: false });

      if (filters.eventType) {
        query = query.eq('event_type', filters.eventType);
      }

      if (filters.severity) {
        query = query.eq('severity', filters.severity);
      }

      if (filters.startDate) {
        query = query.gte('timestamp', filters.startDate);
      }

      if (filters.endDate) {
        query = query.lte('timestamp', filters.endDate);
      }

      if (filters.userId) {
        query = query.eq('user_id', filters.userId);
      }

      query = query.limit(filters.limit || 100);

      const { data, error: fetchError } = await query;

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      setEvents(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch security events');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Get security statistics
   */
  const getSecurityStats = async (timeRange: '24h' | '7d' | '30d' = '24h') => {
    try {
      if (!isAdmin) return null;

      const hours = timeRange === '24h' ? 24 : timeRange === '7d' ? 168 : 720;
      const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('security_audit_logs')
        .select('event_type, severity')
        .gte('timestamp', startTime);

      if (error) {
        console.error('Failed to fetch security stats:', error);
        return null;
      }

      const stats = {
        total: data.length,
        byType: {} as Record<string, number>,
        bySeverity: {} as Record<string, number>,
        rateLimit: 0,
        authFailures: 0,
        validationErrors: 0,
        suspiciousActivity: 0,
      };

      data.forEach(event => {
        stats.byType[event.event_type] = (stats.byType[event.event_type] || 0) + 1;
        stats.bySeverity[event.severity] = (stats.bySeverity[event.severity] || 0) + 1;

        switch (event.event_type) {
          case 'rate_limit':
            stats.rateLimit++;
            break;
          case 'auth_failure':
            stats.authFailures++;
            break;
          case 'validation_error':
            stats.validationErrors++;
            break;
          case 'suspicious_activity':
            stats.suspiciousActivity++;
            break;
        }
      });

      return stats;
    } catch (err) {
      console.error('Error fetching security stats:', err);
      return null;
    }
  };

  /**
   * Monitor real-time security events
   */
  useEffect(() => {
    if (!isAdmin) return;

    const subscription = supabase
      .channel('security_events')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'security_audit_logs',
        },
        (payload) => {
          setEvents(prev => [payload.new as SecurityEvent, ...prev.slice(0, 99)]);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [isAdmin]);

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
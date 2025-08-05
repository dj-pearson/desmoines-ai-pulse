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
   * Log security event using RPC call
   */
  const logSecurityEvent = async (event: Omit<SecurityEvent, 'id' | 'timestamp'>) => {
    try {
      if (!isAuthenticated) return;

      // Use a more generic approach to insert data
      const { error } = await supabase.rpc('log_security_event', {
        p_event_type: event.event_type,
        p_identifier: event.identifier,
        p_endpoint: event.endpoint || null,
        p_details: event.details || {},
        p_severity: event.severity,
        p_user_id: event.user_id || null,
        p_action: event.action || null,
        p_resource: event.resource || null,
        p_ip_address: event.ip_address || null,
        p_user_agent: event.user_agent || null,
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
   * Fetch security events using RPC call
   */
  const fetchSecurityEvents = async (filters: AuditFilters = {}) => {
    try {
      if (!isAdmin) {
        setError('Unauthorized to view security events');
        return;
      }

      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase.rpc('get_security_events', {
        p_event_type: filters.eventType || null,
        p_severity: filters.severity || null,
        p_start_date: filters.startDate || null,
        p_end_date: filters.endDate || null,
        p_user_id: filters.userId || null,
        p_limit: filters.limit || 100,
      });

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
   * Get security statistics using RPC call
   */
  const getSecurityStats = async (timeRange: '24h' | '7d' | '30d' = '24h') => {
    try {
      if (!isAdmin) return null;

      const { data, error } = await supabase.rpc('get_security_stats', {
        p_time_range: timeRange,
      });

      if (error) {
        console.error('Failed to fetch security stats:', error);
        return null;
      }

      return data;
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
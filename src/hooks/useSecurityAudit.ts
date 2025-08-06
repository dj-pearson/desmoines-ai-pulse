import { useState } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

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
   * Log security event to database
   */
  const logSecurityEvent = async (event: Omit<SecurityEvent, 'id' | 'timestamp'>) => {
    try {
      if (!isAuthenticated) return;

      const { error } = await supabase
        .from('security_audit_logs')
        .insert({
          event_type: event.event_type,
          identifier: event.identifier,
          endpoint: event.endpoint,
          details: event.details,
          severity: event.severity,
          user_id: event.user_id,
          action: event.action,
          resource: event.resource,
          ip_address: event.ip_address,
          user_agent: event.user_agent,
        });

      if (error) {
        console.error('Error logging security event:', error);
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
   * Fetch security events from database
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
        .order('timestamp', { ascending: false })
        .limit(filters.limit || 50);

      // Apply filters
      if (filters.eventType) {
        query = query.eq('event_type', filters.eventType);
      }
      if (filters.severity) {
        query = query.eq('severity', filters.severity);
      }
      if (filters.userId) {
        query = query.eq('user_id', filters.userId);
      }
      if (filters.startDate) {
        query = query.gte('timestamp', filters.startDate);
      }
      if (filters.endDate) {
        query = query.lte('timestamp', filters.endDate);
      }

      const { data, error } = await query;

      if (error) {
        setError(error.message);
        return;
      }

      // Transform database records to SecurityEvent format
      const events: SecurityEvent[] = (data || []).map(record => ({
        id: record.id,
        event_type: record.event_type as SecurityEvent['event_type'],
        identifier: record.identifier,
        endpoint: record.endpoint || undefined,
        details: record.details,
        severity: record.severity as SecurityEvent['severity'],
        timestamp: record.timestamp,
        user_id: record.user_id || undefined,
        action: record.action || undefined,
        resource: record.resource || undefined,
        ip_address: record.ip_address || undefined,
        user_agent: record.user_agent || undefined,
      }));

      setEvents(events);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch security events');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Get security statistics from database
   */
  const getSecurityStats = async (timeRange: '24h' | '7d' | '30d' = '24h') => {
    try {
      if (!isAdmin) return null;

      // Calculate date range
      const now = new Date();
      const hours = timeRange === '24h' ? 24 : timeRange === '7d' ? 168 : 720;
      const startDate = new Date(now.getTime() - hours * 60 * 60 * 1000);

      // Get total count and group by event type
      const { data: typeData, error: typeError } = await supabase
        .from('security_audit_logs')
        .select('event_type')
        .gte('timestamp', startDate.toISOString());

      if (typeError) {
        console.error('Error fetching type stats:', typeError);
        return null;
      }

      // Get severity distribution
      const { data: severityData, error: severityError } = await supabase
        .from('security_audit_logs')
        .select('severity')
        .gte('timestamp', startDate.toISOString());

      if (severityError) {
        console.error('Error fetching severity stats:', severityError);
        return null;
      }

      // Process the data
      const byType = (typeData || []).reduce((acc: any, item) => {
        acc[item.event_type] = (acc[item.event_type] || 0) + 1;
        return acc;
      }, {});

      const bySeverity = (severityData || []).reduce((acc: any, item) => {
        acc[item.severity] = (acc[item.severity] || 0) + 1;
        return acc;
      }, {});

      return {
        total: (typeData || []).length,
        rateLimit: byType.rate_limit || 0,
        authFailures: byType.auth_failure || 0,
        validationErrors: byType.validation_error || 0,
        suspiciousActivity: byType.suspicious_activity || 0,
        byType: {
          rate_limit: byType.rate_limit || 0,
          auth_failure: byType.auth_failure || 0,
          validation_error: byType.validation_error || 0,
          suspicious_activity: byType.suspicious_activity || 0,
          admin_action: byType.admin_action || 0,
        },
        bySeverity: {
          high: bySeverity.high || 0,
          medium: bySeverity.medium || 0,
          low: bySeverity.low || 0,
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
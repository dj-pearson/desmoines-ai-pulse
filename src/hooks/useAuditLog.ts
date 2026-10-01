import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { recordAdminAudit } from '@/lib/adminAudit';
import { createLogger } from '@/lib/logger';

const log = createLogger('useAuditLog');

interface AuditLogEntry {
  id: string;
  event_type: string;
  action: string | null;
  resource: string | null;
  identifier: string;
  severity: string;
  details: Record<string, unknown> | null;
  user_id: string | null;
  ip_address: string | null;
  created_at: string;
}

/**
 * Hook for logging admin actions to the security_audit_logs table.
 *
 * Provides a `logAdminAction` function for recording destructive operations
 * (delete, role change, etc.) and a query for displaying recent audit entries.
 */
export function useAuditLog() {
  // Through record_admin_audit, which takes the actor from the session. The
  // direct insert this replaces sent severity 'info', which the table's CHECK
  // refuses, so none of its rows were ever stored.
  const logAdminAction = useCallback(
    async (
      action: string,
      entityType: string,
      entityId: string,
      details?: Record<string, unknown>
    ) => {
      await recordAdminAudit({
        action,
        resource: `${entityType}:${entityId}`,
        details: { ...(details ?? {}), entity_id: entityId },
      });
    },
    []
  );

  return { logAdminAction };
}

/**
 * Hook for fetching recent admin audit log entries.
 * Used in the Admin dashboard Audit Log tab.
 */
export function useAuditLogEntries(limit = 50) {
  return useQuery<AuditLogEntry[]>({
    queryKey: ['audit-log-entries', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('security_audit_logs')
        .select('*')
        .eq('event_type', 'admin_action')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        log.warn('useAuditLogEntries', 'Failed to fetch audit logs', { error: error.message });
        return [];
      }

      return (data || []) as AuditLogEntry[];
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

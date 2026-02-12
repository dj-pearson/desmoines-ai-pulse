import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { createLogger } from '@/lib/logger';

const log = createLogger('useAdminSecurity');

interface AdminAction {
  actionType: 'user_management' | 'content_management' | 'system_configuration';
  actionDescription: string;
  targetResource?: string;
  targetId?: string;
  oldValues?: any;
  newValues?: any;
}

interface AdminSecurityHookReturn {
  logAdminAction: (action: AdminAction) => Promise<void>;
  validateAdminAction: (action: AdminAction) => Promise<{ allowed: boolean; reason?: string }>;
  isSecureContext: boolean;
}

export function useAdminSecurity(): AdminSecurityHookReturn {
  const { user, isAdmin } = useAuth();
  const [isSecureContext] = useState(() => {
    // Check if we're in a secure context (HTTPS or localhost)
    return window.location.protocol === 'https:' || 
           window.location.hostname === 'localhost' ||
           window.location.hostname === '127.0.0.1';
  });

  const logAdminAction = async (action: AdminAction): Promise<void> => {
    if (!user || !isAdmin) {
      log.warn('Attempted to log admin action without proper permissions', { action: 'logAdminAction' });
      return;
    }

    try {
      const { error } = await supabase.rpc('log_admin_action', {
        p_admin_user_id: user.id,
        p_action_type: action.actionType,
        p_action_description: action.actionDescription,
        p_target_resource: action.targetResource || null,
        p_target_id: action.targetId || null,
        p_old_values: action.oldValues ? JSON.stringify(action.oldValues) : null,
        p_new_values: action.newValues ? JSON.stringify(action.newValues) : null
      });

      if (error) {
        log.error('Failed to log admin action', { action: 'logAdminAction', metadata: { error } });
      }
    } catch (error) {
      log.error('Error logging admin action', { action: 'logAdminAction', metadata: { error } });
    }
  };

  const validateAdminAction = async (action: AdminAction): Promise<{ allowed: boolean; reason?: string }> => {
    // Basic permission check
    if (!user || !isAdmin) {
      return { 
        allowed: false, 
        reason: 'Admin permissions required' 
      };
    }

    // Check if we're in a secure context for sensitive operations
    if (!isSecureContext && action.actionType === 'system_configuration') {
      return { 
        allowed: false, 
        reason: 'Secure connection required for system configuration' 
      };
    }

    // Rate limiting for high-impact actions
    if (['user_management', 'system_configuration'].includes(action.actionType)) {
      try {
        // Check recent admin actions (basic client-side rate limiting)
        const { data: recentActions, error } = await supabase
          .from('admin_action_logs')
          .select('id')
          .eq('admin_user_id', user.id)
          .eq('action_type', action.actionType)
          .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()) // Last 5 minutes
          .limit(10);

        if (error) {
          log.error('Failed to check recent admin actions', { action: 'validateAdminAction', metadata: { error } });
          // Allow action if we can't check (fail open)
          return { allowed: true };
        }

        // Allow max 10 high-impact actions per 5 minutes
        if (recentActions && recentActions.length >= 10) {
          return { 
            allowed: false, 
            reason: 'Rate limit exceeded. Please wait before performing more administrative actions.' 
          };
        }
      } catch (error) {
        log.error('Error validating admin action', { action: 'validateAdminAction', metadata: { error } });
        // Allow action if validation fails (fail open)
        return { allowed: true };
      }
    }

    return { allowed: true };
  };

  return {
    logAdminAction,
    validateAdminAction,
    isSecureContext,
  };
}
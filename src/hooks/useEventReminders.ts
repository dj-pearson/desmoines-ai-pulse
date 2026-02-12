import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { createLogger } from '@/lib/logger';

const log = createLogger('useEventReminders');

export type ReminderType = '1_day' | '3_hours' | '1_hour';

interface UserReminders {
  authenticated: boolean;
  reminders?: {
    '1_day'?: boolean;
    '3_hours'?: boolean;
    '1_hour'?: boolean;
  };
}

export function useEventReminders(eventId: string) {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch user's reminder preferences for this event
  const { data: remindersData, isLoading } = useQuery({
    queryKey: ['event-reminders', eventId, user?.id],
    queryFn: async () => {
      if (!isAuthenticated) {
        return { authenticated: false };
      }

      const { data, error } = await supabase
        .rpc('get_user_reminders_for_event', {
          p_event_id: eventId
        });

      if (error) {
        log.error('Error fetching reminders', { action: 'fetchReminders', metadata: { error } });
        throw error;
      }

      return data as UserReminders;
    },
    enabled: !!eventId,
  });

  // Mutation to toggle reminders
  const toggleReminderMutation = useMutation({
    mutationFn: async ({ reminderType, enabled }: { reminderType: ReminderType; enabled: boolean }) => {
      if (!isAuthenticated) {
        throw new Error('Must be logged in to set reminders');
      }

      const { data, error } = await supabase
        .rpc('toggle_event_reminder', {
          p_event_id: eventId,
          p_reminder_type: reminderType,
          p_enabled: enabled
        });

      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['event-reminders', eventId] });

      // Show success toast
      const action = variables.enabled ? 'enabled' : 'disabled';
      const timeLabel = getReminderLabel(variables.reminderType);

      toast({
        title: `Reminder ${action}`,
        description: `You'll ${variables.enabled ? 'receive' : 'no longer receive'} a reminder ${timeLabel} before this event.`,
      });
    },
    onError: (error: any) => {
      log.error('Error toggling reminder', { action: 'toggleReminder', metadata: { error } });
      toast({
        title: 'Failed to update reminder',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    },
  });

  const isReminderEnabled = (reminderType: ReminderType): boolean => {
    if (!remindersData?.authenticated || !remindersData?.reminders) {
      return false;
    }
    return remindersData.reminders[reminderType] === true;
  };

  const toggleReminder = (reminderType: ReminderType) => {
    if (!isAuthenticated) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to set event reminders',
        variant: 'destructive',
      });
      return;
    }

    const currentlyEnabled = isReminderEnabled(reminderType);
    toggleReminderMutation.mutate({
      reminderType,
      enabled: !currentlyEnabled,
    });
  };

  return {
    isAuthenticated: remindersData?.authenticated ?? false,
    isLoading,
    isReminderEnabled,
    toggleReminder,
    isTogglingReminder: toggleReminderMutation.isPending,
  };
}

function getReminderLabel(reminderType: ReminderType): string {
  switch (reminderType) {
    case '1_day':
      return '1 day';
    case '3_hours':
      return '3 hours';
    case '1_hour':
      return '1 hour';
    default:
      return '';
  }
}

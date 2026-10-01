import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { createLogger } from '@/lib/logger';

const log = createLogger('useEmailPreferences');

/**
 * The weekly-digest half of user_email_preferences.
 *
 * event_alerts_enabled lives in the same table and is deliberately absent here:
 * it is owned by useSavedSearchAlerts + the dashboard's Saved searches tab, and
 * a second writer for one column would give the user two switches for one
 * setting that disagree with each other (WEB-LEGAL-012 AC2).
 */
interface EmailPreferences {
  id?: string;
  user_id?: string;
  weekly_digest_enabled: boolean;
  categories_filter: string[] | null;
  max_distance_miles: number | null;
}

/** The columns this hook reads. digest_day_of_week and digest_time_hour are
 *  never read by the sender (the cron is fixed), so they are not shown. */
const PREFERENCE_COLUMNS = 'id, user_id, weekly_digest_enabled, categories_filter, max_distance_miles';

export function useEmailPreferences() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch user's email preferences
  const {
    data: preferences,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['email-preferences', user?.id],
    queryFn: async (): Promise<EmailPreferences> => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('user_email_preferences')
        .select(PREFERENCE_COLUMNS)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      // NO ROW MEANS NO DIGEST (account plan WP5 item 4). This returned
      // `weekly_digest_enabled: true` for a missing row, so the switch showed
      // "on" for everyone who had never touched it - while the sender,
      // get_weekly_digest_recipients, selects only users WITH a row whose flag
      // is true. The page promised an email the sender would never send.
      if (!data) {
        return { weekly_digest_enabled: false, categories_filter: null, max_distance_miles: null };
      }

      return data as EmailPreferences;
    },
    enabled: isAuthenticated && !!user?.id,
  });

  // When the last digest actually went out. weekly_digest_log has an own-row
  // SELECT policy ("Users can view their own digest log"), so the page can say
  // "Last sent Sep 21" or "Not sent yet" instead of describing a schedule.
  const lastSentQuery = useQuery({
    queryKey: ['weekly-digest-last-sent', user?.id],
    queryFn: async (): Promise<string | null> => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('weekly_digest_log')
        .select('sent_at')
        .eq('user_id', user.id)
        .eq('email_status', 'sent')
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.sent_at ?? null;
    },
    enabled: isAuthenticated && !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Mutation to update email preferences
  const updatePreferencesMutation = useMutation({
    mutationFn: async (newPreferences: Partial<EmailPreferences>) => {
      if (!user?.id) throw new Error('User not authenticated');

      // Check if preferences exist. maybeSingle, and the error is checked:
      // .single() raises PGRST116 for "no row", so the previous read could not
      // tell "this user has no preferences yet" from a network or RLS failure -
      // and both took the INSERT branch, where a real existing row then failed
      // the unique constraint and reported "Failed to update preferences" to a
      // user whose row was there all along (WEB-BE-032).
      const { data: existing, error: existingError } = await supabase
        .from('user_email_preferences')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing) {
        // Update existing
        const { data, error } = await supabase
          .from('user_email_preferences')
          .update(newPreferences)
          .eq('user_id', user.id)
          .select(PREFERENCE_COLUMNS)
          .single();

        if (error) throw error;
        return data;
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('user_email_preferences')
          .insert({
            user_id: user.id,
            ...newPreferences,
          })
          .select(PREFERENCE_COLUMNS)
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-preferences', user?.id] });
      toast({ title: 'Saved' });
    },
    onError: (error: Error) => {
      // console.* is stripped from production builds, so this was invisible in
      // exactly the environment where it mattered.
      log.error('updatePreferences', 'Error updating email preferences', { error });
      toast({
        title: 'Failed to update preferences',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    },
  });

  const updatePreferences = (newPreferences: Partial<EmailPreferences>) => {
    updatePreferencesMutation.mutate(newPreferences);
  };

  return {
    preferences,
    isLoading,
    isError,
    error,
    refetch,
    lastSentAt: lastSentQuery.data ?? null,
    lastSentError: lastSentQuery.isError,
    updatePreferences,
    isUpdating: updatePreferencesMutation.isPending,
  };
}

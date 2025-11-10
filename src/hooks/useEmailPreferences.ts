import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface EmailPreferences {
  id?: string;
  user_id?: string;
  weekly_digest_enabled: boolean;
  digest_day_of_week: number;
  digest_time_hour: number;
  categories_filter: string[] | null;
  max_distance_miles: number;
  created_at?: string;
  updated_at?: string;
}

export function useEmailPreferences() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch user's email preferences
  const { data: preferences, isLoading } = useQuery({
    queryKey: ['email-preferences', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('user_email_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) {
        // If no preferences exist yet, return defaults
        if (error.code === 'PGRST116') {
          return {
            weekly_digest_enabled: true,
            digest_day_of_week: 0, // Sunday
            digest_time_hour: 8, // 8 AM
            categories_filter: null,
            max_distance_miles: 30,
          } as EmailPreferences;
        }
        throw error;
      }

      return data as EmailPreferences;
    },
    enabled: isAuthenticated && !!user?.id,
  });

  // Mutation to update email preferences
  const updatePreferencesMutation = useMutation({
    mutationFn: async (newPreferences: Partial<EmailPreferences>) => {
      if (!user?.id) throw new Error('User not authenticated');

      // Check if preferences exist
      const { data: existing } = await supabase
        .from('user_email_preferences')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (existing) {
        // Update existing
        const { data, error } = await supabase
          .from('user_email_preferences')
          .update(newPreferences)
          .eq('user_id', user.id)
          .select()
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
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-preferences', user?.id] });
      toast({
        title: 'Preferences saved',
        description: 'Your email preferences have been updated',
      });
    },
    onError: (error: any) => {
      console.error('Error updating email preferences:', error);
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
    updatePreferences,
    isUpdating: updatePreferencesMutation.isPending,
  };
}

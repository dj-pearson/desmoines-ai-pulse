import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  CrmActivity,
  CrmActivityInput,
  CrmActivityFilters,
  CrmActivityFeed,
} from '@/types/crm';

const CRM_ACTIVITIES_KEY = 'crm-activities';

export function useCrmActivities(filters?: CrmActivityFilters) {
  return useQuery({
    queryKey: [CRM_ACTIVITIES_KEY, filters],
    queryFn: async () => {
      let query = supabase
        .from('crm_activities')
        .select(`
          *,
          contact:crm_contacts(id, email, first_name, last_name)
        `);

      if (filters?.contact_id) {
        query = query.eq('contact_id', filters.contact_id);
      }

      if (filters?.deal_id) {
        query = query.eq('deal_id', filters.deal_id);
      }

      if (filters?.activity_type) {
        const types = Array.isArray(filters.activity_type) ? filters.activity_type : [filters.activity_type];
        query = query.in('activity_type', types);
      }

      if (filters?.performed_by) {
        query = query.eq('performed_by', filters.performed_by);
      }

      if (filters?.is_system_generated !== undefined) {
        query = query.eq('is_system_generated', filters.is_system_generated);
      }

      if (filters?.after) {
        query = query.gte('performed_at', filters.after);
      }

      if (filters?.before) {
        query = query.lte('performed_at', filters.before);
      }

      query = query.order('performed_at', { ascending: false });

      // Pagination
      const page = filters?.page || 1;
      const perPage = filters?.per_page || 50;
      const from = (page - 1) * perPage;
      const to = from + perPage - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        activities: data as (CrmActivity & { contact: { id: string; email: string; first_name: string; last_name: string } })[],
        total: count || 0,
        page,
        perPage,
      };
    },
  });
}

export function useCrmContactActivities(contactId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: [CRM_ACTIVITIES_KEY, 'contact', contactId, limit],
    queryFn: async () => {
      if (!contactId) return [];

      const { data, error } = await supabase
        .from('crm_activities')
        .select('*')
        .eq('contact_id', contactId)
        .order('performed_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as CrmActivity[];
    },
    enabled: !!contactId,
  });
}

export function useCrmDealActivities(dealId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: [CRM_ACTIVITIES_KEY, 'deal', dealId, limit],
    queryFn: async () => {
      if (!dealId) return [];

      const { data, error } = await supabase
        .from('crm_activities')
        .select('*')
        .eq('deal_id', dealId)
        .order('performed_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as CrmActivity[];
    },
    enabled: !!dealId,
  });
}

export function useCrmRecentActivities(limit = 20) {
  return useQuery({
    queryKey: [CRM_ACTIVITIES_KEY, 'recent', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_activities')
        .select(`
          *,
          contact:crm_contacts(id, email, first_name, last_name, company)
        `)
        .order('performed_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as CrmActivityFeed[];
    },
  });
}

export function useCrmActivityMutations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createActivity = useMutation({
    mutationFn: async (input: CrmActivityInput) => {
      const { data, error } = await supabase
        .from('crm_activities')
        .insert({
          ...input,
          is_system_generated: false,
        })
        .select()
        .single();

      if (error) throw error;
      return data as CrmActivity;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [CRM_ACTIVITIES_KEY] });
      queryClient.invalidateQueries({ queryKey: [CRM_ACTIVITIES_KEY, 'contact', variables.contact_id] });
      if (variables.deal_id) {
        queryClient.invalidateQueries({ queryKey: [CRM_ACTIVITIES_KEY, 'deal', variables.deal_id] });
      }
      toast({
        title: 'Activity logged',
        description: 'The activity has been logged successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error logging activity',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteActivity = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('crm_activities')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CRM_ACTIVITIES_KEY] });
      toast({
        title: 'Activity deleted',
        description: 'The activity has been deleted successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error deleting activity',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    createActivity,
    deleteActivity,
  };
}

// Get activity type icon and color
export function getActivityTypeConfig(type: string) {
  const configs: Record<string, { icon: string; color: string; label: string }> = {
    note: { icon: 'sticky-note', color: 'bg-yellow-100 text-yellow-800', label: 'Note' },
    call: { icon: 'phone', color: 'bg-green-100 text-green-800', label: 'Call' },
    email: { icon: 'mail', color: 'bg-blue-100 text-blue-800', label: 'Email' },
    meeting: { icon: 'users', color: 'bg-purple-100 text-purple-800', label: 'Meeting' },
    task: { icon: 'check-square', color: 'bg-orange-100 text-orange-800', label: 'Task' },
    deal_created: { icon: 'plus-circle', color: 'bg-indigo-100 text-indigo-800', label: 'Deal Created' },
    deal_updated: { icon: 'edit', color: 'bg-indigo-100 text-indigo-800', label: 'Deal Updated' },
    deal_won: { icon: 'trophy', color: 'bg-green-100 text-green-800', label: 'Deal Won' },
    deal_lost: { icon: 'x-circle', color: 'bg-red-100 text-red-800', label: 'Deal Lost' },
    status_change: { icon: 'refresh-cw', color: 'bg-gray-100 text-gray-800', label: 'Status Change' },
    segment_added: { icon: 'user-plus', color: 'bg-teal-100 text-teal-800', label: 'Segment Added' },
    segment_removed: { icon: 'user-minus', color: 'bg-teal-100 text-teal-800', label: 'Segment Removed' },
    score_updated: { icon: 'trending-up', color: 'bg-amber-100 text-amber-800', label: 'Score Updated' },
    profile_updated: { icon: 'user', color: 'bg-gray-100 text-gray-800', label: 'Profile Updated' },
    subscription_change: { icon: 'credit-card', color: 'bg-pink-100 text-pink-800', label: 'Subscription' },
    login: { icon: 'log-in', color: 'bg-gray-100 text-gray-800', label: 'Login' },
    page_view: { icon: 'eye', color: 'bg-gray-100 text-gray-800', label: 'Page View' },
    event_interaction: { icon: 'calendar', color: 'bg-blue-100 text-blue-800', label: 'Event' },
    restaurant_interaction: { icon: 'utensils', color: 'bg-orange-100 text-orange-800', label: 'Restaurant' },
    attraction_interaction: { icon: 'map-pin', color: 'bg-green-100 text-green-800', label: 'Attraction' },
    search: { icon: 'search', color: 'bg-gray-100 text-gray-800', label: 'Search' },
    favorite: { icon: 'heart', color: 'bg-red-100 text-red-800', label: 'Favorite' },
    rating: { icon: 'star', color: 'bg-yellow-100 text-yellow-800', label: 'Rating' },
    review: { icon: 'message-square', color: 'bg-blue-100 text-blue-800', label: 'Review' },
    share: { icon: 'share-2', color: 'bg-indigo-100 text-indigo-800', label: 'Share' },
    other: { icon: 'activity', color: 'bg-gray-100 text-gray-800', label: 'Activity' },
  };

  return configs[type] || configs.other;
}

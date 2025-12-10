import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  CrmContact,
  CrmContactInput,
  CrmContactFilters,
  CrmContactSummary,
} from '@/types/crm';

const CRM_CONTACTS_KEY = 'crm-contacts';

export function useCrmContacts(filters?: CrmContactFilters) {
  const { toast } = useToast();

  return useQuery({
    queryKey: [CRM_CONTACTS_KEY, filters],
    queryFn: async () => {
      let query = supabase
        .from('crm_contacts')
        .select('*');

      // Apply filters
      if (filters?.search) {
        query = query.or(
          `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,company.ilike.%${filters.search}%`
        );
      }

      if (filters?.status) {
        const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
        query = query.in('status', statuses);
      }

      if (filters?.source) {
        const sources = Array.isArray(filters.source) ? filters.source : [filters.source];
        query = query.in('source', sources);
      }

      if (filters?.assigned_to) {
        query = query.eq('assigned_to', filters.assigned_to);
      }

      if (filters?.min_lead_score !== undefined) {
        query = query.gte('lead_score', filters.min_lead_score);
      }

      if (filters?.max_lead_score !== undefined) {
        query = query.lte('lead_score', filters.max_lead_score);
      }

      if (filters?.tags && filters.tags.length > 0) {
        query = query.overlaps('tags', filters.tags);
      }

      if (filters?.created_after) {
        query = query.gte('created_at', filters.created_after);
      }

      if (filters?.created_before) {
        query = query.lte('created_at', filters.created_before);
      }

      // Sorting
      const sortBy = filters?.sort_by || 'created_at';
      const sortOrder = filters?.sort_order === 'asc' ? true : false;
      query = query.order(sortBy, { ascending: sortOrder });

      // Pagination
      const page = filters?.page || 1;
      const perPage = filters?.per_page || 25;
      const from = (page - 1) * perPage;
      const to = from + perPage - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        contacts: data as CrmContact[],
        total: count || 0,
        page,
        perPage,
      };
    },
  });
}

export function useCrmContact(contactId: string | undefined) {
  return useQuery({
    queryKey: [CRM_CONTACTS_KEY, contactId],
    queryFn: async () => {
      if (!contactId) return null;

      const { data, error } = await supabase
        .from('crm_contacts')
        .select('*')
        .eq('id', contactId)
        .single();

      if (error) throw error;
      return data as CrmContact;
    },
    enabled: !!contactId,
  });
}

export function useCrmContactSummary(contactId: string | undefined) {
  return useQuery({
    queryKey: [CRM_CONTACTS_KEY, contactId, 'summary'],
    queryFn: async () => {
      if (!contactId) return null;

      // Fetch contact with related data
      const { data: contact, error: contactError } = await supabase
        .from('crm_contacts')
        .select('*')
        .eq('id', contactId)
        .single();

      if (contactError) throw contactError;

      // Fetch deal counts
      const { data: deals } = await supabase
        .from('crm_deals')
        .select('status, value')
        .eq('contact_id', contactId);

      // Fetch communications count
      const { count: communicationsCount } = await supabase
        .from('crm_communications')
        .select('*', { count: 'exact', head: true })
        .eq('contact_id', contactId);

      // Fetch activities count
      const { count: activitiesCount } = await supabase
        .from('crm_activities')
        .select('*', { count: 'exact', head: true })
        .eq('contact_id', contactId);

      // Fetch segment names
      const { data: segments } = await supabase
        .from('crm_contact_segments')
        .select('segment:crm_segments(name)')
        .eq('contact_id', contactId);

      const openDeals = deals?.filter(d => d.status === 'open') || [];
      const wonDeals = deals?.filter(d => d.status === 'won') || [];

      return {
        ...contact,
        open_deals_count: openDeals.length,
        won_deals_count: wonDeals.length,
        total_deal_value: wonDeals.reduce((sum, d) => sum + (d.value || 0), 0),
        communications_count: communicationsCount || 0,
        activities_count: activitiesCount || 0,
        segment_names: segments?.map((s: { segment: { name: string } | null }) => s.segment?.name).filter(Boolean) || [],
      } as CrmContactSummary;
    },
    enabled: !!contactId,
  });
}

export function useCrmContactMutations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createContact = useMutation({
    mutationFn: async (input: CrmContactInput) => {
      const { data, error } = await supabase
        .from('crm_contacts')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data as CrmContact;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CRM_CONTACTS_KEY] });
      toast({
        title: 'Contact created',
        description: 'The contact has been created successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error creating contact',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateContact = useMutation({
    mutationFn: async ({ id, ...input }: CrmContactInput & { id: string }) => {
      const { data, error } = await supabase
        .from('crm_contacts')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as CrmContact;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [CRM_CONTACTS_KEY] });
      queryClient.invalidateQueries({ queryKey: [CRM_CONTACTS_KEY, data.id] });
      toast({
        title: 'Contact updated',
        description: 'The contact has been updated successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error updating contact',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('crm_contacts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CRM_CONTACTS_KEY] });
      toast({
        title: 'Contact deleted',
        description: 'The contact has been deleted successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error deleting contact',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateLeadScore = useMutation({
    mutationFn: async ({ contactId, scoreChange, reason }: { contactId: string; scoreChange: number; reason?: string }) => {
      const { data, error } = await supabase.rpc('update_lead_score', {
        p_contact_id: contactId,
        p_score_change: scoreChange,
        p_reason: reason || null,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [CRM_CONTACTS_KEY, variables.contactId] });
      toast({
        title: 'Lead score updated',
        description: 'The lead score has been updated successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error updating lead score',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    createContact,
    updateContact,
    deleteContact,
    updateLeadScore,
  };
}

export function useCrmContactStats() {
  return useQuery({
    queryKey: [CRM_CONTACTS_KEY, 'stats'],
    queryFn: async () => {
      // Get total counts by status
      const { data: statusCounts, error: statusError } = await supabase
        .from('crm_contacts')
        .select('status')
        .then(result => {
          if (result.error) throw result.error;
          const counts: Record<string, number> = {};
          result.data?.forEach(c => {
            counts[c.status] = (counts[c.status] || 0) + 1;
          });
          return { data: counts, error: null };
        });

      if (statusError) throw statusError;

      // Get counts by source
      const { data: sourceCounts, error: sourceError } = await supabase
        .from('crm_contacts')
        .select('source')
        .then(result => {
          if (result.error) throw result.error;
          const counts: Record<string, number> = {};
          result.data?.forEach(c => {
            counts[c.source] = (counts[c.source] || 0) + 1;
          });
          return { data: counts, error: null };
        });

      if (sourceError) throw sourceError;

      // Get new contacts this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { count: newThisMonth } = await supabase
        .from('crm_contacts')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfMonth.toISOString());

      // Get average lead score
      const { data: avgScore } = await supabase
        .from('crm_contacts')
        .select('lead_score')
        .then(result => {
          if (result.error || !result.data?.length) return { data: 0 };
          const sum = result.data.reduce((acc, c) => acc + (c.lead_score || 0), 0);
          return { data: Math.round(sum / result.data.length) };
        });

      return {
        byStatus: statusCounts,
        bySource: sourceCounts,
        newThisMonth: newThisMonth || 0,
        averageLeadScore: avgScore || 0,
        total: Object.values(statusCounts || {}).reduce((a, b) => a + b, 0),
      };
    },
  });
}

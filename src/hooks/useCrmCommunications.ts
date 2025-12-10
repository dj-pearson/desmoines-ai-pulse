import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  CrmCommunication,
  CrmCommunicationInput,
  CrmCommunicationFilters,
} from '@/types/crm';

const CRM_COMMUNICATIONS_KEY = 'crm-communications';

export function useCrmCommunications(filters?: CrmCommunicationFilters) {
  return useQuery({
    queryKey: [CRM_COMMUNICATIONS_KEY, filters],
    queryFn: async () => {
      let query = supabase
        .from('crm_communications')
        .select('*');

      if (filters?.contact_id) {
        query = query.eq('contact_id', filters.contact_id);
      }

      if (filters?.channel) {
        const channels = Array.isArray(filters.channel) ? filters.channel : [filters.channel];
        query = query.in('channel', channels);
      }

      if (filters?.direction) {
        query = query.eq('direction', filters.direction);
      }

      if (filters?.sent_after) {
        query = query.gte('sent_at', filters.sent_after);
      }

      if (filters?.sent_before) {
        query = query.lte('sent_at', filters.sent_before);
      }

      if (filters?.sent_by) {
        query = query.eq('sent_by', filters.sent_by);
      }

      query = query.order('sent_at', { ascending: false });

      // Pagination
      const page = filters?.page || 1;
      const perPage = filters?.per_page || 25;
      const from = (page - 1) * perPage;
      const to = from + perPage - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        communications: data as CrmCommunication[],
        total: count || 0,
        page,
        perPage,
      };
    },
  });
}

export function useCrmContactCommunications(contactId: string | undefined) {
  return useQuery({
    queryKey: [CRM_COMMUNICATIONS_KEY, 'contact', contactId],
    queryFn: async () => {
      if (!contactId) return [];

      const { data, error } = await supabase
        .from('crm_communications')
        .select('*')
        .eq('contact_id', contactId)
        .order('sent_at', { ascending: false });

      if (error) throw error;
      return data as CrmCommunication[];
    },
    enabled: !!contactId,
  });
}

export function useCrmCommunication(communicationId: string | undefined) {
  return useQuery({
    queryKey: [CRM_COMMUNICATIONS_KEY, communicationId],
    queryFn: async () => {
      if (!communicationId) return null;

      const { data, error } = await supabase
        .from('crm_communications')
        .select('*')
        .eq('id', communicationId)
        .single();

      if (error) throw error;
      return data as CrmCommunication;
    },
    enabled: !!communicationId,
  });
}

export function useCrmEmailThread(threadId: string | undefined) {
  return useQuery({
    queryKey: [CRM_COMMUNICATIONS_KEY, 'thread', threadId],
    queryFn: async () => {
      if (!threadId) return [];

      const { data, error } = await supabase
        .from('crm_communications')
        .select('*')
        .eq('email_thread_id', threadId)
        .order('sent_at', { ascending: true });

      if (error) throw error;
      return data as CrmCommunication[];
    },
    enabled: !!threadId,
  });
}

export function useCrmCommunicationMutations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createCommunication = useMutation({
    mutationFn: async (input: CrmCommunicationInput) => {
      const { data, error } = await supabase
        .from('crm_communications')
        .insert(input)
        .select()
        .single();

      if (error) throw error;

      // Add activity for the communication
      await supabase.rpc('add_crm_activity', {
        p_contact_id: input.contact_id,
        p_activity_type: input.channel as string,
        p_title: `${input.direction === 'outbound' ? 'Sent' : 'Received'} ${input.channel}: ${input.subject || 'No subject'}`,
        p_description: input.summary || input.content?.substring(0, 200),
        p_metadata: { channel: input.channel, direction: input.direction },
      });

      return data as CrmCommunication;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [CRM_COMMUNICATIONS_KEY] });
      queryClient.invalidateQueries({ queryKey: [CRM_COMMUNICATIONS_KEY, 'contact', variables.contact_id] });
      toast({
        title: 'Communication logged',
        description: 'The communication has been logged successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error logging communication',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateCommunication = useMutation({
    mutationFn: async ({ id, ...input }: Partial<CrmCommunicationInput> & { id: string }) => {
      const { data, error } = await supabase
        .from('crm_communications')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as CrmCommunication;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [CRM_COMMUNICATIONS_KEY] });
      queryClient.invalidateQueries({ queryKey: [CRM_COMMUNICATIONS_KEY, data.id] });
      toast({
        title: 'Communication updated',
        description: 'The communication has been updated successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error updating communication',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteCommunication = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('crm_communications')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CRM_COMMUNICATIONS_KEY] });
      toast({
        title: 'Communication deleted',
        description: 'The communication has been deleted successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error deleting communication',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    createCommunication,
    updateCommunication,
    deleteCommunication,
  };
}

export function useCrmCommunicationStats(contactId?: string) {
  return useQuery({
    queryKey: [CRM_COMMUNICATIONS_KEY, 'stats', contactId],
    queryFn: async () => {
      let query = supabase
        .from('crm_communications')
        .select('channel, direction, sent_at');

      if (contactId) {
        query = query.eq('contact_id', contactId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const byChannel: Record<string, number> = {};
      const byDirection: Record<string, number> = { inbound: 0, outbound: 0 };

      data?.forEach(c => {
        byChannel[c.channel] = (byChannel[c.channel] || 0) + 1;
        byDirection[c.direction]++;
      });

      // Recent activity (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentCount = data?.filter(c =>
        new Date(c.sent_at) >= thirtyDaysAgo
      ).length || 0;

      return {
        total: data?.length || 0,
        byChannel,
        byDirection,
        recentCount,
      };
    },
  });
}

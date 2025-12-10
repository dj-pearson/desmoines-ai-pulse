import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  CrmSegment,
  CrmSegmentInput,
  CrmContactSegment,
  CrmContact,
} from '@/types/crm';

const CRM_SEGMENTS_KEY = 'crm-segments';

export function useCrmSegments() {
  return useQuery({
    queryKey: [CRM_SEGMENTS_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_segments')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      return data as CrmSegment[];
    },
  });
}

export function useCrmSegment(segmentId: string | undefined) {
  return useQuery({
    queryKey: [CRM_SEGMENTS_KEY, segmentId],
    queryFn: async () => {
      if (!segmentId) return null;

      const { data, error } = await supabase
        .from('crm_segments')
        .select('*')
        .eq('id', segmentId)
        .single();

      if (error) throw error;
      return data as CrmSegment;
    },
    enabled: !!segmentId,
  });
}

export function useCrmSegmentContacts(segmentId: string | undefined) {
  return useQuery({
    queryKey: [CRM_SEGMENTS_KEY, segmentId, 'contacts'],
    queryFn: async () => {
      if (!segmentId) return [];

      // First get the segment to check if it's dynamic
      const { data: segment, error: segmentError } = await supabase
        .from('crm_segments')
        .select('segment_type, rules')
        .eq('id', segmentId)
        .single();

      if (segmentError) throw segmentError;

      if (segment.segment_type === 'dynamic') {
        // For dynamic segments, evaluate rules
        const { data, error } = await supabase.rpc('evaluate_segment_rules', {
          p_segment_id: segmentId,
        });

        if (error) throw error;

        // Get full contact details
        const contactIds = data?.map((r: { contact_id: string }) => r.contact_id) || [];
        if (contactIds.length === 0) return [];

        const { data: contacts, error: contactsError } = await supabase
          .from('crm_contacts')
          .select('*')
          .in('id', contactIds);

        if (contactsError) throw contactsError;
        return contacts as CrmContact[];
      } else {
        // For static segments, use junction table
        const { data, error } = await supabase
          .from('crm_contact_segments')
          .select('contact:crm_contacts(*)')
          .eq('segment_id', segmentId);

        if (error) throw error;
        return data?.map((r: { contact: CrmContact }) => r.contact) || [];
      }
    },
    enabled: !!segmentId,
  });
}

export function useCrmContactSegments(contactId: string | undefined) {
  return useQuery({
    queryKey: [CRM_SEGMENTS_KEY, 'contact', contactId],
    queryFn: async () => {
      if (!contactId) return [];

      const { data, error } = await supabase
        .from('crm_contact_segments')
        .select('segment:crm_segments(*)')
        .eq('contact_id', contactId);

      if (error) throw error;
      return data?.map((r: { segment: CrmSegment }) => r.segment) || [];
    },
    enabled: !!contactId,
  });
}

export function useCrmSegmentMutations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createSegment = useMutation({
    mutationFn: async (input: CrmSegmentInput) => {
      const { data, error } = await supabase
        .from('crm_segments')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data as CrmSegment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CRM_SEGMENTS_KEY] });
      toast({
        title: 'Segment created',
        description: 'The segment has been created successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error creating segment',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateSegment = useMutation({
    mutationFn: async ({ id, ...input }: Partial<CrmSegmentInput> & { id: string }) => {
      const { data, error } = await supabase
        .from('crm_segments')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as CrmSegment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [CRM_SEGMENTS_KEY] });
      queryClient.invalidateQueries({ queryKey: [CRM_SEGMENTS_KEY, data.id] });
      toast({
        title: 'Segment updated',
        description: 'The segment has been updated successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error updating segment',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteSegment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('crm_segments')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CRM_SEGMENTS_KEY] });
      toast({
        title: 'Segment deleted',
        description: 'The segment has been deleted successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error deleting segment',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const addContactToSegment = useMutation({
    mutationFn: async ({ contactId, segmentId }: { contactId: string; segmentId: string }) => {
      const { data, error } = await supabase
        .from('crm_contact_segments')
        .insert({ contact_id: contactId, segment_id: segmentId })
        .select()
        .single();

      if (error) throw error;

      // Add activity
      await supabase.rpc('add_crm_activity', {
        p_contact_id: contactId,
        p_activity_type: 'segment_added',
        p_title: 'Added to segment',
        p_metadata: { segment_id: segmentId },
      });

      return data as CrmContactSegment;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [CRM_SEGMENTS_KEY] });
      queryClient.invalidateQueries({ queryKey: [CRM_SEGMENTS_KEY, variables.segmentId, 'contacts'] });
      queryClient.invalidateQueries({ queryKey: [CRM_SEGMENTS_KEY, 'contact', variables.contactId] });
      toast({
        title: 'Contact added to segment',
        description: 'The contact has been added to the segment successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error adding contact to segment',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const removeContactFromSegment = useMutation({
    mutationFn: async ({ contactId, segmentId }: { contactId: string; segmentId: string }) => {
      const { error } = await supabase
        .from('crm_contact_segments')
        .delete()
        .eq('contact_id', contactId)
        .eq('segment_id', segmentId);

      if (error) throw error;

      // Add activity
      await supabase.rpc('add_crm_activity', {
        p_contact_id: contactId,
        p_activity_type: 'segment_removed',
        p_title: 'Removed from segment',
        p_metadata: { segment_id: segmentId },
      });

      return { contactId, segmentId };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [CRM_SEGMENTS_KEY] });
      queryClient.invalidateQueries({ queryKey: [CRM_SEGMENTS_KEY, variables.segmentId, 'contacts'] });
      queryClient.invalidateQueries({ queryKey: [CRM_SEGMENTS_KEY, 'contact', variables.contactId] });
      toast({
        title: 'Contact removed from segment',
        description: 'The contact has been removed from the segment successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error removing contact from segment',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const addMultipleContactsToSegment = useMutation({
    mutationFn: async ({ contactIds, segmentId }: { contactIds: string[]; segmentId: string }) => {
      const records = contactIds.map(contactId => ({
        contact_id: contactId,
        segment_id: segmentId,
      }));

      const { error } = await supabase
        .from('crm_contact_segments')
        .upsert(records, { onConflict: 'contact_id,segment_id' });

      if (error) throw error;
      return { contactIds, segmentId };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [CRM_SEGMENTS_KEY] });
      queryClient.invalidateQueries({ queryKey: [CRM_SEGMENTS_KEY, variables.segmentId, 'contacts'] });
      toast({
        title: 'Contacts added to segment',
        description: `${variables.contactIds.length} contacts have been added to the segment.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error adding contacts to segment',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    createSegment,
    updateSegment,
    deleteSegment,
    addContactToSegment,
    removeContactFromSegment,
    addMultipleContactsToSegment,
  };
}

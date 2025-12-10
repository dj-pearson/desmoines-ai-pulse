import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { CrmNote, CrmNoteInput } from '@/types/crm';

const CRM_NOTES_KEY = 'crm-notes';

export function useCrmContactNotes(contactId: string | undefined) {
  return useQuery({
    queryKey: [CRM_NOTES_KEY, 'contact', contactId],
    queryFn: async () => {
      if (!contactId) return [];

      const { data, error } = await supabase
        .from('crm_notes')
        .select('*')
        .eq('contact_id', contactId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as CrmNote[];
    },
    enabled: !!contactId,
  });
}

export function useCrmDealNotes(dealId: string | undefined) {
  return useQuery({
    queryKey: [CRM_NOTES_KEY, 'deal', dealId],
    queryFn: async () => {
      if (!dealId) return [];

      const { data, error } = await supabase
        .from('crm_notes')
        .select('*')
        .eq('deal_id', dealId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as CrmNote[];
    },
    enabled: !!dealId,
  });
}

export function useCrmNoteMutations() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const createNote = useMutation({
    mutationFn: async (input: CrmNoteInput) => {
      const { data, error } = await supabase
        .from('crm_notes')
        .insert({
          ...input,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Add activity
      await supabase.rpc('add_crm_activity', {
        p_contact_id: input.contact_id,
        p_activity_type: 'note',
        p_title: 'Note added',
        p_description: input.content.substring(0, 200),
        p_deal_id: input.deal_id || null,
      });

      return data as CrmNote;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [CRM_NOTES_KEY, 'contact', variables.contact_id] });
      if (variables.deal_id) {
        queryClient.invalidateQueries({ queryKey: [CRM_NOTES_KEY, 'deal', variables.deal_id] });
      }
      toast({
        title: 'Note added',
        description: 'The note has been added successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error adding note',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateNote = useMutation({
    mutationFn: async ({ id, ...input }: Partial<CrmNoteInput> & { id: string }) => {
      const { data, error } = await supabase
        .from('crm_notes')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as CrmNote;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [CRM_NOTES_KEY, 'contact', data.contact_id] });
      if (data.deal_id) {
        queryClient.invalidateQueries({ queryKey: [CRM_NOTES_KEY, 'deal', data.deal_id] });
      }
      toast({
        title: 'Note updated',
        description: 'The note has been updated successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error updating note',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const togglePinNote = useMutation({
    mutationFn: async ({ id, isPinned }: { id: string; isPinned: boolean }) => {
      const { data, error } = await supabase
        .from('crm_notes')
        .update({ is_pinned: !isPinned })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as CrmNote;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [CRM_NOTES_KEY, 'contact', data.contact_id] });
      if (data.deal_id) {
        queryClient.invalidateQueries({ queryKey: [CRM_NOTES_KEY, 'deal', data.deal_id] });
      }
      toast({
        title: data.is_pinned ? 'Note pinned' : 'Note unpinned',
        description: data.is_pinned
          ? 'The note has been pinned to the top.'
          : 'The note has been unpinned.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error updating note',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      // Get the note first to know which queries to invalidate
      const { data: note } = await supabase
        .from('crm_notes')
        .select('contact_id, deal_id')
        .eq('id', id)
        .single();

      const { error } = await supabase
        .from('crm_notes')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { id, contactId: note?.contact_id, dealId: note?.deal_id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [CRM_NOTES_KEY, 'contact', data.contactId] });
      if (data.dealId) {
        queryClient.invalidateQueries({ queryKey: [CRM_NOTES_KEY, 'deal', data.dealId] });
      }
      toast({
        title: 'Note deleted',
        description: 'The note has been deleted successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error deleting note',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    createNote,
    updateNote,
    togglePinNote,
    deleteNote,
  };
}

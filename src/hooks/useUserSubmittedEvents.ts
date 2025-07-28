import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface UserSubmittedEvent {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  venue?: string;
  location?: string;
  address?: string;
  price?: string;
  category?: string;
  website_url?: string;
  contact_email?: string;
  contact_phone?: string;
  image_url?: string;
  tags?: string[];
  status: 'pending' | 'approved' | 'rejected' | 'needs_revision';
  admin_notes?: string;
  admin_reviewed_by?: string;
  admin_reviewed_at?: string;
  submitted_at: string;
  created_at: string;
  updated_at: string;
}

export function useUserSubmittedEvents() {
  const { user } = useAuth();
  
  return useQuery<UserSubmittedEvent[]>({
    queryKey: ['user-submitted-events', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('User not authenticated');
      
      const { data, error } = await supabase
        .from('user_submitted_events')
        .select('*')
        .eq('user_id', user.id)
        .order('submitted_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });
}

export function useSubmitEvent() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (eventData: Omit<UserSubmittedEvent, 'id' | 'user_id' | 'status' | 'submitted_at' | 'created_at' | 'updated_at'>) => {
      if (!user) throw new Error('User not authenticated');
      
      const { data, error } = await supabase
        .from('user_submitted_events')
        .insert([
          {
            ...eventData,
            user_id: user.id,
          }
        ])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-submitted-events'] });
    },
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...eventData }: Partial<UserSubmittedEvent> & { id: string }) => {
      const { data, error } = await supabase
        .from('user_submitted_events')
        .update(eventData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-submitted-events'] });
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('user_submitted_events')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-submitted-events'] });
    },
  });
}

// For admin use - get all submitted events
export function useAllSubmittedEvents() {
  return useQuery<UserSubmittedEvent[]>({
    queryKey: ['all-submitted-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_submitted_events')
        .select(`
          *,
          profiles!user_submitted_events_user_id_fkey(first_name, last_name, email)
        `)
        .order('submitted_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
  });
}

// For admin use - approve/reject events
export function useReviewEvent() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      id, 
      status, 
      admin_notes 
    }: { 
      id: string; 
      status: 'approved' | 'rejected' | 'needs_revision'; 
      admin_notes?: string;
    }) => {
      const { data, error } = await supabase
        .from('user_submitted_events')
        .update({
          status,
          admin_notes,
          admin_reviewed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-submitted-events'] });
      queryClient.invalidateQueries({ queryKey: ['user-submitted-events'] });
    },
  });
}

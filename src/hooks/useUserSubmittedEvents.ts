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

/**
 * Fire-and-forget notification to the edge function.
 * Errors are logged but never block the UI flow.
 */
async function sendEventNotification(payload: {
  notificationType: string;
  eventId: string;
  eventTitle: string;
  eventDate?: string;
  eventVenue?: string;
  eventCategory?: string;
  submitterEmail?: string;
  submitterName?: string;
  adminNotes?: string;
}) {
  try {
    await supabase.functions.invoke('notify-event-submission', {
      body: payload,
    });
  } catch (err) {
    // Best-effort – don't block the user
    if (import.meta.env.DEV) {
      console.warn('Event notification failed (non-blocking):', err);
    }
  }
}

export function useUserSubmittedEvents() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-submitted-events', user?.id],
    queryFn: async (): Promise<UserSubmittedEvent[]> => {
      if (!user) throw new Error('User not authenticated');

      const { data, error} = await supabase
        .from('user_submitted_events')
        .select('*')
        .eq('user_id', user.id)
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      return (data || []) as UserSubmittedEvent[];
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

      // Notify admin (fire-and-forget)
      sendEventNotification({
        notificationType: 'event_submitted',
        eventId: data.id,
        eventTitle: data.title,
        eventDate: data.date ? new Date(data.date).toLocaleDateString() : undefined,
        eventVenue: data.venue || undefined,
        eventCategory: data.category || undefined,
        submitterEmail: user.email || undefined,
        submitterName: user.user_metadata?.full_name || user.email || undefined,
      });

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
  return useQuery({
    queryKey: ['all-submitted-events'],
    queryFn: async (): Promise<UserSubmittedEvent[]> => {
      const { data, error } = await (supabase as any)
        .from('user_submitted_events')
        .select(`
          *,
          profiles!user_submitted_events_user_id_fkey(first_name, last_name, email)
        `)
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      return (data || []) as UserSubmittedEvent[];
    },
  });
}

// For admin use - approve/reject events
// When approved, also publishes the event to the main events table
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
      // Update submission status
      const { data, error } = await (supabase as any)
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

      // If approved, publish to the main events table
      if (status === 'approved' && data) {
        const submittedEvent = data as UserSubmittedEvent;
        const { error: publishError } = await supabase
          .from('events')
          .insert([{
            title: submittedEvent.title,
            description: submittedEvent.description || null,
            date: submittedEvent.date || null,
            start_time: submittedEvent.start_time || null,
            end_time: submittedEvent.end_time || null,
            venue: submittedEvent.venue || null,
            location: submittedEvent.location || null,
            address: submittedEvent.address || null,
            price: submittedEvent.price || null,
            category: submittedEvent.category || 'General',
            source_url: submittedEvent.website_url || null,
            image_url: submittedEvent.image_url || null,
            city: submittedEvent.location || 'Des Moines',
            source: 'user_submitted',
          }]);

        if (publishError) {
          console.error('Failed to publish to events table:', publishError);
        }
      }

      // Notify the submitter about the review decision
      if (data) {
        const submittedEvent = data as UserSubmittedEvent;
        // Look up submitter email via auth
        const { data: userData } = await supabase.auth.admin.getUserById(submittedEvent.user_id).catch(() => ({ data: null }));
        const submitterEmail = (userData as any)?.user?.email;

        if (submitterEmail) {
          const notificationType = status === 'approved'
            ? 'event_approved'
            : status === 'rejected'
              ? 'event_rejected'
              : 'event_needs_revision';

          sendEventNotification({
            notificationType,
            eventId: submittedEvent.id,
            eventTitle: submittedEvent.title,
            submitterEmail,
            adminNotes: admin_notes,
          });
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-submitted-events'] });
      queryClient.invalidateQueries({ queryKey: ['user-submitted-events'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

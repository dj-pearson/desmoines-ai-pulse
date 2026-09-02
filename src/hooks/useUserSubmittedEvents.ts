import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { handleError } from "@/lib/errorHandler";
import { formatInCentralTime, CENTRAL_TIMEZONE } from "@/lib/timezone";

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

      // AI triage (WEB-AUTO-002): auto-approve clean / auto-reject junk / queue
      // the ambiguous middle. Fire-and-forget — never block the submit UX.
      supabase.functions
        .invoke('triage-event-submission', { body: { submissionId: data.id } })
        .catch((err) => {
          if (import.meta.env.DEV) console.error('triage-event-submission failed', err);
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
  // WEB-SEC-031. Every other submission query here is keyed by user; this one
  // returns EVERY submission, with the submitter's name and email joined in,
  // and was keyed by nothing. On a shared browser the cached admin result
  // outlived the admin's session.
  const { user } = useAuth();

  return useQuery({
    queryKey: ['all-submitted-events', user?.id ?? 'anonymous'],
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

      // If approved, publish to the main events table.
      //
      // WEB-QA-018: this insert previously named four columns that do not exist
      // on public.events -- description, start_time, end_time and address -- so
      // it failed with PGRST204 every single time. The error was only
      // console.error'd, and console.* is stripped from production builds
      // (vite.config.ts esbuild.drop), so in production it produced no signal at
      // all: the caller's toast.success fired and admins believed approved
      // submissions were being published. Nothing was.
      //
      // Column mapping now follows the convention the crawler already uses
      // (crawlers/catchdesmoines_crawler.py:372-389), confirmed against the live
      // schema: description -> original_description + enhanced_description,
      // start_time -> event_start_local. All 1246 production rows populate both
      // description columns that way.
      //
      // event_start_local is `timestamp without time zone` -- local wall-clock,
      // not the user's free-text start_time. It is derived from the submission's
      // timestamptz date via the project's Central-time helper, matching all
      // 1246 existing rows. The free-text start_time is not published: readers
      // fall back event_start_local -> event_start_utc -> date anyway
      // (EnhancedEventSEO.tsx:26, SocialEventCard.tsx:72).
      //
      // start_time and end_time are deliberately not published: events has no
      // text time columns, and end_date is a timestamptz used by 0 of 1246 rows.
      // Both values stay on the user_submitted_events row, so nothing is lost. address is folded into location, which is what the geocoding
      // trigger reads and is NOT NULL on events.
      if (status === 'approved' && data) {
        const submittedEvent = data as UserSubmittedEvent;

        // events.date is NOT NULL. Fail loudly rather than sending an insert
        // that cannot succeed.
        if (!submittedEvent.date) {
          throw new Error(
            `Submission "${submittedEvent.title}" has no date, so it cannot be published. ` +
            'The review decision was saved; set a date on the submission and approve it again.'
          );
        }

        const description = submittedEvent.description?.trim() || null;
        const address = submittedEvent.address?.trim();
        const submittedLocation = submittedEvent.location?.trim();
        // location is NOT NULL on events; prefer the most specific value we have.
        const location = [submittedLocation, address]
          .filter((part): part is string => Boolean(part))
          .filter((part, i, all) => all.indexOf(part) === i)
          .join(' - ') || 'Des Moines, IA';

        const { error: publishError } = await supabase
          .from('events')
          .insert([{
            title: submittedEvent.title,
            original_description: description,
            enhanced_description: description,
            date: submittedEvent.date,
            event_start_local: formatInCentralTime(
              submittedEvent.date,
              "yyyy-MM-dd'T'HH:mm:ss"
            ),
            event_start_utc: submittedEvent.date,
            event_timezone: CENTRAL_TIMEZONE,
            venue: submittedEvent.venue || null,
            location,
            price: submittedEvent.price || null,
            category: submittedEvent.category || 'General',
            source_url: submittedEvent.website_url || null,
            image_url: submittedEvent.image_url || null,
            city: submittedLocation || 'Des Moines',
            source: 'user_submitted',
          }]);

        if (publishError) {
          // Throw rather than log. The review decision above is already saved,
          // so the honest outcome is "approved but not published" and the admin
          // needs to see it -- EventReviewSystem.tsx catches this and replaces
          // its success toast with an error.
          handleError(publishError, {
            component: 'useReviewEvent',
            action: 'publishApprovedSubmission',
          });
          throw new Error(
            `Approval saved, but publishing "${submittedEvent.title}" to the events ` +
            `feed failed: ${publishError.message}`
          );
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

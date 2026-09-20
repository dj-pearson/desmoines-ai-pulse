import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from '@/integrations/supabase/types';
import { createLogger } from '@/lib/logger';
import { useAuth } from "./useAuth";
import { handleError } from "@/lib/errorHandler";
import { formatInCentralTime, CENTRAL_TIMEZONE, formatEventPart } from "@/lib/timezone";

const log = createLogger('useUserSubmittedEvents');

/** The columns UserSubmittedEvent declares; the table also has triage fields. */
const SUBMITTED_EVENT_COLUMNS =
  'id, user_id, title, description, date, start_time, end_time, venue, location, address, price, category, website_url, contact_email, contact_phone, image_url, tags, status, admin_notes, admin_reviewed_by, admin_reviewed_at, submitted_at, created_at, updated_at';

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
  /**
   * The published events row's id, when this submission has a visible listing
   * (WEB-ADS-008). Hydrated by useUserSubmittedEvents from a second query, not
   * a column. Null while pending, while hidden pending a re-review, and
   * everywhere 20260920000001 has not been applied.
   */
  live_event_id?: string | null;
  /** Hydrated by useAllSubmittedEvents from a separate profiles query. */
  profiles?: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
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
      const submissions = (data || []) as UserSubmittedEvent[];
      if (submissions.length === 0) return submissions;

      // WEB-ADS-008 AC5: the live listing, so the dashboard can link an
      // organizer to their own event instead of telling them it is approved
      // and leaving them to search a thousand-row list for it.
      //
      // A SECOND QUERY RATHER THAN AN EMBED, deliberately. PostgREST embeds
      // resolve through FOREIGN KEYS and 20260920000001 adds none: a
      // submission can be deleted while its published listing stays up, which
      // an FK would either block or cascade. A PGRST200 here would fail the
      // WHOLE query and take the submissions list with it.
      //
      // Best-effort: before the migration is applied submission_id does not
      // exist and this 42703s, in which case no submission gets a link and the
      // list renders exactly as it does today.
      // THE BUILDER IS CAST, AND THE REASON IS COMPILE TIME, not style.
      // types.ts is generated from the DEPLOYED schema, so until
      // 20260920000001 is applied `submission_id` is not a column it knows:
      // PostgREST's typings resolve the select to
      // SelectQueryError<"column 'submission_id' does not exist on 'events'">,
      // and the .in()/.eq() after it get re-instantiated over that union until
      // tsc gives up with TS2589. unknownTable.ts measured the same shape at
      // 89s and 7.8M instantiations in one file. That helper cannot be used
      // here - check-unknown-tables fails it for a table types.ts DOES know -
      // so the chain is typed at its edges instead, which is also the only
      // place the row shape is worth stating.
      type LiveRow = { id: string; submission_id: string | null };
      const eventsBySubmission = supabase.from('events') as unknown as {
        select(columns: string): {
          in(column: string, values: string[]): {
            eq(
              column: string,
              value: boolean,
            ): {
              is(
                column: string,
                value: null,
              ): PromiseLike<{ data: LiveRow[] | null; error: { message: string } | null }>;
            };
          };
        };
      };

      const { data: published, error: publishedError } = await eventsBySubmission
        .select('id, submission_id')
        .in('submission_id', submissions.map((s) => s.id))
        .eq('is_hidden', false)
        // BOTH unpublish switches. A moderator hiding a row and the agent
        // sweep retiring an expired one are different facts, and a reader that
        // honours one would link an organizer to a listing that is gone
        // (check-event-unpublish-filters, which caught exactly this).
        .is('archived_at', null);

      if (publishedError) {
        if (import.meta.env.DEV) console.error('published listing lookup failed', publishedError);
        return submissions;
      }

      const liveById = new Map(
        (published ?? [])
          .filter((row) => row.submission_id)
          .map((row) => [row.submission_id as string, row.id]),
      );
      return submissions.map((s) => ({ ...s, live_event_id: liveById.get(s.id) ?? null }));
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
        eventDate: formatEventPart(data, 'MMM d, yyyy') ?? undefined,
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
    // TYPED AS THE TABLE'S OWN Update ROW, not Partial<UserSubmittedEvent>.
    // That interface now carries `profiles`, which is hydrated from a separate
    // query and is not a column - passing it here would be PGRST204 and the
    // whole update would be lost, which is the class WEB-QA-034 is about.
    mutationFn: async ({
      id,
      ...eventData
    }: Database['public']['Tables']['user_submitted_events']['Update'] & { id: string }) => {
      const { data, error } = await supabase
        .from('user_submitted_events')
        .update(eventData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // WEB-ADS-008 AC3: an edit after approval UNPUBLISHES until it is
      // re-approved.
      //
      // EventSubmissionForm already sets status back to 'pending' on an edit,
      // which was the right half. The other half was missing: the published
      // listing stayed up, unchanged, so an organizer correcting a wrong date
      // left the wrong date on the site with no way to take it down. Pushing
      // the edit straight through instead would give anyone who has had one
      // event approved a publish button for untriaged text.
      //
      // Best-effort: the edit itself is committed and must not be rolled back
      // because a listing could not be hidden. `as never` until the types are
      // regenerated with 20260920000001; PGRST202 until it is applied, which
      // this logs and moves past.
      if (eventData.status === 'pending') {
        const { error: unpublishError } = await supabase.rpc(
          'unpublish_submission' as never,
          { p_submission_id: id } as never,
        );
        if (unpublishError && import.meta.env.DEV) {
          console.error('unpublish_submission failed', unpublishError);
        }
      }

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
      // NO EMBED, AND THE HINT IT USED NAMED A CONSTRAINT THAT DOES NOT EXIST.
      // `profiles!user_submitted_events_user_id_fkey(...)` asks PostgREST to
      // join through that foreign key by name; user_submitted_events has no
      // foreign keys at all in the generated schema, so the answer was PGRST200
      // and the WHOLE query failed - this admin list has always thrown, and
      // EventReviewSystem has always rendered its error state (WEB-QA-034).
      const { data, error } = await supabase
        .from('user_submitted_events')
        .select(SUBMITTED_EVENT_COLUMNS)
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      const rows = (data || []) as UserSubmittedEvent[];

      // Submitter names in one extra request, keyed on profiles.USER_ID.
      // user_submitted_events.user_id is an auth user id and profiles.id is the
      // profile row's own PK; keying by it returns zero rows silently, which is
      // the WEB-SEC-023 failure this repo has hit four times.
      const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
      if (userIds.length === 0) return rows;

      // Best-effort by design: a failure costs the submitter names and the
      // submissions still render, so it is logged rather than thrown.
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, email')
        .in('user_id', userIds);
      if (profileError) {
        log.warn('allSubmitted', 'Submitter lookup failed', { error: profileError.message });
      }

      const byUserId = new Map((profiles ?? []).map((p) => [p.user_id, p]));
      return rows.map((row) => ({
        ...row,
        profiles: byUserId.get(row.user_id) ?? null,
      }));
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

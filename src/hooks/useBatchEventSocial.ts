import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { EventLiveStats, EventAttendee, EventDiscussion } from './useEventSocial';
import { createLogger } from '@/lib/logger';

const log = createLogger('useBatchEventSocial');

export interface BatchEventSocialData {
  attendees: EventAttendee[];
  discussions: EventDiscussion[];
  liveStats: EventLiveStats | null;
  discussionCount: number;
  attendeeCount: number;
}

export interface BatchEventSocialResult {
  [eventId: string]: BatchEventSocialData;
}

/**
 * Optimized hook that batches social data fetching for multiple events
 * Instead of N×5 queries (where N = number of events), this makes only 3 queries total
 *
 * Performance improvement: For 20 events, reduces from 100 queries to 3 queries
 */
export function useBatchEventSocial(eventIds: string[]) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['batch-event-social', eventIds.sort().join(','), user?.id],
    queryFn: async (): Promise<BatchEventSocialResult> => {
      if (eventIds.length === 0) {
        return {};
      }

      try {
        // Batch Query 1: Fetch all attendees for all events in one query
        const { data: attendeesData } = await supabase
          .from('event_attendees')
          .select('*')
          .in('event_id', eventIds)
          .eq('visibility', 'public')
          .order('created_at', { ascending: false });

        // Batch Query 2: Fetch all discussions for all events in one query
        const { data: discussionsData } = await supabase
          .from('event_discussions')
          .select('*')
          .in('event_id', eventIds)
          .order('created_at', { ascending: false });

        // Batch Query 3: Fetch all live stats for all events in one query
        const { data: statsData } = await supabase
          .from('event_live_stats')
          .select('*')
          .in('event_id', eventIds);

        // Group data by event_id for efficient lookup
        const result: BatchEventSocialResult = {};

        // Initialize all events with empty data
        eventIds.forEach(eventId => {
          result[eventId] = {
            attendees: [],
            discussions: [],
            liveStats: null,
            discussionCount: 0,
            attendeeCount: 0,
          };
        });

        // Group attendees by event_id
        attendeesData?.forEach(attendee => {
          const eventId = attendee.event_id;
          if (result[eventId]) {
            result[eventId].attendees.push({
              id: attendee.id,
              user_id: attendee.user_id,
              status: attendee.status as 'going' | 'interested' | 'maybe',
              visibility: attendee.visibility as 'public' | 'friends_only' | 'private',
              created_at: attendee.created_at,
            });
          }
        });

        // Group discussions by event_id (limit to 50 per event for performance)
        discussionsData?.forEach(discussion => {
          const eventId = discussion.event_id;
          if (result[eventId]) {
            // Only keep the first 50 discussions per event
            if (result[eventId].discussions.length < 50) {
              result[eventId].discussions.push({
                id: discussion.id,
                event_id: discussion.event_id,
                user_id: discussion.user_id,
                message: discussion.message,
                message_type: discussion.message_type as 'comment' | 'photo' | 'video' | 'tip',
                media_url: discussion.media_url,
                parent_id: discussion.parent_id,
                likes_count: discussion.likes_count,
                created_at: discussion.created_at,
                updated_at: discussion.updated_at,
              });
            }
          }
        });

        // Map stats by event_id
        statsData?.forEach(stats => {
          const eventId = stats.event_id;
          if (result[eventId]) {
            result[eventId].liveStats = stats as EventLiveStats;
          }
        });

        // Calculate counts for each event
        Object.keys(result).forEach(eventId => {
          result[eventId].attendeeCount = result[eventId].attendees.length;
          result[eventId].discussionCount = result[eventId].discussions.length;
        });

        return result;
      } catch (error) {
        log.error('fetchBatch', 'Error fetching batch event social data', { error });
        return {};
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes - social data changes frequently
    gcTime: 5 * 60 * 1000, // 5 minutes
    enabled: eventIds.length > 0,
  });
}

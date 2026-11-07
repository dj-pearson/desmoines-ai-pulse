import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { STALE_TIME } from "@/lib/queryConfig";
import { ErrorSeverity, handleError } from "@/lib/errorHandler";

export type FeedbackType = 'thumbs_up' | 'thumbs_down' | 'interested' | 'not_interested';
export type InteractionType = 'view' | 'click' | 'share' | 'save';

export interface UserFeedback {
  id: string;
  user_id: string;
  event_id: string;
  feedback_type: FeedbackType;
  created_at: string;
  updated_at: string;
}

export interface UserInteraction {
  id: string;
  user_id: string;
  event_id: string;
  interaction_type: InteractionType;
  created_at: string;
}

export interface FeedbackStats {
  thumbs_up: number;
  thumbs_down: number;
  interested: number;
  not_interested: number;
}

type FeedbackMap = Record<string, UserFeedback>;

const FEEDBACK_COLUMNS = "id, user_id, event_id, feedback_type, created_at, updated_at";
const EMPTY_FEEDBACK: FeedbackMap = {};
const EMPTY_STATS: FeedbackStats = { thumbs_up: 0, thumbs_down: 0, interested: 0, not_interested: 0 };

/**
 * One cache entry per signed-in user. Every EventCard used to mount this hook
 * twice (once for trackInteraction, once inside EventFeedback), and each mount
 * fetched the whole table for the user in its own useEffect, so a grid of 20
 * cards sent 40 identical requests. The user id is in the key so the next
 * account on a shared browser is never served the previous one's rows.
 */
export const userEventFeedbackKey = (userId: string | undefined) =>
  ["user-event-feedback", userId] as const;

/**
 * Just the interaction logger, for callers that render no feedback UI.
 * Stable across renders for a given user, so it is safe in useCallback deps
 * and does not subscribe the caller to the feedback query.
 */
export function useTrackInteraction() {
  const { user } = useAuth();
  const userId = user?.id;

  return useCallback(
    async (eventId: string, interactionType: InteractionType) => {
      if (!userId) return;
      const { error } = await supabase.from("user_event_interactions").insert({
        user_id: userId,
        event_id: eventId,
        interaction_type: interactionType,
      });
      if (error) {
        handleError(error, { component: "useFeedback", action: "trackInteraction" }, ErrorSeverity.WARNING);
      }
    },
    [userId],
  );
}

export function useFeedback() {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const trackInteraction = useTrackInteraction();

  const query = useQuery({
    queryKey: userEventFeedbackKey(userId),
    enabled: !!userId,
    staleTime: STALE_TIME.USER,
    queryFn: async (): Promise<FeedbackMap> => {
      const { data, error } = await supabase
        .from("user_event_feedback")
        .select(FEEDBACK_COLUMNS)
        .eq("user_id", userId);

      if (error) throw error;

      const map: FeedbackMap = {};
      for (const row of (data ?? []) as UserFeedback[]) {
        map[row.event_id] = row;
      }
      return map;
    },
  });

  // A failed fetch degrades to "no feedback yet", as the old hook did; the
  // buttons still work and the next mutation's invalidate retries the read.
  const userFeedback = userId ? (query.data ?? EMPTY_FEEDBACK) : EMPTY_FEEDBACK;

  const submitFeedback = useCallback(
    async (eventId: string, feedbackType: FeedbackType) => {
      if (!userId) {
        throw new Error("User must be authenticated to submit feedback");
      }

      const { data, error } = await supabase
        .from("user_event_feedback")
        .upsert({
          user_id: userId,
          event_id: eventId,
          feedback_type: feedbackType,
        })
        .select(FEEDBACK_COLUMNS)
        .single();

      if (error) {
        handleError(error, { component: "useFeedback", action: "submitFeedback" }, ErrorSeverity.WARNING);
        throw error;
      }

      queryClient.setQueryData<FeedbackMap>(userEventFeedbackKey(userId), (prev) => ({
        ...(prev ?? {}),
        [eventId]: data as UserFeedback,
      }));
      void queryClient.invalidateQueries({ queryKey: userEventFeedbackKey(userId) });

      return data as UserFeedback;
    },
    [userId, queryClient],
  );

  const removeFeedback = useCallback(
    async (eventId: string) => {
      if (!userId) return;

      const { error } = await supabase
        .from("user_event_feedback")
        .delete()
        .eq("user_id", userId)
        .eq("event_id", eventId);

      if (error) {
        handleError(error, { component: "useFeedback", action: "removeFeedback" }, ErrorSeverity.WARNING);
        throw error;
      }

      queryClient.setQueryData<FeedbackMap>(userEventFeedbackKey(userId), (prev) => {
        const next = { ...(prev ?? {}) };
        delete next[eventId];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: userEventFeedbackKey(userId) });
    },
    [userId, queryClient],
  );

  const getFeedbackForEvent = useCallback(
    (eventId: string): UserFeedback | null => userFeedback[eventId] || null,
    [userFeedback],
  );

  // Stable so EventFeedback can keep it in its effect deps without looping.
  const getFeedbackStats = useCallback(async (eventId: string): Promise<FeedbackStats> => {
    const { data, error } = await supabase
      .from("user_event_feedback")
      .select("feedback_type")
      .eq("event_id", eventId);

    if (error) {
      handleError(error, { component: "useFeedback", action: "getFeedbackStats" }, ErrorSeverity.WARNING);
      return { ...EMPTY_STATS };
    }

    const stats: FeedbackStats = { ...EMPTY_STATS };
    for (const row of data ?? []) {
      const type = row.feedback_type as FeedbackType;
      if (type in stats) stats[type] += 1;
    }
    return stats;
  }, []);

  const { refetch: refetchQuery } = query;
  const refetch = useCallback(async () => {
    if (!userId) return;
    await refetchQuery();
  }, [userId, refetchQuery]);

  return {
    userFeedback,
    isLoading: !!userId && query.isLoading,
    submitFeedback,
    removeFeedback,
    trackInteraction,
    getFeedbackForEvent,
    getFeedbackStats,
    refetch,
  };
}

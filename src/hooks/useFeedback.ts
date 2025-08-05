import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface UserFeedback {
  id: string;
  user_id: string;
  event_id: string;
  feedback_type: 'thumbs_up' | 'thumbs_down' | 'interested' | 'not_interested';
  created_at: string;
  updated_at: string;
}

export interface UserInteraction {
  id: string;
  user_id: string;
  event_id: string;
  interaction_type: 'view' | 'click' | 'share' | 'save';
  created_at: string;
}

export function useFeedback() {
  const { user } = useAuth();
  const [userFeedback, setUserFeedback] = useState<{ [eventId: string]: UserFeedback }>({});
  const [isLoading, setIsLoading] = useState(false);

  // Fetch user's existing feedback
  const fetchUserFeedback = async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("user_event_feedback")
        .select("*")
        .eq("user_id", user.id);

      if (error) throw error;

      const feedbackMap = (data || []).reduce((acc: any, feedback: UserFeedback) => {
        acc[feedback.event_id] = feedback;
        return acc;
      }, {});

      setUserFeedback(feedbackMap);
    } catch (error) {
      console.error("Error fetching user feedback:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Submit feedback (thumbs up/down/interested)
  const submitFeedback = async (eventId: string, feedbackType: 'thumbs_up' | 'thumbs_down' | 'interested' | 'not_interested') => {
    if (!user) {
      throw new Error("User must be authenticated to submit feedback");
    }

    try {
      const { data, error } = await supabase
        .from("user_event_feedback")
        .upsert({
          user_id: user.id,
          event_id: eventId,
          feedback_type: feedbackType,
        })
        .select()
        .single();

      if (error) throw error;

      // Update local state
      setUserFeedback(prev => ({
        ...prev,
        [eventId]: data as UserFeedback
      }));

      return data;
    } catch (error) {
      console.error("Error submitting feedback:", error);
      throw error;
    }
  };

  // Track user interaction
  const trackInteraction = async (eventId: string, interactionType: 'view' | 'click' | 'share' | 'save') => {
    if (!user) return;

    try {
      await supabase
        .from("user_event_interactions")
        .insert({
          user_id: user.id,
          event_id: eventId,
          interaction_type: interactionType,
        });
    } catch (error) {
      console.error("Error tracking interaction:", error);
    }
  };

  // Remove feedback
  const removeFeedback = async (eventId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from("user_event_feedback")
        .delete()
        .eq("user_id", user.id)
        .eq("event_id", eventId);

      if (error) throw error;

      // Update local state
      setUserFeedback(prev => {
        const newState = { ...prev };
        delete newState[eventId];
        return newState;
      });
    } catch (error) {
      console.error("Error removing feedback:", error);
      throw error;
    }
  };

  // Get feedback for specific event
  const getFeedbackForEvent = (eventId: string) => {
    return userFeedback[eventId] || null;
  };

  // Get feedback statistics for an event
  const getFeedbackStats = async (eventId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_event_feedback")
        .select("feedback_type")
        .eq("event_id", eventId);

      if (error) throw error;

      const stats = (data || []).reduce((acc: any, feedback) => {
        acc[feedback.feedback_type] = (acc[feedback.feedback_type] || 0) + 1;
        return acc;
      }, {});

      return {
        thumbs_up: stats.thumbs_up || 0,
        thumbs_down: stats.thumbs_down || 0,
        interested: stats.interested || 0,
        not_interested: stats.not_interested || 0,
      };
    } catch (error) {
      console.error("Error fetching feedback stats:", error);
      return { thumbs_up: 0, thumbs_down: 0, interested: 0, not_interested: 0 };
    }
  };

  useEffect(() => {
    if (user) {
      fetchUserFeedback();
    } else {
      setUserFeedback({});
    }
  }, [user]);

  return {
    userFeedback,
    isLoading,
    submitFeedback,
    removeFeedback,
    trackInteraction,
    getFeedbackForEvent,
    getFeedbackStats,
    refetch: fetchUserFeedback,
  };
}
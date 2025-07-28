import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

type Rating = Database["public"]["Tables"]["user_ratings"]["Row"];
type RatingInsert = Database["public"]["Tables"]["user_ratings"]["Insert"];
type RatingUpdate = Database["public"]["Tables"]["user_ratings"]["Update"];
type ContentType = Database["public"]["Enums"]["content_type"];
type RatingValue = Database["public"]["Enums"]["rating_value"];
type RatingAggregate = Database["public"]["Tables"]["content_rating_aggregates"]["Row"];
type UserReputation = Database["public"]["Tables"]["user_reputation"]["Row"];

interface RatingsState {
  ratings: Rating[];
  userRating: Rating | null;
  aggregate: RatingAggregate | null;
  isLoading: boolean;
  error: string | null;
}

interface UseRatingsProps {
  contentType: ContentType;
  contentId: string;
}

export function useRatings({ contentType, contentId }: UseRatingsProps) {
  const [state, setState] = useState<RatingsState>({
    ratings: [],
    userRating: null,
    aggregate: null,
    isLoading: true,
    error: null,
  });

  const { user } = useAuth();
  const { toast } = useToast();

  const fetchRatings = async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      // Fetch all ratings for this content
      const { data: ratings, error: ratingsError } = await supabase
        .from("user_ratings")
        .select(`
          *,
          profiles:user_id (
            first_name,
            last_name,
            user_role
          )
        `)
        .eq("content_type", contentType)
        .eq("content_id", contentId)
        .order("created_at", { ascending: false });

      if (ratingsError) throw ratingsError;

      // Fetch user's rating if authenticated
      let userRating = null;
      if (user) {
        const userRatingData = ratings?.find(r => r.user_id === user.id);
        userRating = userRatingData || null;
      }

      // Fetch aggregate data
      const { data: aggregate, error: aggregateError } = await supabase
        .from("content_rating_aggregates")
        .select("*")
        .eq("content_type", contentType)
        .eq("content_id", contentId)
        .single();

      if (aggregateError && aggregateError.code !== 'PGRST116') {
        throw aggregateError;
      }

      setState({
        ratings: ratings || [],
        userRating,
        aggregate: aggregate || null,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error("Error fetching ratings:", error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to fetch ratings",
      }));
    }
  };

  const submitRating = async (rating: RatingValue, reviewText?: string) => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to submit a rating",
        variant: "destructive",
      });
      return false;
    }

    try {
      const ratingData: RatingInsert = {
        user_id: user.id,
        content_type: contentType,
        content_id: contentId,
        rating,
        review_text: reviewText,
      };

      const { data, error } = await supabase
        .from("user_ratings")
        .upsert(ratingData, {
          onConflict: "user_id,content_type,content_id"
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Rating Submitted",
        description: "Thank you for your feedback!",
      });

      // Refresh ratings to get updated data
      await fetchRatings();
      return true;
    } catch (error) {
      console.error("Error submitting rating:", error);
      toast({
        title: "Error",
        description: "Failed to submit rating. Please try again.",
        variant: "destructive",
      });
      return false;
    }
  };

  const deleteRating = async () => {
    if (!user || !state.userRating) {
      return false;
    }

    try {
      const { error } = await supabase
        .from("user_ratings")
        .delete()
        .eq("id", state.userRating.id);

      if (error) throw error;

      toast({
        title: "Rating Deleted",
        description: "Your rating has been removed",
      });

      await fetchRatings();
      return true;
    } catch (error) {
      console.error("Error deleting rating:", error);
      toast({
        title: "Error",
        description: "Failed to delete rating. Please try again.",
        variant: "destructive",
      });
      return false;
    }
  };

  const voteHelpful = async (ratingId: string, isHelpful: boolean) => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to vote on reviews",
        variant: "destructive",
      });
      return false;
    }

    try {
      const { error } = await supabase
        .from("rating_helpful_votes")
        .upsert({
          rating_id: ratingId,
          user_id: user.id,
          is_helpful: isHelpful,
        }, {
          onConflict: "rating_id,user_id"
        });

      if (error) throw error;

      toast({
        title: "Vote Recorded",
        description: "Thank you for your feedback!",
      });

      await fetchRatings();
      return true;
    } catch (error) {
      console.error("Error voting:", error);
      toast({
        title: "Error",
        description: "Failed to record vote. Please try again.",
        variant: "destructive",
      });
      return false;
    }
  };

  useEffect(() => {
    fetchRatings();
  }, [contentType, contentId, user]);

  return {
    ...state,
    submitRating,
    deleteRating,
    voteHelpful,
    refetch: fetchRatings,
  };
}

export function useUserReputation(userId?: string) {
  const [reputation, setReputation] = useState<UserReputation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setReputation(null);
      setIsLoading(false);
      return;
    }

    const fetchReputation = async () => {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from("user_reputation")
          .select("*")
          .eq("user_id", userId)
          .single();

        if (error && error.code !== 'PGRST116') {
          throw error;
        }

        setReputation(data || null);
        setError(null);
      } catch (err) {
        console.error("Error fetching user reputation:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch reputation");
      } finally {
        setIsLoading(false);
      }
    };

    fetchReputation();
  }, [userId]);

  return { reputation, isLoading, error };
}
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/lib/logger";
import { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

const logger = createLogger("useRatings");

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

      // WEB-AUTO-009: hide reviews that haven't cleared moderation (pending /
      // flagged / rejected). Unknown/null status is treated as visible so older
      // rows are unaffected. The author still sees their own review via
      // `userRating` (derived from the full set above).
      const HIDDEN = new Set(["pending", "flagged", "rejected"]);
      const visibleRatings = (ratings || []).filter(
        (r) => !HIDDEN.has((r as { moderation_status?: string }).moderation_status ?? "approved"),
      );

      setState({
        ratings: visibleRatings,
        userRating,
        aggregate: aggregate || null,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      logger.error('fetchRatings', 'Error fetching ratings', { error });
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to fetch ratings",
      }));
    }
  };

  const submitRating = async (rating: RatingValue, reviewText?: string, photoUrls?: string[]) => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to submit a rating",
        variant: "destructive",
      });
      return false;
    }

    try {
      // WEB-AUTO-009: a review with text is held hidden (moderation_status
      // 'pending') until moderate-content scores it. A bare star rating with no
      // review body carries no text to moderate, so it stays visible.
      const hasText = !!reviewText && reviewText.trim().length > 0;
      const ratingData: RatingInsert = {
        user_id: user.id,
        content_type: contentType,
        content_id: contentId,
        rating,
        review_text: reviewText,
        photo_urls: photoUrls ?? [],
        moderation_status: hasText ? "pending" : "approved",
      };

      const { data, error } = await supabase
        .from("user_ratings")
        .upsert(ratingData, {
          onConflict: "user_id,content_type,content_id"
        })
        .select()
        .single();

      if (error) throw error;

      // Score the review text (toxicity / spam) before it goes public. Awaited
      // so we can give the author an honest, polite verdict; fails OPEN (treat
      // as submitted) so a moderation outage never blocks feedback — the nightly
      // sweep re-moderates anything left pending.
      let verdict: string | null = null;
      if (hasText && data?.id) {
        try {
          const { data: modRes } = await supabase.functions.invoke("content/moderate-content", {
            body: { contentType: "review", contentId: data.id },
          });
          verdict = (modRes as { decision?: string } | null)?.decision ?? null;
        } catch {
          verdict = null; // fail open
        }
      }

      if (verdict === "rejected") {
        toast({
          title: "Review not posted",
          description:
            "Your review couldn't be published because it may not meet our community guidelines.",
          variant: "destructive",
        });
      } else if (verdict === "flagged") {
        toast({
          title: "Review submitted",
          description: "Thanks! Your review is being reviewed and will appear shortly.",
        });
      } else {
        toast({
          title: "Rating Submitted",
          description: "Thank you for your feedback!",
        });
      }

      // Refresh ratings to get updated data
      await fetchRatings();
      return true;
    } catch (error) {
      logger.error('submitRating', 'Error submitting rating', { error });
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
      logger.error('deleteRating', 'Error deleting rating', { error });
      toast({
        title: "Error",
        description: "Failed to delete rating. Please try again.",
        variant: "destructive",
      });
      return false;
    }
  };

  const reportReview = async (ratingId: string) => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to report a review",
        variant: "destructive",
      });
      return false;
    }
    try {
      const { error } = await supabase.rpc("report_review", { p_rating_id: ratingId });
      if (error) throw error;
      toast({
        title: "Report submitted",
        description: "Thanks — our team will take a look.",
      });
      return true;
    } catch (error) {
      logger.error('reportReview', 'Error reporting review', { error });
      toast({
        title: "Error",
        description: "Couldn't submit your report. Please try again.",
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
      logger.error('voteHelpful', 'Error voting', { error });
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
    reportReview,
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
        logger.error('useUserReputation', 'Error fetching user reputation', { error: err });
        setError(err instanceof Error ? err.message : "Failed to fetch reputation");
      } finally {
        setIsLoading(false);
      }
    };

    fetchReputation();
  }, [userId]);

  return { reputation, isLoading, error };
}
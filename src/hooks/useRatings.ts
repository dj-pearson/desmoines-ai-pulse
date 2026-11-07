import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/lib/logger";
import { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

const logger = createLogger("useRatings");

/** Every column user_ratings has. */
const USER_RATINGS_COLUMNS =
  "id, content_type, content_id, user_id, rating, review_text, photo_urls, is_verified, moderation_status, created_at, updated_at";

/** Every column content_rating_aggregates has (types.ts, 2026-11-01). */
const AGGREGATE_COLUMNS =
  "id, content_type, content_id, average_rating, weighted_average, total_ratings, rating_distribution, last_updated";

/**
 * Newest reviews loaded per piece of content. The list was unbounded, so a
 * popular restaurant shipped every review it ever got on each view. The
 * summary card reads its totals from the aggregate row, not from this list.
 */
export const RATINGS_LIMIT = 50;

/** WEB-AUTO-009: reviews that have not cleared moderation stay hidden. */
const HIDDEN_STATUSES = ["pending", "flagged", "rejected"] as const;

const RATINGS_STALE_TIME = 5 * 60 * 1000;

type Rating = Database["public"]["Tables"]["user_ratings"]["Row"];
type RatingInsert = Database["public"]["Tables"]["user_ratings"]["Insert"];
type ContentType = Database["public"]["Enums"]["content_type"];
type RatingValue = Database["public"]["Enums"]["rating_value"];
type RatingAggregate = Database["public"]["Tables"]["content_rating_aggregates"]["Row"];
type UserReputation = Database["public"]["Tables"]["user_reputation"]["Row"];

export interface RaterProfile {
  first_name: string | null;
  last_name: string | null;
  user_role: string | null;
}

export type RatingWithProfile = Rating & { profiles: RaterProfile | null };

/** The two reputation fields a review card shows. */
export type ReviewerReputation = Pick<UserReputation, "level" | "points">;

/**
 * The columns UserReputationDisplay reads (user_reputation in types.ts,
 * 2026-11-02). The row has twelve more; select("*") pulled them all.
 */
const REPUTATION_SUMMARY_COLUMNS = "user_id, level, points, total_ratings, helpful_votes";
export type ReputationSummary = Pick<
  UserReputation,
  "user_id" | "level" | "points" | "total_ratings" | "helpful_votes"
>;

interface RatingsData {
  ratings: RatingWithProfile[];
  aggregate: RatingAggregate | null;
  /** Keyed by user_id; a reviewer with no reputation row is absent. */
  reputations: Record<string, ReviewerReputation>;
}

interface UseRatingsProps {
  contentType: ContentType;
  contentId: string;
}

/**
 * Prefix of every ratings query for one piece of content. Invalidating it
 * refreshes the public list and the signed-in user's own row together.
 */
export function ratingsQueryKey(contentType: ContentType, contentId: string) {
  return ["ratings", contentType, contentId] as const;
}

async function fetchRatingsData(contentType: ContentType, contentId: string): Promise<RatingsData> {
  // The list and the aggregate do not depend on each other, so they go out
  // together.
  //
  // NO EMBED. `profiles:user_id(...)` reads like a join to profiles and is
  // not one: PostgREST takes `user_id` as the relation to embed, and it is
  // an ordinary column with no foreign key, so the answer was PGRST200 and
  // the WHOLE query failed - ratings have never loaded for any content
  // (WEB-QA-034). The reviewer names come from a keyed lookup below.
  const [ratingsRes, aggregateRes] = await Promise.all([
    supabase
      .from("user_ratings")
      .select(USER_RATINGS_COLUMNS)
      .eq("content_type", contentType)
      .eq("content_id", contentId)
      .or(`moderation_status.is.null,moderation_status.not.in.(${HIDDEN_STATUSES.join(",")})`)
      .order("created_at", { ascending: false })
      .limit(RATINGS_LIMIT),
    supabase
      .from("content_rating_aggregates")
      .select(AGGREGATE_COLUMNS)
      .eq("content_type", contentType)
      .eq("content_id", contentId)
      .maybeSingle(),
  ]);

  if (ratingsRes.error) throw ratingsRes.error;
  if (aggregateRes.error) throw aggregateRes.error;

  // The server filter above is the real one. This repeats it so a backend
  // that ignores filters (the smoke lane's fixture backend) still hides them.
  const hidden = new Set<string>(HIDDEN_STATUSES);
  const rows = (ratingsRes.data ?? []).filter((r) => !hidden.has(r.moderation_status ?? "approved"));

  // Keyed on profiles.USER_ID; profiles.id is the profile row's own PK and
  // matching an auth id against it returns zero rows silently
  // (WEB-SEC-023).
  const raterIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const raters = new Map<string, RaterProfile>();
  const reputations: Record<string, ReviewerReputation> = {};

  if (raterIds.length > 0) {
    // Names and reputations for every reviewer in two requests. Each review
    // card used to fetch its own user_reputation row, so 20 reviews cost 20
    // more requests. Both lookups are best-effort by design: a failure costs
    // the names or the badges and the ratings still render, so it is logged
    // rather than thrown.
    const [profilesRes, reputationRes] = await Promise.all([
      supabase.from("profiles").select("user_id, first_name, last_name, user_role").in("user_id", raterIds),
      supabase.from("user_reputation").select("user_id, level, points").in("user_id", raterIds),
    ]);
    if (profilesRes.error) {
      logger.warn("fetchRatings", "Rater lookup failed", { error: profilesRes.error.message });
    }
    for (const p of profilesRes.data ?? []) {
      if (p.user_id) raters.set(p.user_id, { first_name: p.first_name, last_name: p.last_name, user_role: p.user_role });
    }
    if (reputationRes.error) {
      logger.warn("fetchRatings", "Reputation lookup failed", { error: reputationRes.error.message });
    }
    for (const r of reputationRes.data ?? []) {
      if (r.user_id) reputations[r.user_id] = { level: r.level, points: r.points };
    }
  }

  return {
    ratings: rows.map((r) => ({ ...r, profiles: (r.user_id && raters.get(r.user_id)) || null })),
    aggregate: aggregateRes.data ?? null,
    reputations,
  };
}

/**
 * The signed-in user's own row, whatever its moderation status: the author
 * still sees (and can edit) a review held for moderation, and their review
 * may be older than the newest RATINGS_LIMIT.
 */
async function fetchOwnRating(contentType: ContentType, contentId: string, userId: string): Promise<Rating | null> {
  const { data, error } = await supabase
    .from("user_ratings")
    .select(USER_RATINGS_COLUMNS)
    .eq("content_type", contentType)
    .eq("content_id", contentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

const EMPTY_RATINGS: RatingWithProfile[] = [];
const EMPTY_REPUTATIONS: Record<string, ReviewerReputation> = {};

export function useRatings({ contentType, contentId }: UseRatingsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Keyed on the id, not the user object: AuthContext hands out a new object
  // on every TOKEN_REFRESHED, and the effect this replaced refetched on each.
  const userId = user?.id ?? null;

  const listQuery = useQuery({
    queryKey: [...ratingsQueryKey(contentType, contentId), "list"],
    queryFn: () => fetchRatingsData(contentType, contentId),
    enabled: !!contentId,
    staleTime: RATINGS_STALE_TIME,
  });

  const ownQuery = useQuery({
    queryKey: [...ratingsQueryKey(contentType, contentId), "own", userId],
    queryFn: () => fetchOwnRating(contentType, contentId, userId as string),
    enabled: !!contentId && !!userId,
    staleTime: RATINGS_STALE_TIME,
  });

  const userRating = userId ? (ownQuery.data ?? null) : null;
  const queryError = listQuery.error ?? ownQuery.error ?? null;

  useEffect(() => {
    if (queryError) logger.error("fetchRatings", "Error fetching ratings", { error: queryError });
  }, [queryError]);

  // Re-runs every query under this content's prefix, so a mutation refreshes
  // the list, the aggregate, the reputations and the user's own row at once.
  const refetch = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ratingsQueryKey(contentType, contentId) }),
    [queryClient, contentType, contentId],
  );

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
        .select("id")
        .single();

      if (error) throw error;

      // Score the review text (toxicity / spam) before it goes public. Awaited
      // so we can give the author an honest, polite verdict; fails OPEN (treat
      // as submitted) so a moderation outage never blocks feedback — the nightly
      // sweep re-moderates anything left pending.
      let verdict: string | null = null;
      if (hasText && data?.id) {
        try {
          const { data: modRes } = await supabase.functions.invoke("moderate-content", {
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
      await refetch();
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
    if (!user || !userRating) {
      return false;
    }

    try {
      const { error } = await supabase
        .from("user_ratings")
        .delete()
        .eq("id", userRating.id);

      if (error) throw error;

      toast({
        title: "Rating Deleted",
        description: "Your rating has been removed",
      });

      await refetch();
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

      await refetch();
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

  return {
    ratings: listQuery.data?.ratings ?? EMPTY_RATINGS,
    userRating,
    aggregate: listQuery.data?.aggregate ?? null,
    reputations: listQuery.data?.reputations ?? EMPTY_REPUTATIONS,
    // v5 isLoading is "pending and fetching", so a disabled own-row query
    // (signed out) never holds the spinner up.
    isLoading: listQuery.isLoading || ownQuery.isLoading,
    error: queryError ? (queryError instanceof Error ? queryError.message : "Failed to fetch ratings") : null,
    submitRating,
    deleteRating,
    voteHelpful,
    reportReview,
    refetch,
  };
}

/**
 * One user's reputation row, for a profile view (UserReputationDisplay).
 * Review lists get reputations batched from useRatings instead.
 */
export function useUserReputation(userId?: string) {
  const [reputation, setReputation] = useState<ReputationSummary | null>(null);
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
          .select(REPUTATION_SUMMARY_COLUMNS)
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

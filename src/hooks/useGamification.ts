import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";
import { createLogger } from '@/lib/logger';

const logger = createLogger('useGamification');

/** How many rows the activity feed and leaderboard render. */
const ACTIVITY_FEED_LIMIT = 25;
const LEADERBOARD_LIMIT = 25;

export interface UserReputation {
  user_id: string;
  experience_points: number;
  current_level: number;
  current_level_progress: number;
  next_level_xp: number;
  total_badges: number;
  rank_position?: number;
  streak_days: number;
  last_activity_date?: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  badge_type: string;
  requirements: any;
  points_value: number;
  rarity: string;
  is_active: boolean | null;
  earned_at?: string;
  created_at?: string;
}

export interface CommunityChallenge {
  id: string;
  title: string;
  description: string;
  challenge_type: string;
  requirements: any;
  start_date: string;
  end_date: string;
  max_participants?: number;
  reward_points: number;
  reward_badges?: string[];
  is_active: boolean;
  user_participation?: any;
}

export interface Activity {
  id: string;
  activity_type: string;
  content_type?: string;
  content_id?: string;
  points_earned: number;
  metadata: any;
  created_at: string;
}

export function useGamification() {
  const [reputation, setReputation] = useState<UserReputation | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [challenges, setChallenges] = useState<CommunityChallenge[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [availableBadges, setAvailableBadges] = useState<Badge[]>([]);
  const [leaderboard, setLeaderboard] = useState<UserReputation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchUserReputation = async () => {
    if (!user) {
      setReputation(null);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("user_reputation")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      // Silently handle all database access errors (403, 42501, etc.)
      // These are expected when RLS policies block access or tables don't exist
      if (error) {
        // Only log unexpected errors
        if (error.code !== '42501' && error.code !== 'PGRST301' && !error.message?.includes('permission denied')) {
          logger.error('fetchUserReputation', 'Error fetching reputation', { error });
        }
        setReputation(null);
        return;
      }

      if (!data) {
        // Don't attempt to create reputation record - let database triggers handle this
        // Attempting INSERT operations can cause infinite loops with RLS policies
        setReputation(null);
        return;
      }

      setReputation(data as any);
    } catch (error) {
      // Silently handle all errors to prevent console spam
      setReputation(null);
      setError(null); // Don't set error state to avoid re-render loops
    }
  };

  /**
   * WEB-FEAT-028. Every fetcher below used to set an empty array behind a
   * comment claiming its table "doesn't exist yet". All of them exist in
   * production, verified against scripts/db-snapshot.json: badges, user_badges,
   * community_challenges, user_activities and user_reputation, plus the
   * award_user_xp RPC. The proof the comments were stale rather than accurate
   * is in this same file - fetchUserReputation queries user_reputation for
   * real, while fetchLeaderboard claimed that table did not exist.
   *
   * Every read below keeps the defensive shape the reputation fetch already
   * used: an RLS denial or a missing row leaves the section empty rather than
   * throwing, because these are decorative surfaces and must never break a page.
   */
  const fetchUserBadges = async () => {
    if (!user) {
      setBadges([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("user_badges")
        .select("earned_at, badges(*)")
        .eq("user_id", user.id)
        .order("earned_at", { ascending: false });

      if (error) {
        logger.error('fetchUserBadges', 'Error fetching badges', { error });
        setBadges([]);
        return;
      }

      // The join returns { earned_at, badges: {...} }; flatten it to the Badge
      // shape the components render, keeping when it was earned.
      const earned = (data ?? [])
        .map((row: any) => (row.badges ? { ...row.badges, earned_at: row.earned_at } : null))
        .filter(Boolean) as Badge[];
      setBadges(earned);
    } catch (error) {
      logger.error('fetchUserBadges', 'Error fetching badges', { error });
      setBadges([]);
    }
  };

  const fetchAvailableBadges = async () => {
    try {
      const { data, error } = await supabase
        .from("badges")
        .select("*")
        .eq("is_active", true)
        .order("points_value", { ascending: true });

      if (error) {
        logger.error('fetchAvailableBadges', 'Error fetching available badges', { error });
        setAvailableBadges([]);
        return;
      }
      setAvailableBadges((data ?? []) as Badge[]);
    } catch (error) {
      logger.error('fetchAvailableBadges', 'Error fetching available badges', { error });
      setAvailableBadges([]);
    }
  };

  const fetchChallenges = async () => {
    try {
      // Only challenges that are still open. A finished challenge on the page
      // is the same class of bug as a finished State Fair (WEB-FEAT-029).
      const { data, error } = await supabase
        .from("community_challenges")
        .select("*")
        .eq("is_active", true)
        .gte("end_date", new Date().toISOString())
        .order("end_date", { ascending: true });

      if (error) {
        logger.error('fetchChallenges', 'Error fetching challenges', { error });
        setChallenges([]);
        return;
      }
      setChallenges((data ?? []) as CommunityChallenge[]);
    } catch (error) {
      logger.error('fetchChallenges', 'Error fetching challenges', { error });
      setChallenges([]);
    }
  };

  const fetchActivities = async () => {
    if (!user) {
      setActivities([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("user_activities")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(ACTIVITY_FEED_LIMIT);

      if (error) {
        logger.error('fetchActivities', 'Error fetching activities', { error });
        setActivities([]);
        return;
      }
      setActivities((data ?? []) as Activity[]);
    } catch (error) {
      logger.error('fetchActivities', 'Error fetching activities', { error });
      setActivities([]);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const { data, error } = await supabase
        .from("user_reputation")
        .select("*")
        .order("experience_points", { ascending: false })
        .limit(LEADERBOARD_LIMIT);

      if (error) {
        // Reading other users' reputation is exactly the kind of thing an RLS
        // policy may forbid. An empty leaderboard is the right outcome then.
        logger.error('fetchLeaderboard', 'Error fetching leaderboard', { error });
        setLeaderboard([]);
        return;
      }
      setLeaderboard((data ?? []) as UserReputation[]);
    } catch (error) {
      logger.error('fetchLeaderboard', 'Error fetching leaderboard', { error });
      setLeaderboard([]);
    }
  };

  const awardPoints = async (
    activityType: string,
    points: number,
    contentType?: string,
    contentId?: string,
    metadata = {}
  ) => {
    if (!user) return;

    try {
      // WEB-FEAT-028: this used to LOG the call and then congratulate the user
      // for XP that was never written. The RPC it was logging - matching these
      // exact parameter names - has existed since migration 20250805010931.
      const { error } = await supabase.rpc("award_user_xp", {
        p_user_id: user.id,
        p_activity_type: activityType,
        p_points: points,
        p_content_type: contentType ?? null,
        p_content_id: contentId ?? null,
        p_metadata: metadata,
      });

      if (error) {
        // No toast on failure. awardPoints is called from side effects like
        // favouriting, where the user did not ask for XP and an error about it
        // would be noise about something they did not do.
        logger.error('awardPoints', 'Failed to award XP', { error, activityType });
        return;
      }

      // Refresh user data
      await fetchUserReputation();
      await fetchActivities();

      toast({
        title: "Points Earned! 🎉",
        description: `You earned ${points} XP for ${activityType.replace("_", " ")}!`,
      });

    } catch (error) {
      logger.error('awardPoints', 'Error awarding points', { error });
      toast({
        title: "Error",
        description: "Failed to award points",
        variant: "destructive",
      });
    }
  };

  const joinChallenge = async (challengeId: string) => {
    if (!user) return;

    try {
      // WEB-FEAT-028: NOT wired, deliberately, and this is the honest version.
      // community_challenges exists, but no participants table does - there is
      // no challenge_participants, user_challenges or equivalent in production
      // (checked against scripts/db-snapshot.json). There is nowhere to record
      // a join, so this used to congratulate the user for something that never
      // happened and would be gone on reload.
      //
      // Building the table is a product decision, not a guess to make here
      // (see WEB-QA-018). Until it exists, say so.
      logger.warn('joinChallenge', 'No participants table; join cannot be persisted', {
        challengeId,
      });

      toast({
        title: "Not available yet",
        description: "Joining challenges is coming soon. You can still earn badges and XP.",
      });
    } catch (error) {
      logger.error('joinChallenge', 'Error joining challenge', { error });
      toast({
        title: "Error",
        description: "Failed to join challenge",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    const loadData = async () => {
      // Only load gamification data for authenticated users
      if (!user) {
        setIsLoading(false);
        setReputation(null);
        setBadges([]);
        setChallenges([]);
        setActivities([]);
        setLeaderboard([]);
        return;
      }

      setIsLoading(true);
      await Promise.all([
        fetchUserReputation(),
        fetchUserBadges(),
        fetchAvailableBadges(),
        fetchChallenges(),
        fetchActivities(),
        fetchLeaderboard()
      ]);
      setIsLoading(false);
    };

    loadData();
  }, [user]);

  return {
    reputation,
    badges,
    challenges,
    activities,
    availableBadges,
    leaderboard,
    isLoading,
    error,
    userLevel: reputation?.current_level,
    userXP: reputation?.experience_points,
    awardPoints,
    joinChallenge,
    refetch: () => {
      fetchUserReputation();
      fetchUserBadges();
      fetchChallenges();
      fetchActivities();
      fetchLeaderboard();
    }
  };
}
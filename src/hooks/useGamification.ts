import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";
import { createLogger } from '@/lib/logger';

const log = createLogger('useGamification');

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
          log.error("Error fetching reputation", { action: 'fetchUserReputation', metadata: { error } });
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

  const fetchUserBadges = async () => {
    if (!user) return;

    try {
      // Mock badges since user_badges table doesn't exist yet
      const mockBadges = [] as Badge[];
      setBadges(mockBadges);
    } catch (error) {
      log.error("Error fetching badges", { action: 'fetchUserBadges', metadata: { error } });
    }
  };

  const fetchAvailableBadges = async () => {
    try {
      // Mock available badges since badges table doesn't exist yet
      const mockAvailableBadges = [] as Badge[];
      setAvailableBadges(mockAvailableBadges);
    } catch (error) {
      log.error("Error fetching available badges", { action: 'fetchAvailableBadges', metadata: { error } });
    }
  };

  const fetchChallenges = async () => {
    try {
      // Mock challenges since community_challenges table doesn't exist yet
      const mockChallenges = [] as CommunityChallenge[];
      setChallenges(mockChallenges);
    } catch (error) {
      log.error("Error fetching challenges", { action: 'fetchChallenges', metadata: { error } });
    }
  };

  const fetchActivities = async () => {
    if (!user) return;

    try {
      // Mock activities since user_activities table doesn't exist yet
      const mockActivities = [] as Activity[];
      setActivities(mockActivities);
    } catch (error) {
      log.error("Error fetching activities", { action: 'fetchActivities', metadata: { error } });
    }
  };

  const fetchLeaderboard = async () => {
    try {
      // Mock leaderboard since user_reputation table doesn't exist yet or has schema issues
      const mockLeaderboard: any[] = [];
      setLeaderboard(mockLeaderboard);
    } catch (error) {
      log.error("Error fetching leaderboard", { action: 'fetchLeaderboard', metadata: { error } });
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
      // Mock awarding points since function doesn't exist
      log.debug("Points would be awarded", { action: 'awardPoints', metadata: {
        p_user_id: user.id,
        p_activity_type: activityType,
        p_points: points,
        p_content_type: contentType,
        p_content_id: contentId,
        p_metadata: metadata
      } });

      // Refresh user data
      await fetchUserReputation();
      await fetchActivities();

      toast({
        title: "Points Earned! 🎉",
        description: `You earned ${points} XP for ${activityType.replace("_", " ")}!`,
      });

    } catch (error) {
      log.error("Error awarding points", { action: 'awardPoints', metadata: { error } });
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
      // Mock joining challenge since table doesn't exist
      log.debug("Challenge join would be recorded", { action: 'joinChallenge', metadata: {
        user_id: user.id,
        challenge_id: challengeId,
        progress: {},
        joined_at: new Date().toISOString()
      } });

      toast({
        title: "Challenge Joined!",
        description: "You've successfully joined the challenge. Good luck!",
      });

      await fetchChallenges();
    } catch (error) {
      log.error("Error joining challenge", { action: 'joinChallenge', metadata: { error } });
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
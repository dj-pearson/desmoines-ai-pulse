import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useToast } from "./use-toast";

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
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("user_reputation")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        // Create initial reputation record
        const { data: newRep, error: createError } = await supabase
          .from("user_reputation")
          .insert({
            user_id: user.id,
            experience_points: 0,
            current_level: 1,
            current_level_progress: 0,
            next_level_xp: 100,
            total_badges: 0,
            streak_days: 0
          })
          .select()
          .single();

        if (createError) throw createError;
        setReputation(newRep as any);
      } else {
        setReputation(data as any);
      }
    } catch (error) {
      console.error("Error fetching reputation:", error);
      setError(error instanceof Error ? error.message : "Failed to fetch reputation");
    }
  };

  const fetchUserBadges = async () => {
    if (!user) return;

    try {
      // Mock badges since user_badges table doesn't exist yet
      const mockBadges = [] as Badge[];
      setBadges(mockBadges);
    } catch (error) {
      console.error("Error fetching badges:", error);
    }
  };

  const fetchAvailableBadges = async () => {
    try {
      // Mock available badges since badges table doesn't exist yet
      const mockAvailableBadges = [] as Badge[];
      setAvailableBadges(mockAvailableBadges);
    } catch (error) {
      console.error("Error fetching available badges:", error);
    }
  };

  const fetchChallenges = async () => {
    try {
      // Mock challenges since community_challenges table doesn't exist yet
      const mockChallenges = [] as CommunityChallenge[];
      setChallenges(mockChallenges);
    } catch (error) {
      console.error("Error fetching challenges:", error);
    }
  };

  const fetchActivities = async () => {
    if (!user) return;

    try {
      // Mock activities since user_activities table doesn't exist yet
      const mockActivities = [] as Activity[];
      setActivities(mockActivities);
    } catch (error) {
      console.error("Error fetching activities:", error);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const { data, error } = await supabase
        .from("user_reputation")
        .select(`
          *,
          profiles!inner(first_name, last_name)
        `)
        .order("experience_points", { ascending: false })
        .limit(10);

      if (error) throw error;
      setLeaderboard(data as any || []);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
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
      console.log("Points would be awarded:", {
        p_user_id: user.id,
        p_activity_type: activityType,
        p_points: points,
        p_content_type: contentType,
        p_content_id: contentId,
        p_metadata: metadata
      });

      // Refresh user data
      await fetchUserReputation();
      await fetchActivities();

      toast({
        title: "Points Earned! 🎉",
        description: `You earned ${points} XP for ${activityType.replace("_", " ")}!`,
      });

    } catch (error) {
      console.error("Error awarding points:", error);
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
      console.log("Challenge join would be recorded:", {
        user_id: user.id,
        challenge_id: challengeId,
        progress: {},
        joined_at: new Date().toISOString()
      });

      if (error) throw error;

      toast({
        title: "Challenge Joined!",
        description: "You've successfully joined the challenge. Good luck!",
      });

      await fetchChallenges();
    } catch (error) {
      console.error("Error joining challenge:", error);
      toast({
        title: "Error",
        description: "Failed to join challenge",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    const loadData = async () => {
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
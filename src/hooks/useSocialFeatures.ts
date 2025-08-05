import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface Friend {
  id: string;
  friend_id: string;
  status: string;
  created_at: string;
  friend_profile?: {
    first_name?: string;
    last_name?: string;
    email?: string;
  };
}

interface FriendGroup {
  id: string;
  name: string;
  description?: string;
  created_by: string;
  is_public: boolean;
  created_at: string;
  member_count?: number;
}

interface EventAttendance {
  id: string;
  event_id: string;
  user_id: string;
  status: 'interested' | 'going' | 'maybe' | 'not_going';
  created_at: string;
}

interface UserGeneratedContent {
  tips: Array<{
    id: string;
    tip_text: string;
    tip_category: string;
    helpful_votes: number;
    created_at: string;
    user_profile?: { first_name?: string; last_name?: string; };
  }>;
  reviews: Array<{
    id: string;
    review_text: string;
    rating: number;
    attended: boolean;
    helpful_votes: number;
    created_at: string;
    user_profile?: { first_name?: string; last_name?: string; };
  }>;
  photos: Array<{
    id: string;
    photo_url: string;
    caption?: string;
    helpful_votes: number;
    created_at: string;
    user_profile?: { first_name?: string; last_name?: string; };
  }>;
}

export function useSocialFeatures() {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendGroups, setFriendGroups] = useState<FriendGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch user's friends
  const fetchFriends = async () => {
    if (!user) return;
    
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('user_friends')
        .select(`
          id,
          friend_id,
          status,
          created_at,
          accepted_at,
          user_id
        `)
        .eq('user_id', user.id)
        .eq('status', 'accepted');

      if (error) throw error;
      
      // Then fetch profiles separately to avoid relation issues
      const friendIds = data?.map(f => f.friend_id) || [];
      if (friendIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name, email')
          .in('user_id', friendIds);
        
        const friendsWithProfiles = data?.map(friend => ({
          ...friend,
          friend_profile: profiles?.find(p => p.user_id === friend.friend_id)
        })) || [];
        
        setFriends(friendsWithProfiles as Friend[]);
      } else {
        setFriends([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch friends');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch user's friend groups
  const fetchFriendGroups = async () => {
    if (!user) return;
    
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('friend_groups')
        .select('*')
        .or(`created_by.eq.${user.id},friend_group_members.user_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Get member counts separately
      const groupsWithCounts = await Promise.all(
        (data || []).map(async (group) => {
          const { count } = await supabase
            .from('friend_group_members')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', group.id);
          
          return {
            ...group,
            member_count: count || 0
          };
        })
      );
      
      setFriendGroups(groupsWithCounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch friend groups');
    } finally {
      setIsLoading(false);
    }
  };

  // Send friend request
  const sendFriendRequest = async (friendEmail: string) => {
    if (!user) throw new Error('Must be logged in to send friend requests');
    
    try {
      // First find the user by email
      const { data: friendProfile, error: profileError } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('email', friendEmail)
        .single();

      if (profileError || !friendProfile) {
        throw new Error('User not found with that email address');
      }

      const { error } = await supabase
        .from('user_friends')
        .insert({
          user_id: user.id,
          friend_id: friendProfile.user_id
        });

      if (error) throw error;
      await fetchFriends();
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to send friend request');
    }
  };

  // Accept friend request
  const acceptFriendRequest = async (friendshipId: string) => {
    try {
      const { error } = await supabase
        .from('user_friends')
        .update({ 
          status: 'accepted',
          accepted_at: new Date().toISOString()
        })
        .eq('id', friendshipId);

      if (error) throw error;
      await fetchFriends();
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to accept friend request');
    }
  };

  // Create friend group
  const createFriendGroup = async (name: string, description?: string, isPublic = false) => {
    if (!user) throw new Error('Must be logged in to create groups');
    
    try {
      const { data, error } = await supabase
        .from('friend_groups')
        .insert({
          name,
          description,
          created_by: user.id,
          is_public: isPublic
        })
        .select()
        .single();

      if (error) throw error;

      // Add creator as admin member
      await supabase
        .from('friend_group_members')
        .insert({
          group_id: data.id,
          user_id: user.id,
          role: 'admin'
        });

      await fetchFriendGroups();
      return data;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to create friend group');
    }
  };

  // Update event attendance
  const updateEventAttendance = async (eventId: string, status: EventAttendance['status']) => {
    if (!user) throw new Error('Must be logged in to update attendance');
    
    try {
      const { error } = await supabase
        .from('event_attendance')
        .upsert({
          event_id: eventId,
          user_id: user.id,
          status
        });

      if (error) throw error;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to update attendance');
    }
  };

  // Get event attendance counts
  const getEventAttendance = async (eventId: string) => {
    try {
      const { data, error } = await supabase
        .from('event_attendance')
        .select('status')
        .eq('event_id', eventId);

      if (error) throw error;

      const counts = {
        going: 0,
        interested: 0,
        maybe: 0,
        total: data?.length || 0
      };

      data?.forEach(attendance => {
        if (attendance.status === 'going') counts.going++;
        else if (attendance.status === 'interested') counts.interested++;
        else if (attendance.status === 'maybe') counts.maybe++;
      });

      return counts;
    } catch (err) {
      console.error('Failed to get event attendance:', err);
      return { going: 0, interested: 0, maybe: 0, total: 0 };
    }
  };

  // Get user-generated content for event
  const getEventUGC = async (eventId: string): Promise<UserGeneratedContent> => {
    try {
      const [tipsResult, reviewsResult, photosResult] = await Promise.all([
        supabase
          .from('event_tips')
          .select('id, tip_text, tip_category, helpful_votes, created_at, user_id')
          .eq('event_id', eventId)
          .order('helpful_votes', { ascending: false }),
        
        supabase
          .from('event_reviews')
          .select('id, review_text, rating, attended, helpful_votes, created_at, user_id')
          .eq('event_id', eventId)
          .order('helpful_votes', { ascending: false }),
        
        supabase
          .from('event_photos')
          .select('id, photo_url, caption, helpful_votes, created_at, user_id')
          .eq('event_id', eventId)
          .eq('is_approved', true)
          .order('helpful_votes', { ascending: false })
      ]);

      // Get user profiles separately
      const allUserIds = [
        ...(tipsResult.data?.map(t => t.user_id) || []),
        ...(reviewsResult.data?.map(r => r.user_id) || []),
        ...(photosResult.data?.map(p => p.user_id) || [])
      ];
      
      const uniqueUserIds = [...new Set(allUserIds)];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .in('user_id', uniqueUserIds);

      const getProfile = (userId: string) => 
        profiles?.find(p => p.user_id === userId);

      return {
        tips: (tipsResult.data || []).map(tip => ({
          ...tip,
          user_profile: getProfile(tip.user_id)
        })),
        reviews: (reviewsResult.data || []).map(review => ({
          ...review,
          user_profile: getProfile(review.user_id)
        })),
        photos: (photosResult.data || []).map(photo => ({
          ...photo,
          user_profile: getProfile(photo.user_id)
        }))
      };
    } catch (err) {
      console.error('Failed to get event UGC:', err);
      return { tips: [], reviews: [], photos: [] };
    }
  };

  // Add tip to event
  const addEventTip = async (eventId: string, tipText: string, category: string) => {
    if (!user) throw new Error('Must be logged in to add tips');
    
    try {
      const { error } = await supabase
        .from('event_tips')
        .insert({
          event_id: eventId,
          user_id: user.id,
          tip_text: tipText,
          tip_category: category
        });

      if (error) throw error;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to add tip');
    }
  };

  // Add review to event
  const addEventReview = async (eventId: string, reviewText: string, rating: number, attended: boolean) => {
    if (!user) throw new Error('Must be logged in to add reviews');
    
    try {
      const { error } = await supabase
        .from('event_reviews')
        .upsert({
          event_id: eventId,
          user_id: user.id,
          review_text: reviewText,
          rating,
          attended
        });

      if (error) throw error;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to add review');
    }
  };

  // Vote on content helpfulness
  const voteOnContent = async (contentType: 'tip' | 'review' | 'photo', contentId: string, isHelpful: boolean) => {
    if (!user) throw new Error('Must be logged in to vote');
    
    try {
      const { error } = await supabase
        .from('content_helpful_votes')
        .upsert({
          user_id: user.id,
          content_type: contentType,
          content_id: contentId,
          is_helpful: isHelpful
        });

      if (error) throw error;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to vote');
    }
  };

  // Get friends near event
  const getFriendsNearEvent = async (eventLatitude: number, eventLongitude: number, radiusKm = 50) => {
    if (!user) return [];
    
    try {
      const { data, error } = await supabase
        .rpc('get_friends_near_event', {
          p_user_id: user.id,
          p_event_latitude: eventLatitude,
          p_event_longitude: eventLongitude,
          p_radius_km: radiusKm
        });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Failed to get friends near event:', err);
      return [];
    }
  };

  useEffect(() => {
    if (user) {
      fetchFriends();
      fetchFriendGroups();
    }
  }, [user]);

  return {
    friends,
    friendGroups,
    isLoading,
    error,
    
    // Friend management
    sendFriendRequest,
    acceptFriendRequest,
    fetchFriends,
    
    // Group management
    createFriendGroup,
    fetchFriendGroups,
    
    // Event social features
    updateEventAttendance,
    getEventAttendance,
    
    // User-generated content
    getEventUGC,
    addEventTip,
    addEventReview,
    voteOnContent,
    
    // Location-based features
    getFriendsNearEvent
  };
}
import { useState, useEffect } from "react";
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
  const [_loading, setLoading] = useState(false);

  // Mock functions since tables don't exist yet
  const fetchFriends = async () => {
    if (!user) return;
    setFriends([]);
  };

  const fetchFriendGroups = async () => {
    if (!user) return;
    setFriendGroups([]);
  };

  const sendFriendRequest = async (friendId: string) => {
    if (!user) return false;
    console.log("Friend request would be sent to:", friendId);
    await fetchFriends();
    return true;
  };

  const respondToFriendRequest = async (requestId: string, response: 'accept' | 'decline') => {
    console.log("Friend request response:", requestId, response);
    await fetchFriends();
    return true;
  };

  const createFriendGroup = async (groupData: { name: string; description?: string; is_public: boolean }) => {
    if (!user) return null;
    console.log("Friend group would be created:", groupData);
    await fetchFriendGroups();
    return { id: '1', ...groupData, created_by: user.id, created_at: new Date().toISOString() };
  };

  const joinFriendGroup = async (groupId: string) => {
    if (!user) return false;
    console.log("Joining friend group:", groupId);
    return true;
  };

  const leaveFriendGroup = async (groupId: string) => {
    if (!user) return false;
    console.log("Leaving friend group:", groupId);
    return true;
  };

  const getEventAttendance = async (eventId: string) => {
    console.log("Getting attendance for event:", eventId);
    return {
      going: 0,
      interested: 0,
      maybe: 0,
      total: 0
    };
  };

  const updateEventAttendance = async (eventId: string, status: 'interested' | 'going' | 'maybe' | 'not_going') => {
    if (!user) return false;
    console.log("Updating attendance:", eventId, status);
    return true;
  };

  const getEventUGC = async (eventId: string): Promise<UserGeneratedContent> => {
    console.log("Getting UGC for event:", eventId);
    return {
      tips: [],
      reviews: [],
      photos: []
    };
  };

  const submitEventReview = async (eventId: string, reviewData: {
    review_text: string;
    rating: number;
    attended: boolean;
  }) => {
    if (!user) return null;
    console.log("Submitting review:", eventId, reviewData);
    return { id: '1', ...reviewData, event_id: eventId, user_id: user.id, created_at: new Date().toISOString() };
  };

  const submitEventTip = async (eventId: string, tipData: {
    tip_text: string;
    tip_category: string;
  }) => {
    if (!user) return null;
    console.log("Submitting tip:", eventId, tipData);
    return { id: '1', ...tipData, event_id: eventId, user_id: user.id, created_at: new Date().toISOString() };
  };

  const submitEventPhoto = async (eventId: string, photoData: {
    photo_url: string;
    caption?: string;
  }) => {
    if (!user) return null;
    console.log("Submitting photo:", eventId, photoData);
    return { id: '1', ...photoData, event_id: eventId, user_id: user.id, created_at: new Date().toISOString() };
  };

  const voteOnContent = async (contentType: 'review' | 'tip' | 'photo', contentId: string, isHelpful: boolean) => {
    if (!user) return false;
    console.log("Voting on content:", contentType, contentId, isHelpful);
    return true;
  };

  const getFriendsNearEvent = async (latitude: number, longitude: number, radiusKm: number = 25) => {
    console.log("Getting friends near event:", latitude, longitude, radiusKm);
    return [];
  };

  const searchUsers = async (query: string) => {
    console.log("Searching users:", query);
    return [];
  };

  const getUserSocialStats = async (userId: string) => {
    console.log("Getting social stats for user:", userId);
    return {
      friendsCount: 0,
      groupsCount: 0,
      eventsAttended: 0,
      reviewsCount: 0,
      tipsCount: 0,
      photosCount: 0
    };
  };

  const blockUser = async (userId: string) => {
    if (!user) return false;
    console.log("Blocking user:", userId);
    return true;
  };

  const unblockUser = async (userId: string) => {
    if (!user) return false;
    console.log("Unblocking user:", userId);
    return true;
  };

  const reportContent = async (contentType: 'review' | 'tip' | 'photo', contentId: string, reason: string) => {
    if (!user) return false;
    console.log("Reporting content:", contentType, contentId, reason);
    return true;
  };

  useEffect(() => {
    if (user) {
      fetchFriends();
      fetchFriendGroups();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return {
    // State
    friends,
    friendGroups,
    loading,
    
    // Friend Management
    sendFriendRequest,
    respondToFriendRequest,
    acceptFriendRequest: respondToFriendRequest,
    blockUser,
    unblockUser,
    searchUsers,
    
    // Group Management
    createFriendGroup,
    joinFriendGroup,
    leaveFriendGroup,
    
    // Event Social Features
    getEventAttendance,
    updateEventAttendance,
    getEventUGC,
    getFriendsNearEvent,
    
    // Content Submission
    submitEventReview,
    submitEventTip,
    submitEventPhoto,
    voteOnContent,
    reportContent,
    
    // Utility
    getUserSocialStats,
    
    // Refresh
    refresh: () => {
      fetchFriends();
      fetchFriendGroups();
    }
  };
}
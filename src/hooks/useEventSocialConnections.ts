import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from '@/hooks/use-toast';

export interface FriendNearEvent {
  friend_id: string;
  friend_name: string;
  distance_km: number;
}

export interface EventInvitation {
  id: string;
  event_id: string;
  inviter_id: string;
  invitee_id: string;
  message?: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  updated_at: string;
}

export interface AttendingFriend {
  friend_id: string;
  friend_name: string;
  status: 'going' | 'interested' | 'maybe';
}

export function useEventSocialConnections(eventId: string, eventLatitude?: number, eventLongitude?: number) {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [friendsNearEvent, setFriendsNearEvent] = useState<FriendNearEvent[]>([]);
  const [attendingFriends, setAttendingFriends] = useState<AttendingFriend[]>([]);
  const [eventInvitations, setEventInvitations] = useState<EventInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch friends near the event location
  const fetchFriendsNearEvent = useCallback(async () => {
    if (!user || !eventLatitude || !eventLongitude) return;

    try {
      const { data, error } = await supabase.rpc('get_friends_near_event', {
        p_user_id: user.id,
        p_event_latitude: eventLatitude,
        p_event_longitude: eventLongitude,
        p_radius_km: 50
      });

      if (error) throw error;
      setFriendsNearEvent(data || []);
    } catch (error) {
      console.error('Error fetching friends near event:', error);
    }
  }, [user, eventLatitude, eventLongitude]);

  // Simplified - return empty for now since tables aren't in schema yet
  const fetchAttendingFriends = useCallback(async () => {
    setAttendingFriends([]);
  }, []);

  // Fetch event invitations - simplified
  const fetchEventInvitations = useCallback(async () => {
    setEventInvitations([]);
  }, []);

  // Send event invitation - simplified
  const sendEventInvitation = useCallback(async (friendId: string, message?: string) => {
    toast({
      title: "Coming soon!",
      description: "Friend invitations will be available soon",
    });
  }, [toast]);

  // Respond to event invitation - simplified  
  const respondToInvitation = useCallback(async (invitationId: string, status: 'accepted' | 'declined') => {
    toast({
      title: "Coming soon!",
      description: "Event invitations will be available soon",
    });
  }, [toast]);

  // Set up real-time subscriptions
  useEffect(() => {
    if (!eventId || !user) return;

    const invitationsChannel = supabase
      .channel(`event-invitations-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_invitations',
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          fetchEventInvitations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(invitationsChannel);
    };
  }, [eventId, user, fetchEventInvitations]);

  // Initial data fetch
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchFriendsNearEvent(),
        fetchAttendingFriends(),
        fetchEventInvitations(),
      ]);
      setIsLoading(false);
    };

    fetchData();
  }, [fetchFriendsNearEvent, fetchAttendingFriends, fetchEventInvitations]);

  return {
    friendsNearEvent,
    attendingFriends,
    eventInvitations,
    isLoading,
    sendEventInvitation,
    respondToInvitation,
    refreshData: () => {
      fetchFriendsNearEvent();
      fetchAttendingFriends();
      fetchEventInvitations();
    },
  };
}
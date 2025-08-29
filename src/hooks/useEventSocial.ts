import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from '@/hooks/use-toast';

export interface EventAttendee {
  id: string;
  user_id: string;
  status: 'going' | 'interested' | 'maybe';
  visibility: 'public' | 'friends_only' | 'private';
  created_at: string;
}

export interface EventDiscussion {
  id: string;
  event_id: string;
  user_id: string;
  message: string;
  message_type: 'comment' | 'photo' | 'video' | 'tip';
  media_url?: string;
  parent_id?: string;
  likes_count: number;
  created_at: string;
  updated_at: string;
}

export interface EventLiveStats {
  event_id: string;
  current_attendees: number;
  total_checkins: number;
  discussion_count: number;
  photos_count: number;
  last_activity: string;
}

export interface EventCheckin {
  id: string;
  event_id: string;
  user_id: string;
  checked_in_at: string;
  check_in_method: 'manual' | 'qr_code' | 'geofence';
  location_verified: boolean;
}

export function useEventSocial(eventId: string) {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [attendees, setAttendees] = useState<EventAttendee[]>([]);
  const [discussions, setDiscussions] = useState<EventDiscussion[]>([]);
  const [liveStats, setLiveStats] = useState<EventLiveStats | null>(null);
  const [userAttendanceStatus, setUserAttendanceStatus] = useState<string | null>(null);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch initial data
  const fetchEventSocialData = useCallback(async () => {
    if (!eventId) return;
    
    setIsLoading(true);
    
    try {
      // Fetch attendees
      const { data: attendeesData } = await supabase
        .from('event_attendees')
        .select('*')
        .eq('event_id', eventId)
        .eq('visibility', 'public')
        .order('created_at', { ascending: false });

      // Fetch discussions
      const { data: discussionsData } = await supabase
        .from('event_discussions')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
        .limit(50);

      // Fetch live stats
      const { data: statsData } = await supabase
        .from('event_live_stats')
        .select('*')
        .eq('event_id', eventId)
        .single();

      // Check user's attendance status
      if (user) {
        const { data: userAttendanceData } = await supabase
          .from('event_attendees')
          .select('status')
          .eq('event_id', eventId)
          .eq('user_id', user.id)
          .single();

        // Check if user is checked in
        const { data: checkinData } = await supabase
          .from('event_checkins')
          .select('id')
          .eq('event_id', eventId)
          .eq('user_id', user.id)
          .single();

        setUserAttendanceStatus(userAttendanceData?.status || null);
        setIsCheckedIn(!!checkinData);
      }

      setAttendees(attendeesData as EventAttendee[] || []);
      setDiscussions(discussionsData as EventDiscussion[] || []);
      setLiveStats(statsData);
    } catch (error) {
      console.error('Error fetching event social data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [eventId, user]);

  // Set up real-time subscriptions
  useEffect(() => {
    if (!eventId) return;

    const channels = [];

    // Subscribe to attendees changes
    const attendeesChannel = supabase
      .channel(`event-attendees-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_attendees',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          console.log('Attendees change:', payload);
          if (payload.eventType === 'INSERT') {
            setAttendees(prev => [payload.new as EventAttendee, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setAttendees(prev => prev.map(a => 
              a.id === payload.new.id ? payload.new as EventAttendee : a
            ));
          } else if (payload.eventType === 'DELETE') {
            setAttendees(prev => prev.filter(a => a.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    // Subscribe to discussions changes
    const discussionsChannel = supabase
      .channel(`event-discussions-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_discussions',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          console.log('Discussions change:', payload);
          if (payload.eventType === 'INSERT') {
            setDiscussions(prev => [payload.new as EventDiscussion, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setDiscussions(prev => prev.map(d => 
              d.id === payload.new.id ? payload.new as EventDiscussion : d
            ));
          } else if (payload.eventType === 'DELETE') {
            setDiscussions(prev => prev.filter(d => d.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    // Subscribe to live stats changes
    const statsChannel = supabase
      .channel(`event-stats-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_live_stats',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          console.log('Stats change:', payload);
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            setLiveStats(payload.new as EventLiveStats);
          }
        }
      )
      .subscribe();

    channels.push(attendeesChannel, discussionsChannel, statsChannel);

    // Cleanup
    return () => {
      channels.forEach(channel => {
        supabase.removeChannel(channel);
      });
    };
  }, [eventId]);

  // Initial data fetch
  useEffect(() => {
    fetchEventSocialData();
  }, [fetchEventSocialData]);

  // Actions
  const updateAttendanceStatus = useCallback(async (status: 'going' | 'interested' | 'maybe') => {
    if (!user || !eventId) return;

    try {
      const { error } = await supabase
        .from('event_attendees')
        .upsert({
          event_id: eventId,
          user_id: user.id,
          status,
          visibility: 'public',
        });

      if (error) throw error;

      setUserAttendanceStatus(status);
      
      toast({
        title: "Status Updated",
        description: `You are now marked as "${status}" for this event`,
      });
    } catch (error) {
      console.error('Error updating attendance status:', error);
      toast({
        title: "Error",
        description: "Failed to update your attendance status",
        variant: "destructive",
      });
    }
  }, [user, eventId, toast]);

  const checkInToEvent = useCallback(async () => {
    if (!user || !eventId) return;

    try {
      const { error } = await supabase
        .from('event_checkins')
        .insert({
          event_id: eventId,
          user_id: user.id,
          check_in_method: 'manual',
          location_verified: false,
        });

      if (error) throw error;

      setIsCheckedIn(true);
      
      toast({
        title: "Checked In!",
        description: "You've successfully checked in to this event",
      });
    } catch (error) {
      console.error('Error checking in:', error);
      toast({
        title: "Error",
        description: "Failed to check in to the event",
        variant: "destructive",
      });
    }
  }, [user, eventId, toast]);

  const addDiscussion = useCallback(async (
    message: string, 
    messageType: 'comment' | 'photo' | 'video' | 'tip' = 'comment',
    mediaUrl?: string
  ) => {
    if (!user || !eventId) return;

    try {
      const { error } = await supabase
        .from('event_discussions')
        .insert({
          event_id: eventId,
          user_id: user.id,
          message,
          message_type: messageType,
          media_url: mediaUrl,
        });

      if (error) throw error;

      toast({
        title: "Comment Added",
        description: "Your comment has been posted",
      });
    } catch (error) {
      console.error('Error adding discussion:', error);
      toast({
        title: "Error",
        description: "Failed to post your comment",
        variant: "destructive",
      });
    }
  }, [user, eventId, toast]);

  const likeDiscussion = useCallback(async (discussionId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('event_discussion_reactions')
        .upsert({
          discussion_id: discussionId,
          user_id: user.id,
          reaction_type: 'like',
        });

      if (error) throw error;

      // Update local state optimistically
      setDiscussions(prev => prev.map(d => 
        d.id === discussionId ? { ...d, likes_count: d.likes_count + 1 } : d
      ));
    } catch (error) {
      console.error('Error liking discussion:', error);
    }
  }, [user]);

  return {
    // Data
    attendees,
    discussions,
    liveStats,
    userAttendanceStatus,
    isCheckedIn,
    isLoading,
    
    // Actions
    updateAttendanceStatus,
    checkInToEvent,
    addDiscussion,
    likeDiscussion,
    refreshData: fetchEventSocialData,
  };
}
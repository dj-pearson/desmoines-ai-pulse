import { useState, useEffect } from "react";
import { useAuth } from "./useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createLogger } from '@/lib/logger';

const logger = createLogger('useCommunityFeatures');

interface CheckIn {
  id: string;
  event_id: string;
  user_id: string;
  status: 'interested' | 'going' | 'maybe' | 'not_going';
  created_at: string;
  updated_at: string;
}

interface Forum {
  id: string;
  title: string;
  description?: string;
  category: string;
  is_public: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  thread_count?: number;
}

interface Thread {
  id: string;
  forum_id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  is_locked: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  reply_count?: number;
  creator_profile?: {
    first_name?: string;
    last_name?: string;
  };
}

interface Reply {
  id: string;
  thread_id: string;
  content: string;
  parent_reply_id?: string;
  created_by: string;
  created_at: string;
  creator_profile?: {
    first_name?: string;
    last_name?: string;
  };
}

interface Friend {
  id: string;
  user_id: string;
  friend_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'blocked';
  requested_by?: string;
  created_at: string;
  friend_profile?: {
    first_name?: string;
    last_name?: string;
    email?: string;
  };
}

export function useCommunityFeatures() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [forums, setForums] = useState<Forum[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);

  // WEB-QA-022 AC4. uploadEventPhoto and getEventPhotos lived here: the
  // Option-B path, writing to and reading from `event_photos`. They are gone,
  // and the reason is the whole point of that story - "DELETE the losing path
  // rather than leaving it dormant, the dead path is what produced this
  // ambiguity".
  //
  // Option A is what shipped. Migration 20260718000003 is applied AND effective
  // (it is not in .github/migration-drift-baseline.json, which after WEB-QA-017
  // is a separate fact from being ledgered), so event photos are
  // event_discussions rows with message_type='photo' and media_url.
  // EventPhotoUpload.tsx:90 writes that shape, EventPhotoGallery.tsx:17 reads
  // it, EventSocialHub.tsx:188 counts it, and ownership.ts maps `photo` to it.
  //
  // Deleting cost nothing and risked nothing: both tables held ZERO rows, so
  // there was no data on either side, and neither function had a single
  // consumer - six components import this hook and not one destructured either.
  // Both paths already shared the `event-photos` storage bucket, so no object
  // was orphaned by this.
  //
  // If event_photos is ever adopted after all, it needs a moderation column
  // before the approval filter that used to sit in getEventPhotos can come
  // back; that filter named `is_approved`, which has never existed.

  // Check-in Functions
  const updateEventCheckIn = async (eventId: string, status: 'interested' | 'going' | 'maybe' | 'not_going') => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('event_attendance')
        .upsert({
          event_id: eventId,
          user_id: user.id,
          status
        }, {
          onConflict: 'event_id,user_id'
        });

      if (error) throw error;

      toast.success(`Marked as ${status}!`);
      return true;
    } catch (error) {
      logger.error('updateEventCheckIn', 'Failed to update check-in', { error });
      toast.error('Failed to update check-in');
      return false;
    }
  };

  const getEventCheckIns = async (eventId: string) => {
    try {
      const { data, error } = await supabase
        .from('event_attendance')
        .select('status')
        .eq('event_id', eventId);

      if (error) throw error;

      const counts = data?.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      return {
        going: counts.going || 0,
        interested: counts.interested || 0,
        maybe: counts.maybe || 0,
        not_going: counts.not_going || 0,
        total: data?.length || 0
      };
    } catch (error) {
      logger.error('getEventCheckIns', 'Failed to fetch check-ins', { error });
      return { going: 0, interested: 0, maybe: 0, not_going: 0, total: 0 };
    }
  };

  const getUserEventCheckIn = async (eventId: string) => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('event_attendance')
        .select('status')
        .eq('event_id', eventId)
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data?.status || null;
    } catch (error) {
      logger.error('getUserEventCheckIn', 'Failed to fetch user check-in', { error });
      return null;
    }
  };

  // Forum Functions
  const fetchForums = async () => {
    try {
      const { data, error } = await supabase
        .from('discussion_forums')
        .select('*')
        .eq('is_public', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setForums(data || []);
      return data || [];
    } catch (error) {
      logger.error('fetchForums', 'Failed to fetch forums', { error });
      return [];
    }
  };

  const createForum = async (forumData: { title: string; description?: string; category: string }) => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('discussion_forums')
        .insert({
          ...forumData,
          created_by: user.id
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Forum created successfully!');
      await fetchForums();
      return data;
    } catch (error) {
      logger.error('createForum', 'Failed to create forum', { error });
      toast.error('Failed to create forum');
      return null;
    }
  };

  const getThreads = async (forumId: string): Promise<Thread[]> => {
    try {
      const { data, error } = await supabase
        .from('discussion_threads')
        .select('*')
        .eq('forum_id', forumId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('getThreads', 'Failed to fetch threads', { error });
      return [];
    }
  };

  const createThread = async (forumId: string, threadData: { title: string; content: string }) => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('discussion_threads')
        .insert({
          forum_id: forumId,
          ...threadData,
          created_by: user.id
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Thread created successfully!');
      return data;
    } catch (error) {
      logger.error('createThread', 'Failed to create thread', { error });
      toast.error('Failed to create thread');
      return null;
    }
  };

  const getReplies = async (threadId: string): Promise<Reply[]> => {
    try {
      const { data, error } = await supabase
        .from('discussion_replies')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('getReplies', 'Failed to fetch replies', { error });
      return [];
    }
  };

  const createReply = async (threadId: string, content: string, parentReplyId?: string) => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('discussion_replies')
        .insert({
          thread_id: threadId,
          content,
          parent_reply_id: parentReplyId,
          created_by: user.id
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Reply posted successfully!');
      return data;
    } catch (error) {
      logger.error('createReply', 'Failed to create reply', { error });
      toast.error('Failed to post reply');
      return null;
    }
  };

  // Friend Functions
  const fetchFriends = async () => {
    if (!user) return [];

    try {
      const { data, error } = await supabase
        .from('user_friends')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'accepted');

      if (error) throw error;
      setFriends((data || []) as Friend[]);
      return (data || []) as Friend[];
    } catch (error) {
      logger.error('fetchFriends', 'Failed to fetch friends', { error });
      return [];
    }
  };

  const sendFriendRequest = async (friendEmail: string) => {
    if (!user) return false;

    try {
      // First, find the user by email
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('email', friendEmail)
        .single();

      if (profileError) {
        toast.error('User not found with that email');
        return false;
      }

      const friendId = profileData.user_id;

      // Check if friendship already exists
      const { data: existingFriend } = await supabase
        .from('user_friends')
        .select('id')
        .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`)
        .single();

      if (existingFriend) {
        toast.error('Friend request already exists or you are already friends');
        return false;
      }

      // Create friend request
      const { error } = await supabase
        .from('user_friends')
        .insert([
          {
            user_id: user.id,
            friend_id: friendId,
            requested_by: user.id,
            status: 'pending'
          },
          {
            user_id: friendId,
            friend_id: user.id,
            requested_by: user.id,
            status: 'pending'
          }
        ]);

      if (error) throw error;

      toast.success('Friend request sent!');
      return true;
    } catch (error) {
      logger.error('sendFriendRequest', 'Failed to send friend request', { error });
      toast.error('Failed to send friend request');
      return false;
    }
  };

  // Initialize data
  useEffect(() => {
    if (user) {
      fetchForums();
      fetchFriends();
    }
  }, [user]);

  return {
    // State
    loading,
    forums,
    friends,

    // Photo functions

    // Check-in functions
    updateEventCheckIn,
    getEventCheckIns,
    getUserEventCheckIn,

    // Forum functions
    fetchForums,
    createForum,
    getThreads,
    createThread,
    getReplies,
    createReply,

    // Friend functions
    fetchFriends,
    sendFriendRequest,

    // Refresh
    refresh: () => {
      if (user) {
        fetchForums();
        fetchFriends();
      }
    }
  };
}
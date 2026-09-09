/**
 * Friends, backed by the `user_friends` table (WEB-FEAT-028).
 *
 * WHAT THIS USED TO BE. Every function returned fabricated success behind the
 * comment "Mock functions since tables don't exist yet". `sendFriendRequest`
 * returned true without writing anything; `submitEventReview`, `submitEventTip`
 * and `submitEventPhoto` each returned an object with `id: '1'`, so a caller
 * would have rendered a saved-looking review that existed nowhere. Meanwhile
 * `user_friends` has existed in production the whole time, and
 * `useCommunityFeatures` was already reading and writing it - two friend
 * implementations, one real and one fake, and the fake one owned /social.
 *
 * WHAT IT IS NOW. Only what is actually consumed, and only what a table can
 * back. Social.tsx uses `friends`, `friendGroups` and `sendFriendRequest`;
 * Profile.tsx uses `friends` and `friendGroups`. Everything else in the old
 * file had zero call sites and has been deleted rather than left returning
 * plausible lies.
 *
 * FRIEND GROUPS ARE STILL NOT BACKED. There is no user_groups or equivalent in
 * production (checked against scripts/db-snapshot.json). `friendGroups` is
 * therefore always empty and `groupsAvailable` is false, so the UI can say so
 * instead of rendering an empty list that looks like "you have no groups".
 * Building that table is a product decision (WEB-QA-018), not a guess to make
 * here.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { createLogger } from '@/lib/logger';

const logger = createLogger('useSocialFeatures');

/**
 * The other party's public-facing profile, hydrated onto each row by
 * `fetchFriends`. Optional because `profiles` is a separate request that RLS
 * may refuse: when it does, the row still renders, just without a name.
 */
export interface FriendProfile {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

export interface Friend {
  id: string;
  user_id: string;
  friend_id: string;
  status: string;
  created_at: string;
  accepted_at?: string | null;
  /** The person on the OTHER end of this row, whichever column they sit in. */
  friend_profile?: FriendProfile;
}

export interface FriendGroup {
  id: string;
  name: string;
  description?: string;
  created_by: string;
  is_public: boolean;
  created_at: string;
  member_count?: number;
}

export type FriendRequestOutcome =
  | 'sent'
  | 'already_connected'
  | 'not_found'
  | 'self'
  | 'error';

/** The other party on a `user_friends` row, from the current user's side. */
function otherPartyId(row: Friend, selfId: string): string {
  return row.user_id === selfId ? row.friend_id : row.user_id;
}

/**
 * Hydrate `friend_profile` on each row.
 *
 * Social.tsx has always rendered `friend.friend_profile?.first_name` and
 * `.email`, and nothing ever populated them, so every connection on /community
 * showed a "U" avatar with a blank name and a blank email (WEB-FEAT-033). One
 * batched request by user_id, not one per row.
 *
 * Failure is not an error path: `profiles` is behind RLS, and a policy that
 * hides other users' rows is a legitimate configuration. The rows come back
 * un-hydrated and the UI falls back to the initial, exactly as it does today.
 */
async function attachProfiles(rows: Friend[], selfId: string): Promise<Friend[]> {
  const ids = [...new Set(rows.map((row) => otherPartyId(row, selfId)))];
  if (ids.length === 0) return rows;

  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, first_name, last_name, email')
    .in('user_id', ids);

  if (error) {
    logger.warn('attachProfiles', 'Profile hydration unavailable', { error });
    return rows;
  }

  const byUserId = new Map<string, FriendProfile>(
    (data ?? []).map((profile) => [profile.user_id, profile as FriendProfile]),
  );

  return rows.map((row) => {
    const profile = byUserId.get(otherPartyId(row, selfId));
    return profile ? { ...row, friend_profile: profile } : row;
  });
}

export function useSocialFeatures() {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFriends = useCallback(async () => {
    if (!user) {
      setFriends([]);
      setPendingRequests([]);
      return;
    }

    setLoading(true);
    try {
      // Both directions: a row is written once, by whoever asked, so the other
      // party's connection is the row where they are the friend_id.
      const { data, error } = await supabase
        .from('user_friends')
        .select('*')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

      if (error) {
        logger.error('fetchFriends', 'Failed to fetch friends', { error });
        setFriends([]);
        setPendingRequests([]);
        return;
      }

      const rows = (data ?? []) as Friend[];
      const hydrated = await attachProfiles(rows, user.id);
      setFriends(hydrated.filter((row) => row.status === 'accepted'));
      // Only requests addressed TO this user are actionable by them.
      setPendingRequests(
        hydrated.filter((row) => row.status === 'pending' && row.friend_id === user.id),
      );
    } catch (error) {
      logger.error('fetchFriends', 'Failed to fetch friends', { error });
      setFriends([]);
      setPendingRequests([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  /**
   * Send a friend request by email address.
   *
   * Returns a discriminated outcome rather than a boolean, because the caller
   * needs to tell "no such user" from "already connected" from "failed" - the
   * old version returned true for all three.
   */
  const sendFriendRequest = useCallback(
    async (friendEmail: string): Promise<FriendRequestOutcome> => {
      if (!user) return 'error';

      try {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('email', friendEmail.trim().toLowerCase())
          .maybeSingle();

        if (profileError) {
          logger.error('sendFriendRequest', 'Profile lookup failed', { error: profileError });
          return 'error';
        }
        if (!profile?.user_id) return 'not_found';
        if (profile.user_id === user.id) return 'self';

        const { data: existing, error: existingError } = await supabase
          .from('user_friends')
          .select('id')
          .or(
            `and(user_id.eq.${user.id},friend_id.eq.${profile.user_id}),` +
              `and(user_id.eq.${profile.user_id},friend_id.eq.${user.id})`,
          )
          .maybeSingle();

        if (existingError) {
          logger.error('sendFriendRequest', 'Duplicate check failed', { error: existingError });
          return 'error';
        }
        if (existing) return 'already_connected';

        // Only the columns user_friends actually has. It has no `requested_by`;
        // the requester is `user_id`, since the row is written by whoever asks.
        const { error } = await supabase.from('user_friends').insert([
          {
            user_id: user.id,
            friend_id: profile.user_id,
            status: 'pending',
          },
        ]);

        if (error) {
          logger.error('sendFriendRequest', 'Insert failed', { error });
          return 'error';
        }

        await fetchFriends();
        return 'sent';
      } catch (error) {
        logger.error('sendFriendRequest', 'Unexpected failure', { error });
        return 'error';
      }
    },
    [user, fetchFriends],
  );

  const acceptFriendRequest = useCallback(
    async (requestId: string): Promise<boolean> => {
      if (!user) return false;
      try {
        const { error } = await supabase
          .from('user_friends')
          .update({ status: 'accepted', accepted_at: new Date().toISOString() })
          .eq('id', requestId)
          // Only the addressee may accept. RLS should enforce this too; this is
          // the client-side half of the same rule.
          .eq('friend_id', user.id);

        if (error) {
          logger.error('acceptFriendRequest', 'Update failed', { error });
          return false;
        }
        await fetchFriends();
        return true;
      } catch (error) {
        logger.error('acceptFriendRequest', 'Unexpected failure', { error });
        return false;
      }
    },
    [user, fetchFriends],
  );

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  return {
    friends,
    pendingRequests,
    /**
     * Always empty: no groups table exists in production. Paired with
     * `groupsAvailable` so a caller can say "not available yet" rather than
     * rendering an empty list that reads as "you have no groups".
     */
    friendGroups: [] as FriendGroup[],
    groupsAvailable: false,
    loading,
    fetchFriends,
    sendFriendRequest,
    acceptFriendRequest,
  };
}

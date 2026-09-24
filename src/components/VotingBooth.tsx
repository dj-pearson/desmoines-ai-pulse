import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  useCastVote,
  useUserVote,
  PENDING_VOTE_KEY,
  PENDING_VOTE_MAX_AGE_MS,
  type PendingVote,
  type VoteResult,
  type VotingCategory,
} from '@/hooks/useVoting';
import { supabase } from '@/integrations/supabase/client';
import { handleError, ErrorSeverity } from '@/lib/errorHandler';
import { storage } from '@/lib/safeStorage';
import { Search, Check, PenLine, Utensils, MapPin, LogIn } from 'lucide-react';

interface VotingBoothProps {
  category: VotingCategory;
  /** The category's leaderboard, used to name the voter's current pick. */
  results?: VoteResult[];
}

interface SearchResult {
  id: string;
  name: string;
  type: 'restaurant' | 'attraction';
  image_url?: string | null;
}

interface Pick {
  entityType: string;
  entityId?: string;
  customEntry?: string;
  name: string;
}

type SearchStatus = 'idle' | 'searching' | 'done' | 'error';

const SEARCH_DEBOUNCE_MS = 250;
const WRITE_IN_MAX = 80;

/** Escape LIKE metacharacters so "100%" searches for a percent sign. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** The stashed signed-out pick for this category, if it is still fresh. */
function readPendingVote(categoryId: string): PendingVote | null {
  const pending = storage.get<PendingVote>(PENDING_VOTE_KEY);
  if (!pending || pending.categoryId !== categoryId) return null;
  if (typeof pending.savedAt !== 'number' || Date.now() - pending.savedAt > PENDING_VOTE_MAX_AGE_MS) {
    storage.remove(PENDING_VOTE_KEY);
    return null;
  }
  return pending;
}

export function VotingBooth({ category, results = [] }: VotingBoothProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const castVote = useCastVote();
  const { data: existingVote, isError: voteReadFailed } = useUserVote(category.id);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle');
  const [showWriteIn, setShowWriteIn] = useState(false);
  const [writeInValue, setWriteInValue] = useState('');
  const [changing, setChanging] = useState(false);
  // Signed out: the pick waiting behind the sign-in link.
  const [stashedPick, setStashedPick] = useState<Pick | null>(null);
  // Signed in after a stash: the pick waiting for confirmation.
  const [pendingPick, setPendingPick] = useState<PendingVote | null>(null);
  const latestSearch = useRef(0);

  const authHref = `/auth?redirect=${encodeURIComponent(`/best-of/${category.slug}`)}`;

  useEffect(() => {
    if (user) setPendingPick(readPendingVote(category.id));
  }, [user, category.id]);

  // Debounced search. Each run takes a sequence number and only the newest
  // one may write state, so a slow response to "pi" cannot overwrite the
  // answer to "pizza".
  useEffect(() => {
    const query = searchQuery.trim();
    const requestId = ++latestSearch.current;
    if (query.length < 2) {
      setSearchResults([]);
      setSearchStatus('idle');
      return;
    }

    const timer = window.setTimeout(async () => {
      setSearchStatus('searching');
      const pattern = `%${escapeLike(query)}%`;
      const [restaurantsRes, attractionsRes] = await Promise.all([
        supabase.from('restaurants').select('id, name, image_url').ilike('name', pattern).limit(5),
        supabase.from('attractions').select('id, name, image_url').ilike('name', pattern).limit(5),
      ]);
      if (requestId !== latestSearch.current) return;

      if (restaurantsRes.error && attractionsRes.error) {
        handleError(new Error(restaurantsRes.error.message), {
          component: 'VotingBooth',
          action: 'search',
        }, ErrorSeverity.WARNING);
        setSearchResults([]);
        setSearchStatus('error');
        return;
      }

      setSearchResults([
        ...(restaurantsRes.data ?? []).map((r) => ({ ...r, type: 'restaurant' as const })),
        ...(attractionsRes.data ?? []).map((a) => ({ ...a, type: 'attraction' as const })),
      ]);
      setSearchStatus('done');
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const resetBallot = () => {
    setSearchQuery('');
    setSearchResults([]);
    setWriteInValue('');
    setShowWriteIn(false);
    setChanging(false);
  };

  const submitVote = async (pick: Pick) => {
    try {
      await castVote.mutateAsync({
        categoryId: category.id,
        entityType: pick.entityType,
        entityId: pick.entityId,
        customEntry: pick.customEntry,
      });
      toast({ title: 'Vote cast', description: `Your vote for ${pick.name} is in.` });
      resetBallot();
      return true;
    } catch (error) {
      handleError(error, { component: 'VotingBooth', action: 'castVote' });
      const message = error instanceof Error && error.message ? error.message : 'Please try again.';
      toast({ title: 'Vote not saved', description: message, variant: 'destructive' });
      return false;
    }
  };

  const handlePick = (pick: Pick) => {
    if (!user) {
      const pending: PendingVote = {
        categoryId: category.id,
        categorySlug: category.slug,
        entityType: pick.entityType,
        entityId: pick.entityId,
        customEntry: pick.customEntry,
        name: pick.name,
        savedAt: Date.now(),
      };
      storage.set(PENDING_VOTE_KEY, pending);
      setStashedPick(pick);
      return;
    }
    void submitVote(pick);
  };

  const confirmPending = async () => {
    if (!pendingPick) return;
    const ok = await submitVote({
      entityType: pendingPick.entityType,
      entityId: pendingPick.entityId,
      customEntry: pendingPick.customEntry,
      name: pendingPick.name,
    });
    if (ok) {
      storage.remove(PENDING_VOTE_KEY);
      setPendingPick(null);
    }
  };

  const discardPending = () => {
    storage.remove(PENDING_VOTE_KEY);
    setPendingPick(null);
  };

  const currentPickName = existingVote
    ? results.find((r) =>
        existingVote.entity_id
          ? r.entity_id === existingVote.entity_id
          : r.custom_entry === existingVote.custom_entry,
      )?.name ?? existingVote.custom_entry ?? 'your pick'
    : null;

  const showBallot = !pendingPick && !stashedPick && (!existingVote || changing);
  const query = searchQuery.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Cast your vote</CardTitle>
        <p className="text-sm text-muted-foreground">
          One vote per person in {category.name}. You can change it while voting is open.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!user && !stashedPick && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted p-3 text-sm">
            <span>Pick a place below, then sign in to count your vote.</span>
            <Button asChild variant="outline" size="sm" className="min-h-11">
              <Link to={authHref}>
                <LogIn className="h-4 w-4 mr-1" aria-hidden="true" />
                Sign in to vote
              </Link>
            </Button>
          </div>
        )}

        {stashedPick && (
          <div className="space-y-3 rounded-lg bg-muted p-3 text-sm" role="status">
            <p>
              Sign in to vote for <strong>{stashedPick.name}</strong>. We'll keep your pick
              and ask you to confirm it when you're back.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" className="min-h-11">
                <Link to={authHref}>Sign in to vote</Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11"
                onClick={() => {
                  storage.remove(PENDING_VOTE_KEY);
                  setStashedPick(null);
                }}
              >
                Pick something else
              </Button>
            </div>
          </div>
        )}

        {user && pendingPick && (
          <div className="space-y-3 rounded-lg bg-muted p-3 text-sm" role="status">
            <p>
              Before you signed in you picked <strong>{pendingPick.name}</strong>.
              {existingVote && currentPickName
                ? ` Confirming replaces your current vote for ${currentPickName}.`
                : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="min-h-11"
                disabled={castVote.isPending}
                onClick={() => void confirmPending()}
              >
                Confirm vote for {pendingPick.name}
              </Button>
              <Button variant="ghost" size="sm" className="min-h-11" onClick={discardPending}>
                Discard
              </Button>
            </div>
          </div>
        )}

        {user && existingVote && !changing && !pendingPick && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary/10 p-3 text-sm text-foreground">
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" aria-hidden="true" />
              <span>
                Your vote: <strong>{currentPickName}</strong>
              </span>
            </span>
            <Button variant="outline" size="sm" className="min-h-11" onClick={() => setChanging(true)}>
              Change
            </Button>
          </div>
        )}

        {user && voteReadFailed && (
          <p className="text-sm text-muted-foreground">
            We couldn't check whether you've already voted. Voting again replaces any earlier pick.
          </p>
        )}

        {showBallot && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                aria-label={`Search for a place to vote for in ${category.name}`}
                placeholder="Search for a place to vote for..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 min-h-11"
              />
            </div>

            <p aria-live="polite" className="text-sm text-muted-foreground min-h-5">
              {searchStatus === 'searching' && 'Searching...'}
              {searchStatus === 'error' && "Search isn't working right now. You can still write in your pick."}
              {searchStatus === 'done' &&
                (searchResults.length === 0
                  ? `No places match "${query}".`
                  : `${searchResults.length} place${searchResults.length === 1 ? '' : 's'} found.`)}
            </p>

            {searchResults.length > 0 && (
              <ul className="space-y-1 max-h-60 overflow-y-auto">
                {searchResults.map((result) => (
                  <li key={`${result.type}-${result.id}`}>
                    <button
                      type="button"
                      onClick={() =>
                        handlePick({ entityType: result.type, entityId: result.id, name: result.name })
                      }
                      disabled={castVote.isPending}
                      className="flex min-h-11 items-center gap-3 w-full p-2 rounded hover:bg-accent text-left transition-colors"
                    >
                      {result.image_url ? (
                        <img
                          src={result.image_url}
                          alt=""
                          width={32}
                          height={32}
                          loading="lazy"
                          className="w-8 h-8 rounded object-cover"
                        />
                      ) : (
                        <span className="w-8 h-8 rounded bg-muted flex items-center justify-center" aria-hidden="true">
                          {result.type === 'restaurant' ? (
                            <Utensils className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                          )}
                        </span>
                      )}
                      <span>
                        <span className="block text-sm font-medium">{result.name}</span>
                        <span className="block text-xs text-muted-foreground capitalize">{result.type}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {searchStatus === 'done' && searchResults.length === 0 && !showWriteIn && (
              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={() => {
                  setWriteInValue(query.slice(0, WRITE_IN_MAX));
                  setShowWriteIn(true);
                }}
              >
                <PenLine className="h-4 w-4 mr-1" aria-hidden="true" />
                No match, write it in
              </Button>
            )}

            <div className="pt-2 border-t space-y-2">
              {!showWriteIn ? (
                <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setShowWriteIn(true)}>
                  <PenLine className="h-4 w-4 mr-1" aria-hidden="true" />
                  Can't find it? Write in your pick
                </Button>
              ) : (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = writeInValue.trim();
                    if (name) handlePick({ entityType: 'custom', customEntry: name, name });
                  }}
                >
                  <Input
                    aria-label="Write in a place name"
                    placeholder="Enter a place name..."
                    value={writeInValue}
                    maxLength={WRITE_IN_MAX}
                    onChange={(e) => setWriteInValue(e.target.value)}
                    className="min-h-11"
                  />
                  <Button
                    type="submit"
                    className="min-h-11"
                    disabled={!writeInValue.trim() || castVote.isPending}
                  >
                    Vote
                  </Button>
                </form>
              )}
              {changing && (
                <Button variant="ghost" size="sm" className="min-h-11" onClick={resetBallot}>
                  Keep my current vote
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

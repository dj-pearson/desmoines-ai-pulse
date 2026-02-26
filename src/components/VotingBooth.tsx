import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCastVote, useUserVote, type VotingCategory } from '@/hooks/useVoting';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Search, Check, PenLine } from 'lucide-react';

interface VotingBoothProps {
  category: VotingCategory;
}

interface SearchResult {
  id: string;
  name: string;
  type: 'restaurant' | 'attraction';
  image_url?: string;
}

export function VotingBooth({ category }: VotingBoothProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const castVote = useCastVote();
  const { data: existingVote } = useUserVote(category.id);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showWriteIn, setShowWriteIn] = useState(false);
  const [writeInValue, setWriteInValue] = useState('');

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const results: SearchResult[] = [];

      // Search restaurants
      const { data: restaurants } = await supabase
        .from('restaurants')
        .select('id, name, image_url')
        .ilike('name', `%${query}%`)
        .limit(5);

      if (restaurants) {
        results.push(...restaurants.map((r) => ({ ...r, type: 'restaurant' as const })));
      }

      // Search attractions
      const { data: attractions } = await supabase
        .from('attractions')
        .select('id, name, image_url')
        .ilike('name', `%${query}%`)
        .limit(5);

      if (attractions) {
        results.push(...attractions.map((a) => ({ ...a, type: 'attraction' as const })));
      }

      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleVote = async (entityType: string, entityId?: string, customEntry?: string) => {
    if (!user) {
      toast({ title: 'Sign in required', description: 'Please sign in to vote.', variant: 'destructive' });
      return;
    }

    try {
      await castVote.mutateAsync({
        categoryId: category.id,
        entityType,
        entityId,
        customEntry,
      });
      toast({ title: 'Vote cast!', description: `Your vote for ${category.name} has been recorded.` });
      setSearchQuery('');
      setSearchResults([]);
      setWriteInValue('');
      setShowWriteIn(false);
    } catch {
      toast({ title: 'Vote failed', description: 'Could not cast your vote. Please try again.', variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{category.name}</CardTitle>
        {category.description && (
          <p className="text-sm text-muted-foreground">{category.description}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {existingVote && (
          <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-2 rounded">
            <Check className="h-4 w-4" />
            You've already voted in this category. Vote again to change your pick.
          </div>
        )}

        {/* Search to vote */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search for a place to vote for..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Search results */}
        {isSearching && <p className="text-sm text-muted-foreground">Searching...</p>}
        {searchResults.length > 0 && (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {searchResults.map((result) => (
              <button
                key={result.id}
                onClick={() => handleVote(result.type, result.id)}
                disabled={castVote.isPending}
                className="flex items-center gap-3 w-full p-2 rounded hover:bg-accent text-left transition-colors"
              >
                {result.image_url ? (
                  <img src={result.image_url} alt="" className="w-8 h-8 rounded object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-xs">
                    {result.type === 'restaurant' ? '🍽️' : '⭐'}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium">{result.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{result.type}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Write-in option */}
        <div className="pt-2 border-t">
          {!showWriteIn ? (
            <Button variant="ghost" size="sm" onClick={() => setShowWriteIn(true)}>
              <PenLine className="h-4 w-4 mr-1" />
              Can't find it? Write in your pick
            </Button>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder="Enter a place name..."
                value={writeInValue}
                onChange={(e) => setWriteInValue(e.target.value)}
              />
              <Button
                size="sm"
                disabled={!writeInValue.trim() || castVote.isPending}
                onClick={() => handleVote('custom', undefined, writeInValue.trim())}
              >
                Vote
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

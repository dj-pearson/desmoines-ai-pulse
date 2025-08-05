import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Trophy, Medal, Award, Crown } from "lucide-react";
import { useGamification } from "@/hooks/useGamification";

const getRankIcon = (rank: number) => {
  switch (rank) {
    case 1: return Crown;
    case 2: return Trophy;
    case 3: return Medal;
    default: return Award;
  }
};

const getRankColor = (rank: number) => {
  switch (rank) {
    case 1: return 'text-yellow-500';
    case 2: return 'text-gray-400';
    case 3: return 'text-orange-600';
    default: return 'text-muted-foreground';
  }
};

export function Leaderboard() {
  const { leaderboard, isLoading, reputation } = useGamification();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-8 h-8 bg-muted rounded-full" />
                <div className="flex-1 space-y-1">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
                <div className="h-6 w-16 bg-muted rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          Leaderboard
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {leaderboard.map((user, index) => {
            const rank = index + 1;
            const RankIcon = getRankIcon(rank);
            const rankColor = getRankColor(rank);
            const isCurrentUser = reputation?.user_id === user.user_id;
            
            return (
              <div 
                key={user.user_id} 
                className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                  isCurrentUser ? 'bg-primary/5 border border-primary/20' : 'hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-2 min-w-[3rem]">
                  <RankIcon className={`h-5 w-5 ${rankColor}`} />
                  <span className="font-bold text-sm">#{rank}</span>
                </div>
                
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">
                    {((user as any).profiles?.first_name?.[0] || 'U')}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">
                      {((user as any).profiles?.first_name && (user as any).profiles?.last_name) 
                        ? `${(user as any).profiles.first_name} ${(user as any).profiles.last_name}`
                        : 'Anonymous User'
                      }
                    </p>
                    {isCurrentUser && (
                      <Badge variant="secondary" className="text-xs">You</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Level {user.current_level}</span>
                    <span>•</span>
                    <span>{user.total_badges} badges</span>
                  </div>
                </div>
                
                <div className="text-right">
                  <p className="font-bold text-sm">{user.experience_points}</p>
                  <p className="text-xs text-muted-foreground">XP</p>
                </div>
              </div>
            );
          })}
          
          {leaderboard.length === 0 && (
            <div className="text-center py-8">
              <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No leaderboard data yet.</p>
              <p className="text-sm text-muted-foreground">Be the first to start earning XP!</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
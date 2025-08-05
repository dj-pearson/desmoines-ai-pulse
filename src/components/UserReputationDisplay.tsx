import React from "react";
import { Star, Award, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useUserReputation } from "@/hooks/useRatings";

interface UserReputationDisplayProps {
  userId: string;
  compact?: boolean;
}

const getLevelInfo = (level: string) => {
  const levels = {
    new: { name: "New", color: "bg-gray-500", nextThreshold: 100, description: "Welcome! Start rating to earn points." },
    bronze: { name: "Bronze", color: "bg-orange-600", nextThreshold: 1000, description: "Keep going! You're building your reputation." },
    silver: { name: "Silver", color: "bg-gray-400", nextThreshold: 5000, description: "Great progress! Your opinions matter." },
    gold: { name: "Gold", color: "bg-yellow-500", nextThreshold: 10000, description: "Excellent reviewer! Highly trusted member." },
    platinum: { name: "Platinum", color: "bg-purple-500", nextThreshold: null, description: "Elite reviewer! Maximum reputation achieved." },
    moderator: { name: "Moderator", color: "bg-blue-500", nextThreshold: null, description: "Community moderator with special privileges." },
    admin: { name: "Admin", color: "bg-red-500", nextThreshold: null, description: "Administrator with full access." }
  };
  return levels[level as keyof typeof levels] || levels.new;
};

export const UserReputationDisplay: React.FC<UserReputationDisplayProps> = ({ 
  userId, 
  compact = false 
}) => {
  const { reputation, isLoading, error } = useUserReputation(userId);

  if (isLoading) {
    return (
      <Card className={compact ? "w-auto" : "w-full"}>
        <CardContent className="flex items-center justify-center py-4">
          <div className="animate-pulse">Loading reputation...</div>
        </CardContent>
      </Card>
    );
  }

  if (error || !reputation) {
    return (
      <Card className={compact ? "w-auto" : "w-full"}>
        <CardContent className="flex items-center justify-center py-4">
          <div className="text-muted-foreground">No reputation data</div>
        </CardContent>
      </Card>
    );
  }

  const levelInfo = getLevelInfo(reputation.level);
  const progressToNext = levelInfo.nextThreshold 
    ? Math.min((reputation.points / levelInfo.nextThreshold) * 100, 100)
    : 100;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Badge className={`${levelInfo.color} text-white text-xs`}>
          {levelInfo.name}
        </Badge>
        <span className="text-sm text-muted-foreground">
          {reputation.points} pts
        </span>
      </div>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Award className="h-5 w-5" />
          Your Reputation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Level */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Badge className={`${levelInfo.color} text-white`}>
              {levelInfo.name} Level
            </Badge>
            <span className="text-2xl font-bold">{reputation.points}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {levelInfo.description}
          </p>
          
          {levelInfo.nextThreshold && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress to {Object.keys(getLevelInfo(''))[Object.values(getLevelInfo('')).findIndex(l => l.nextThreshold === levelInfo.nextThreshold) + 1]}</span>
                <span>{reputation.points} / {levelInfo.nextThreshold}</span>
              </div>
              <Progress value={progressToNext} className="h-2" />
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center space-y-1">
            <div className="flex items-center justify-center gap-1">
              <Star className="h-4 w-4 text-yellow-500" />
              <span className="text-2xl font-bold">{reputation.total_ratings}</span>
            </div>
            <p className="text-sm text-muted-foreground">Ratings Given</p>
          </div>
          
          <div className="text-center space-y-1">
            <div className="flex items-center justify-center gap-1">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span className="text-2xl font-bold">{reputation.helpful_votes}</span>
            </div>
            <p className="text-sm text-muted-foreground">Helpful Votes</p>
          </div>
        </div>

        {/* Point Breakdown */}
        <div className="space-y-2 pt-4 border-t">
          <h4 className="font-medium text-sm">Point Breakdown</h4>
          <div className="space-y-1 text-sm text-muted-foreground">
            <div className="flex justify-between">
              <span>Ratings given ({reputation.total_ratings} × 10 pts)</span>
              <span>{reputation.total_ratings * 10} pts</span>
            </div>
            <div className="flex justify-between">
              <span>Helpful votes ({reputation.helpful_votes} × 5 pts)</span>
              <span>{reputation.helpful_votes * 5} pts</span>
            </div>
            <div className="flex justify-between font-medium text-foreground border-t pt-1">
              <span>Total Points</span>
              <span>{reputation.points} pts</span>
            </div>
          </div>
        </div>

        {/* Gamification Elements */}
        {levelInfo.nextThreshold && (
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Keep Going!
            </h4>
            <p className="text-sm text-muted-foreground">
              You need {levelInfo.nextThreshold - reputation.points} more points to reach the next level.
            </p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Rate events, restaurants, and attractions (+10 pts each)</li>
              <li>• Write helpful reviews that get upvoted (+5 pts each)</li>
              <li>• Stay active and engaged with the community</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
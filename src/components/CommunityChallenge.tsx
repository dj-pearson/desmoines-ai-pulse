import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Calendar, Users, Trophy, Timer, Camera, MapPin } from "lucide-react";
import { CommunityChallenge as ChallengeType, useGamification } from "@/hooks/useGamification";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";

interface CommunityChallengeProps {
  challenge: ChallengeType;
}

const getChallengeIcon = (type: string) => {
  switch (type) {
    case 'photo_contest': return Camera;
    case 'explorer': return MapPin;
    case 'social': return Users;
    case 'review': return Trophy;
    default: return Trophy;
  }
};

const getChallengeTypeColor = (type: string) => {
  switch (type) {
    case 'photo_contest': return 'bg-pink-500';
    case 'explorer': return 'bg-green-500';
    case 'social': return 'bg-blue-500';
    case 'review': return 'bg-purple-500';
    default: return 'bg-gray-500';
  }
};

export function CommunityChallenge({ challenge }: CommunityChallengeProps) {
  const { joinChallenge } = useGamification();
  const { user } = useAuth();
  
  const IconComponent = getChallengeIcon(challenge.challenge_type);
  const typeColor = getChallengeTypeColor(challenge.challenge_type);
  
  const isExpired = new Date(challenge.end_date) < new Date();
  const isJoined = challenge.user_participation && challenge.user_participation.length > 0;
  const timeLeft = formatDistanceToNow(new Date(challenge.end_date), { addSuffix: true });
  
  const handleJoin = () => {
    if (user) {
      joinChallenge(challenge.id);
    }
  };

  return (
    <Card className={`relative ${isExpired ? 'opacity-60' : ''}`}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-10 h-10 rounded-full ${typeColor} flex items-center justify-center`}>
              <IconComponent className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">{challenge.title}</CardTitle>
              <Badge variant="secondary" className="mt-1">
                {challenge.challenge_type.replace('_', ' ')}
              </Badge>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Timer className="h-4 w-4" />
              {isExpired ? 'Ended' : timeLeft}
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <p className="text-muted-foreground">{challenge.description}</p>
        
        {/* Challenge Requirements */}
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Requirements:</h4>
          <div className="text-sm text-muted-foreground">
            {challenge.requirements.photos_required && (
              <div className="flex items-center gap-2">
                <Camera className="h-4 w-4" />
                Submit {challenge.requirements.photos_required} photo(s)
              </div>
            )}
            {challenge.requirements.venue_type && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Visit {challenge.requirements.venue_type}s
              </div>
            )}
            {challenge.requirements.theme && (
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                Theme: {challenge.requirements.theme.replace('_', ' ')}
              </div>
            )}
          </div>
        </div>

        {/* Rewards */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <Trophy className="h-4 w-4 text-yellow-500" />
            <span className="text-sm font-medium">{challenge.reward_points} XP</span>
          </div>
          {challenge.reward_badges && challenge.reward_badges.length > 0 && (
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="text-xs">
                +{challenge.reward_badges.length} Badge{challenge.reward_badges.length > 1 ? 's' : ''}
              </Badge>
            </div>
          )}
        </div>

        {/* Participation Stats */}
        {challenge.max_participants && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                Participants
              </span>
              <span>{challenge.user_participation?.length || 0} / {challenge.max_participants}</span>
            </div>
            <Progress 
              value={((challenge.user_participation?.length || 0) / challenge.max_participants) * 100} 
              className="h-2" 
            />
          </div>
        )}

        {/* Action Button */}
        <div className="pt-2">
          {isExpired ? (
            <Button disabled variant="secondary" className="w-full">
              Challenge Ended
            </Button>
          ) : isJoined ? (
            <Button disabled variant="default" className="w-full">
              Already Joined
            </Button>
          ) : !user ? (
            <Button disabled variant="outline" className="w-full">
              Sign in to Join
            </Button>
          ) : (
            <Button onClick={handleJoin} className="w-full">
              Join Challenge
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
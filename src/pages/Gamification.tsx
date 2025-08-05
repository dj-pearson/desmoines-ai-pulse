import { useAuth } from "@/hooks/useAuth";
import { useGamification } from "@/hooks/useGamification";
import { UserReputationDisplay } from "@/components/UserReputationDisplay";
import { BadgeCollection } from "@/components/BadgeCollection";
import { CommunityChallenge } from "@/components/CommunityChallenge";
import { Leaderboard } from "@/components/Leaderboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Trophy, Target, Users, Award, Star, Camera, MapPin, Share2 } from "lucide-react";

// Sample XP activities for demo
const XP_ACTIVITIES = [
  { 
    type: 'visit_restaurant', 
    points: 25, 
    label: 'Visit Restaurant', 
    icon: MapPin,
    description: 'Visit and check in at a restaurant'
  },
  { 
    type: 'write_review', 
    points: 50, 
    label: 'Write Review', 
    icon: Star,
    description: 'Write a helpful review'
  },
  { 
    type: 'upload_photo', 
    points: 30, 
    label: 'Upload Photo', 
    icon: Camera,
    description: 'Share a photo of your experience'
  },
  { 
    type: 'share_event', 
    points: 20, 
    label: 'Share Event', 
    icon: Share2,
    description: 'Share an event with friends'
  },
  { 
    type: 'attend_event', 
    points: 40, 
    label: 'Attend Event', 
    icon: Target,
    description: 'Attend a Des Moines event'
  }
];

export default function Gamification() {
  const { isAuthenticated, user } = useAuth();
  const { challenges, awardPoints, reputation } = useGamification();

  const handleTestXP = (activityType: string, points: number) => {
    if (user) {
      awardPoints(activityType, points, undefined, undefined, { demo: true });
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-16 text-center">
          <div className="max-w-2xl mx-auto space-y-6">
            <Trophy className="h-16 w-16 text-primary mx-auto" />
            <h1 className="text-4xl font-bold">Level Up Your Des Moines Experience</h1>
            <p className="text-xl text-muted-foreground">
              Earn XP, collect badges, and compete with other explorers as you discover the best of Des Moines!
            </p>
            
            <div className="grid md:grid-cols-2 gap-6 mt-8">
              <Card className="text-left">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-yellow-500" />
                    Earn Badges
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Complete challenges and milestones to unlock exclusive badges. From "Restaurant Explorer" to "Des Moines Legend"!
                  </p>
                </CardContent>
              </Card>
              
              <Card className="text-left">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-500" />
                    Community Challenges
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Join weekly photo contests, neighborhood explorations, and social challenges with the Des Moines community.
                  </p>
                </CardContent>
              </Card>
            </div>
            
            <Button asChild size="lg" className="mt-8">
              <a href="/auth">Sign In to Start Your Journey</a>
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">Your Des Moines Adventure</h1>
          <p className="text-xl text-muted-foreground">
            Level up by exploring, reviewing, and engaging with the Des Moines community
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          {/* User Progress - Updated to use new reputation system */}
          <div className="lg:col-span-2">
            {reputation && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5" />
                    Your Progress
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Level Display */}
                  <div className="text-center space-y-2">
                    <div className="flex items-center justify-center gap-2">
                      <Badge variant="default" className="bg-primary text-primary-foreground text-lg px-4 py-2">
                        Level {reputation.current_level}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">Des Moines Explorer</p>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>{reputation.current_level_progress} XP</span>
                      <span>{reputation.next_level_xp} XP to next level</span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-3">
                      <div 
                        className="bg-primary h-3 rounded-full transition-all duration-500"
                        style={{ 
                          width: `${Math.min((reputation.current_level_progress / reputation.next_level_xp) * 100, 100)}%` 
                        }}
                      />
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center space-y-1">
                      <div className="flex items-center justify-center gap-1">
                        <Star className="h-4 w-4 text-yellow-500" />
                        <span className="text-2xl font-bold">{reputation.experience_points}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">Total XP</p>
                    </div>
                    
                    <div className="text-center space-y-1">
                      <div className="flex items-center justify-center gap-1">
                        <Trophy className="h-4 w-4 text-blue-500" />
                        <span className="text-2xl font-bold">{reputation.total_badges}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">Badges Earned</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Earn XP</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {XP_ACTIVITIES.map((activity) => {
                const IconComponent = activity.icon;
                return (
                  <div key={activity.type} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <IconComponent className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{activity.label}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {activity.description}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      +{activity.points}
                    </Badge>
                  </div>
                );
              })}
              
              {/* Demo Button */}
              <div className="pt-4 border-t">
                <p className="text-xs text-muted-foreground mb-2">Demo mode - Test XP system:</p>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="w-full"
                  onClick={() => handleTestXP('demo_activity', 25)}
                >
                  +25 Demo XP
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="challenges" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="challenges">Challenges</TabsTrigger>
            <TabsTrigger value="badges">Badge Collection</TabsTrigger>
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          </TabsList>

          <TabsContent value="challenges" className="space-y-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {challenges.map((challenge) => (
                <CommunityChallenge key={challenge.id} challenge={challenge} />
              ))}
              
              {challenges.length === 0 && (
                <div className="col-span-full text-center py-12">
                  <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No active challenges right now.</p>
                  <p className="text-sm text-muted-foreground">Check back soon for new challenges!</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="badges">
            <BadgeCollection />
          </TabsContent>

          <TabsContent value="leaderboard">
            <Leaderboard />
          </TabsContent>
        </Tabs>
      </div>
      
      <Footer />
    </div>
  );
}
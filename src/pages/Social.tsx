import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSocialFeatures } from "@/hooks/useSocialFeatures";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { GroupEventPlanner } from "@/components/GroupEventPlannerSimple";
import { CommunityForums } from "@/components/CommunityForums";
import { EnhancedGroupPlanner } from "@/components/EnhancedGroupPlanner";
import TrendingContent from "@/components/TrendingContent";
import {
  Users,
  UserPlus,
  Calendar,
  MapPin,
  Star,
  TrendingUp,
  Heart,
  MessageSquare,
  Camera,
  Plus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Social() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [searchEmail, setSearchEmail] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const { friends, friendGroups, sendFriendRequest, acceptFriendRequest } =
    useSocialFeatures();

  const handleSendFriendRequest = async () => {
    if (!searchEmail.trim()) return;

    try {
      await sendFriendRequest(searchEmail);
      setSearchEmail("");
      toast({
        title: "Friend Request Sent!",
        description: `Friend request sent to ${searchEmail}`,
      });
    } catch (error) {
      toast({
        title: "Failed to Send Request",
        description: "Could not send friend request. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-16 text-center">
          <Breadcrumbs
            className="mb-4 text-left"
            items={[
              { label: "Home", href: "/" },
              { label: "Social" },
            ]}
          />
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
            Join the Social Experience
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Connect with friends, plan events together, and share your
            experiences
          </p>
          <Button asChild size="lg">
            <a href="/auth">Sign In to Get Started</a>
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: "Social" },
          ]}
        />

        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">Social Hub</h1>
          <p className="text-xl text-muted-foreground">
            Connect with friends and discover events together
          </p>
        </div>

        <Tabs defaultValue="friends" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5 h-auto gap-1">
            <TabsTrigger value="friends" className="text-xs sm:text-sm py-2">Friends</TabsTrigger>
            <TabsTrigger value="groups" className="text-xs sm:text-sm py-2">Groups</TabsTrigger>
            <TabsTrigger value="forums" className="text-xs sm:text-sm py-2">Forums</TabsTrigger>
            <TabsTrigger value="trending" className="text-xs sm:text-sm py-2">Trending</TabsTrigger>
            <TabsTrigger value="nearby" className="text-xs sm:text-sm py-2">Nearby</TabsTrigger>
          </TabsList>

          <TabsContent value="friends" className="space-y-6">
            {/* Add Friends Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5" />
                  Add Friends
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter friend's email"
                    value={searchEmail}
                    onChange={(e) => setSearchEmail(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={handleSendFriendRequest}>
                    Send Request
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Friends List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Your Friends ({friends?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {friends && friends.length > 0 ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {friends.map((friend) => (
                      <div
                        key={friend.id}
                        className="flex items-center gap-3 p-4 border rounded-lg"
                      >
                        <Avatar>
                          <AvatarFallback>
                            {friend.friend_profile?.first_name?.[0] || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="font-medium">
                            {friend.friend_profile?.first_name}{" "}
                            {friend.friend_profile?.last_name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {friend.friend_profile?.email}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    No friends yet. Start by sending some friend requests!
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="groups" className="space-y-6">
            {/* Your Groups */}
            <Card>
              <CardHeader>
                <CardTitle>Your Groups</CardTitle>
              </CardHeader>
              <CardContent>
                {friendGroups && friendGroups.length > 0 ? (
                  <div className="space-y-4">
                    {friendGroups.map((group) => (
                      <div
                        key={group.id}
                        className="p-4 border rounded-lg cursor-pointer hover:bg-muted"
                        onClick={() => setSelectedGroupId(group.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-medium">{group.name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {group.description}
                            </p>
                          </div>
                          <Badge
                            variant={group.is_public ? "default" : "secondary"}
                          >
                            {group.is_public ? "Public" : "Private"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    No groups yet. Join a group to start planning events with
                    friends!
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Enhanced Group Event Planner */}
            {selectedGroupId && (
              <EnhancedGroupPlanner
                groupId={selectedGroupId}
                groupName="Selected Group"
                onClose={() => setSelectedGroupId(null)}
              />
            )}
          </TabsContent>

          <TabsContent value="forums" className="space-y-6">
            <CommunityForums />
          </TabsContent>

          <TabsContent value="trending" className="space-y-6">
            {/* Trending Events */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                  Trending Events
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TrendingContent
                  contentType="event"
                  timeWindow="24h"
                  limit={6}
                  showPersonalized={true}
                />
              </CardContent>
            </Card>

            {/* Trending Restaurants */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-yellow-600" />
                  Hot Spots - Popular Restaurants
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TrendingContent
                  contentType="restaurant"
                  timeWindow="7d"
                  limit={6}
                  showPersonalized={true}
                />
              </CardContent>
            </Card>

            {/* Trending Attractions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="h-5 w-5 text-purple-600" />
                  Most Visited Attractions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TrendingContent
                  contentType="attraction"
                  timeWindow="7d"
                  limit={6}
                  showPersonalized={true}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="nearby" className="space-y-6">
            {/* Friend Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Heart className="h-5 w-5 text-red-500" />
                  Friends' Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                {friends && friends.length > 0 ? (
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground mb-4">
                      See what your friends are interested in and attending
                    </div>
                    <div className="space-y-3">
                      {friends.slice(0, 5).map((friend) => (
                        <div
                          key={friend.id}
                          className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50"
                        >
                          <Avatar>
                            <AvatarFallback>
                              {friend.friend_profile?.first_name?.[0] || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="font-medium text-sm">
                              {friend.friend_profile?.first_name}{" "}
                              {friend.friend_profile?.last_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Recently saved events in Des Moines
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            Active
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">
                      Add friends to see their activity and interests
                    </p>
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => {
                        const friendsTab = document.querySelector('[value="friends"]') as HTMLElement;
                        friendsTab?.click();
                      }}
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add Friends
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Nearby Events */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-green-600" />
                  Events Near You
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <p className="text-sm text-muted-foreground">
                    Discover events happening in your area that your friends might enjoy
                  </p>
                </div>
                <TrendingContent
                  contentType="event"
                  timeWindow="7d"
                  limit={6}
                  showPersonalized={true}
                />
              </CardContent>
            </Card>

            {/* Location-Based Recommendations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  Popular in Des Moines
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="p-4 border rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="h-5 w-5 text-blue-600" />
                      <h4 className="font-semibold">This Weekend</h4>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Top events happening this weekend
                    </p>
                    <Button asChild variant="outline" size="sm" className="w-full">
                      <a href="/events/this-weekend">
                        View Weekend Events
                      </a>
                    </Button>
                  </div>

                  <div className="p-4 border rounded-lg bg-gradient-to-br from-green-50 to-emerald-50">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="h-5 w-5 text-green-600" />
                      <h4 className="font-semibold">Nearby Attractions</h4>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      Popular places to visit in your area
                    </p>
                    <Button asChild variant="outline" size="sm" className="w-full">
                      <a href="/attractions">
                        Browse Attractions
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Footer />
    </div>
  );
}

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
import { GroupEventPlanner } from "@/components/GroupEventPlanner";
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

  const {
    friends,
    friendGroups,
    sendFriendRequest,
    acceptFriendRequest,
  } = useSocialFeatures();

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
          <h1 className="text-4xl font-bold mb-4">Join the Social Experience</h1>
          <p className="text-xl text-muted-foreground mb-8">
            Connect with friends, plan events together, and share your experiences
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
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">Social Hub</h1>
          <p className="text-xl text-muted-foreground">
            Connect with friends and discover events together
          </p>
        </div>

        <Tabs defaultValue="friends" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="friends">Friends</TabsTrigger>
            <TabsTrigger value="groups">Groups</TabsTrigger>
            <TabsTrigger value="trending">Trending</TabsTrigger>
            <TabsTrigger value="nearby">Friends Nearby</TabsTrigger>
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
                  <Button 
                    onClick={handleSendFriendRequest}
                  >
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
                      <div key={friend.id} className="flex items-center gap-3 p-4 border rounded-lg">
                          <Avatar>
                            <AvatarFallback>
                              {friend.friend_profile?.first_name?.[0] || 'U'}
                            </AvatarFallback>
                          </Avatar>
                        <div className="flex-1">
                          <p className="font-medium">
                            {friend.friend_profile?.first_name} {friend.friend_profile?.last_name}
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
                          <Badge variant={group.is_public ? "default" : "secondary"}>
                            {group.is_public ? "Public" : "Private"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    No groups yet. Join a group to start planning events with friends!
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Group Event Planner */}
            {selectedGroupId && (
              <GroupEventPlanner 
                group={{ 
                  id: selectedGroupId, 
                  name: "Selected Group", 
                  member_count: 1 
                }} 
                onClose={() => setSelectedGroupId(null)}
              />
            )}
          </TabsContent>

          <TabsContent value="trending" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Coming Soon: Trending Events
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  Trending events feature coming soon! This will show the most popular events based on user interest.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="nearby" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Coming Soon: Friends Near Events
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  Friends near events feature coming soon! This will show when your friends are attending events near you.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      
      <Footer />
    </div>
  );
}
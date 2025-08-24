import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useCommunityFeatures } from "@/hooks/useCommunityFeatures";
import { useEvents } from "@/hooks/useEvents";
import { 
  Users, 
  Calendar, 
  MapPin,
  CheckCircle,
  XCircle,
  Clock,
  PlusCircle,
  MessageCircle,
  Camera,
  Share2,
  Star
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface EnhancedGroupPlannerProps {
  groupId: string;
  groupName: string;
  onClose: () => void;
}

export function EnhancedGroupPlanner({ groupId, groupName, onClose }: EnhancedGroupPlannerProps) {
  const { user } = useAuth();
  const { friends } = useCommunityFeatures();
  const { events } = useEvents({ limit: 10 });
  
  const [selectedEvents, setSelectedEvents] = useState<any[]>([]);
  const [votes, setVotes] = useState<Record<string, Record<string, string>>>({});
  const [notes, setNotes] = useState('');
  const [invitedMembers, setInvitedMembers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  const filteredEvents = events.filter(event =>
    event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    event.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const addEventToPlanning = (event: any) => {
    if (selectedEvents.find(e => e.id === event.id)) {
      toast.error('Event already added to planning');
      return;
    }
    
    setSelectedEvents(prev => [...prev, event]);
    toast.success(`Added "${event.title}" to group planning`);
  };

  const removeEventFromPlanning = (eventId: string) => {
    setSelectedEvents(prev => prev.filter(e => e.id !== eventId));
    // Also remove votes for this event
    setVotes(prev => {
      const newVotes = { ...prev };
      delete newVotes[eventId];
      return newVotes;
    });
  };

  const voteOnEvent = (eventId: string, vote: 'yes' | 'no' | 'maybe') => {
    if (!user) return;

    setVotes(prev => ({
      ...prev,
      [eventId]: {
        ...prev[eventId],
        [user.id]: vote
      }
    }));

    toast.success(`Voted "${vote}" on event`);
  };

  const getVoteCounts = (eventId: string) => {
    const eventVotes = votes[eventId] || {};
    return {
      yes: Object.values(eventVotes).filter(v => v === 'yes').length,
      no: Object.values(eventVotes).filter(v => v === 'no').length,
      maybe: Object.values(eventVotes).filter(v => v === 'maybe').length
    };
  };

  const getUserVote = (eventId: string) => {
    if (!user) return null;
    return votes[eventId]?.[user.id] || null;
  };

  const inviteFriend = (friend: any) => {
    if (invitedMembers.find(m => m.id === friend.friend_id)) {
      toast.error('Friend already invited');
      return;
    }
    
    setInvitedMembers(prev => [...prev, {
      id: friend.friend_id,
      name: `${friend.friend_profile?.first_name || ''} ${friend.friend_profile?.last_name || ''}`.trim() || 'Friend',
      email: friend.friend_profile?.email
    }]);
    toast.success('Friend invited to group planning');
  };

  const shareEventPlan = () => {
    if (selectedEvents.length === 0) {
      toast.error('No events selected to share');
      return;
    }

    const eventList = selectedEvents.map(event => 
      `• ${event.title} - ${new Date(event.date).toLocaleDateString()}`
    ).join('\n');
    
    const shareText = `Check out our group event plan for ${groupName}:\n\n${eventList}\n\nNotes: ${notes || 'None'}`;
    
    if (navigator.share) {
      navigator.share({
        title: `${groupName} Event Plan`,
        text: shareText
      });
    } else {
      navigator.clipboard.writeText(shareText);
      toast.success('Event plan copied to clipboard!');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-6xl max-h-[90vh] overflow-hidden">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                {groupName} - Enhanced Event Planning
              </CardTitle>
              <Badge variant="secondary">
                {selectedEvents.length} events selected
              </Badge>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={shareEventPlan}
                className="gap-2"
                disabled={selectedEvents.length === 0}
              >
                <Share2 className="w-4 h-4" />
                Share Plan
              </Button>
              <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <PlusCircle className="w-4 h-4" />
                    Invite Friends
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invite Friends to Planning</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    {friends.length > 0 ? (
                      <div className="space-y-2">
                        {friends.map((friend) => (
                          <div key={friend.id} className="flex items-center justify-between p-2 border rounded">
                            <div className="flex items-center gap-2">
                              <Avatar className="w-8 h-8">
                                <AvatarFallback>
                                  {friend.friend_profile?.first_name?.[0] || 'F'}
                                </AvatarFallback>
                              </Avatar>
                              <span>
                                {friend.friend_profile?.first_name} {friend.friend_profile?.last_name}
                              </span>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => inviteFriend(friend)}
                              disabled={invitedMembers.find(m => m.id === friend.friend_id)}
                            >
                              {invitedMembers.find(m => m.id === friend.friend_id) ? 'Invited' : 'Invite'}
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-center py-4">
                        No friends to invite. Add some friends first!
                      </p>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Tabs defaultValue="search" className="h-[70vh]">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="search">Find Events</TabsTrigger>
              <TabsTrigger value="selected">Selected Events</TabsTrigger>
              <TabsTrigger value="notes">Group Notes</TabsTrigger>
              <TabsTrigger value="members">Members</TabsTrigger>
            </TabsList>

            <TabsContent value="search" className="h-full overflow-y-auto p-6">
              <div className="space-y-4">
                <div>
                  <Input
                    placeholder="Search events by title or location..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="mb-4"
                  />
                </div>

                <div className="grid gap-4">
                  {filteredEvents.map((event) => (
                    <Card key={event.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-medium mb-2">{event.title}</h3>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {formatDate(event.date)}
                              </span>
                              {event.venue && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-4 h-4" />
                                  {event.venue}
                                </span>
                              )}
                            </div>
                            {event.enhanced_description && (
                              <p className="text-sm line-clamp-2 mb-2">
                                {event.enhanced_description}
                              </p>
                            )}
                            <Badge variant="secondary">{event.category}</Badge>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => addEventToPlanning(event)}
                            disabled={selectedEvents.find(e => e.id === event.id)}
                            className="gap-2"
                          >
                            <PlusCircle className="w-4 h-4" />
                            {selectedEvents.find(e => e.id === event.id) ? 'Added' : 'Add'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="selected" className="h-full overflow-y-auto p-6">
              <div className="space-y-4">
                {selectedEvents.length > 0 ? (
                  selectedEvents.map((event) => {
                    const voteCounts = getVoteCounts(event.id);
                    const userVote = getUserVote(event.id);
                    const totalVotes = voteCounts.yes + voteCounts.no + voteCounts.maybe;
                    
                    return (
                      <Card key={event.id}>
                        <CardContent className="p-4">
                          <div className="space-y-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h3 className="font-medium mb-2">{event.title}</h3>
                                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-4 h-4" />
                                    {formatDate(event.date)}
                                  </span>
                                  {event.venue && (
                                    <span className="flex items-center gap-1">
                                      <MapPin className="w-4 h-4" />
                                      {event.venue}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => removeEventFromPlanning(event.id)}
                              >
                                Remove
                              </Button>
                            </div>
                            
                            {/* Voting Section */}
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">Group Vote:</span>
                                {totalVotes > 0 && (
                                  <Badge variant="outline">
                                    {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
                                  </Badge>
                                )}
                              </div>
                              
                              <div className="grid grid-cols-3 gap-2">
                                <Button
                                  size="sm"
                                  variant={userVote === 'yes' ? 'default' : 'outline'}
                                  onClick={() => voteOnEvent(event.id, 'yes')}
                                  className="gap-2"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                  Yes ({voteCounts.yes})
                                </Button>
                                <Button
                                  size="sm"
                                  variant={userVote === 'maybe' ? 'default' : 'outline'}
                                  onClick={() => voteOnEvent(event.id, 'maybe')}
                                  className="gap-2"
                                >
                                  <Clock className="w-4 h-4" />
                                  Maybe ({voteCounts.maybe})
                                </Button>
                                <Button
                                  size="sm"
                                  variant={userVote === 'no' ? 'destructive' : 'outline'}
                                  onClick={() => voteOnEvent(event.id, 'no')}
                                  className="gap-2"
                                >
                                  <XCircle className="w-4 h-4" />
                                  No ({voteCounts.no})
                                </Button>
                              </div>
                              
                              {/* Vote Summary */}
                              {totalVotes > 0 && (
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                  <div className="flex items-center gap-1">
                                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                    {Math.round((voteCounts.yes / totalVotes) * 100)}% Yes
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                                    {Math.round((voteCounts.maybe / totalVotes) * 100)}% Maybe
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                    {Math.round((voteCounts.no / totalVotes) * 100)}% No
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                ) : (
                  <div className="text-center py-12">
                    <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">No events selected yet</p>
                    <p className="text-sm text-muted-foreground">Go to "Find Events" to add some to your planning session</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="notes" className="h-full p-6">
              <div className="h-full flex flex-col">
                <div className="flex items-center gap-2 mb-4">
                  <MessageCircle className="w-5 h-5" />
                  <h3 className="font-medium">Group Planning Notes</h3>
                </div>
                <Textarea
                  placeholder="Add notes, ideas, or plans for your group events..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="flex-1 resize-none"
                  rows={20}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Notes are saved locally for this planning session
                </p>
              </div>
            </TabsContent>

            <TabsContent value="members" className="h-full overflow-y-auto p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Planning Members</h3>
                  <Badge variant="secondary">
                    {invitedMembers.length + 1} member{invitedMembers.length !== 0 ? 's' : ''}
                  </Badge>
                </div>

                <div className="space-y-3">
                  {/* Current user */}
                  <div className="flex items-center gap-3 p-3 border rounded-lg">
                    <Avatar>
                      <AvatarFallback>You</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium">You (Organizer)</p>
                      <p className="text-sm text-muted-foreground">{user?.email}</p>
                    </div>
                    <Badge>Organizer</Badge>
                  </div>

                  {/* Invited members */}
                  {invitedMembers.map((member) => (
                    <div key={member.id} className="flex items-center gap-3 p-3 border rounded-lg">
                      <Avatar>
                        <AvatarFallback>{member.name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium">{member.name}</p>
                        <p className="text-sm text-muted-foreground">{member.email}</p>
                      </div>
                      <Badge variant="secondary">Invited</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
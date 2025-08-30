import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEventSocialConnections } from '@/hooks/useEventSocialConnections';
import { useAuth } from '@/hooks/useAuth';
import {
  Users,
  UserPlus,
  MapPin,
  Send,
  Check,
  X,
  Calendar,
  MessageCircle,
} from 'lucide-react';

interface EventFriendFinderProps {
  eventId: string;
  eventTitle: string;
  eventLatitude?: number;
  eventLongitude?: number;
}

export function EventFriendFinder({ 
  eventId, 
  eventTitle, 
  eventLatitude, 
  eventLongitude 
}: EventFriendFinderProps) {
  const { user } = useAuth();
  const {
    friendsNearEvent,
    attendingFriends,
    eventInvitations,
    isLoading,
    sendEventInvitation,
    respondToInvitation,
  } = useEventSocialConnections(eventId, eventLatitude, eventLongitude);

  const [inviteMessage, setInviteMessage] = useState('');
  const [selectedFriend, setSelectedFriend] = useState<string | null>(null);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);

  const handleSendInvitation = async () => {
    if (!selectedFriend) return;

    await sendEventInvitation(selectedFriend, inviteMessage);
    setInviteMessage('');
    setSelectedFriend(null);
    setIsInviteDialogOpen(false);
  };

  const openInviteDialog = (friendId: string) => {
    setSelectedFriend(friendId);
    setInviteMessage(`Hey! I thought you might be interested in ${eventTitle}. Want to join me?`);
    setIsInviteDialogOpen(true);
  };

  if (!user) return null;

  const pendingInvitations = eventInvitations.filter(inv => 
    inv.invitee_id === user.id && inv.status === 'pending'
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Users className="h-5 w-5 mr-2" />
          Social Connections
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Pending Invitations */}
        {pendingInvitations.length > 0 && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="font-medium text-blue-900 mb-3 flex items-center">
              <Calendar className="h-4 w-4 mr-2" />
              Event Invitations ({pendingInvitations.length})
            </h4>
            <div className="space-y-3">
              {pendingInvitations.map((invitation) => (
                <div key={invitation.id} className="flex items-center justify-between p-3 bg-white rounded border">
                  <div className="flex-1">
                    <p className="text-sm font-medium">Invitation to {eventTitle}</p>
                    {invitation.message && (
                      <p className="text-xs text-muted-foreground mt-1">{invitation.message}</p>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      size="sm"
                      onClick={() => respondToInvitation(invitation.id, 'accepted')}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Accept
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => respondToInvitation(invitation.id, 'declined')}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <Tabs defaultValue="attending" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="attending">
              Friends Going ({attendingFriends.length})
            </TabsTrigger>
            <TabsTrigger value="nearby">
              Nearby Friends ({friendsNearEvent.length})
            </TabsTrigger>
            <TabsTrigger value="invite">
              Invite Friends
            </TabsTrigger>
          </TabsList>

          <TabsContent value="attending" className="space-y-3">
            {attendingFriends.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                None of your friends are attending yet
              </p>
            ) : (
              <div className="space-y-3">
                {attendingFriends.map((friend) => (
                  <div key={friend.friend_id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{friend.friend_name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{friend.friend_name}</p>
                        <p className="text-xs text-muted-foreground">Your friend</p>
                      </div>
                    </div>
                    <Badge 
                      variant={friend.status === 'going' ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {friend.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="nearby" className="space-y-3">
            {!eventLatitude || !eventLongitude ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Event location not available for friend discovery
              </p>
            ) : friendsNearEvent.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No friends found near this event location
              </p>
            ) : (
              <div className="space-y-3">
                {friendsNearEvent.map((friend) => (
                  <div key={friend.friend_id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{friend.friend_name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{friend.friend_name}</p>
                        <p className="text-xs text-muted-foreground flex items-center">
                          <MapPin className="h-3 w-3 mr-1" />
                          {Math.round(friend.distance_km)}km away
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => openInviteDialog(friend.friend_id)}
                      className="flex items-center"
                    >
                      <UserPlus className="h-3 w-3 mr-1" />
                      Invite
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="invite" className="space-y-3">
            <div className="text-center py-8">
              <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-4">
                Friends list feature coming soon!
              </p>
              <p className="text-xs text-muted-foreground">
                Connect with friends to invite them to events
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Invite Dialog */}
        <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Friend to Event</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Personal Message</label>
                <Textarea
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                  placeholder="Add a personal message to your invitation..."
                  rows={3}
                  className="mt-2"
                />
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setIsInviteDialogOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSendInvitation}
                  className="flex-1"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Send Invitation
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Users, 
  UserPlus, 
  UserMinus, 
  Crown, 
  Shield,
  Mail,
  Check,
  X
} from "lucide-react";

interface GroupInviteManagerProps {
  groupId: string;
  groupName: string;
  onClose: () => void;
}

interface GroupMember {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profiles?: {
    first_name?: string;
    last_name?: string;
    email?: string;
  };
}

interface Friend {
  id: string;
  friend_id: string;
  friend_profile?: {
    first_name?: string;
    last_name?: string;
    email?: string;
  };
}

export function GroupInviteManager({ groupId, groupName, onClose }: GroupInviteManagerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadMembers();
    loadFriends();
  }, [groupId]);

  const loadMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('friend_group_members')
        .select('*')
        .eq('group_id', groupId);

      if (error) throw error;
      
      // Get profile info for each member
      const membersWithProfiles = await Promise.all(
        (data || []).map(async (member) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('first_name, last_name, email')
            .eq('user_id', member.user_id)
            .single();
          
          return {
            ...member,
            profiles: profile || { first_name: '', last_name: '', email: '' }
          };
        })
      );
      
      setMembers(membersWithProfiles);
    } catch (error) {
      console.error('Error loading members:', error);
    }
  };

  const loadFriends = async () => {
    try {
      const { data, error } = await supabase
        .from('user_friends')
        .select('*')
        .eq('user_id', user?.id)
        .eq('status', 'accepted');

      if (error) throw error;
      
      // Get profile info for each friend and filter out existing members
      const memberUserIds = members.map(m => m.user_id);
      const friendsWithProfiles = await Promise.all(
        (data || [])
          .filter(friend => !memberUserIds.includes(friend.friend_id))
          .map(async (friend) => {
            const { data: profile } = await supabase
              .from('profiles')
              .select('first_name, last_name, email')
              .eq('user_id', friend.friend_id)
              .single();
            
            return {
              ...friend,
              friend_profile: profile || { first_name: '', last_name: '', email: '' }
            };
          })
      );
      
      setFriends(friendsWithProfiles);
    } catch (error) {
      console.error('Error loading friends:', error);
    }
  };

  const inviteFriend = async (friendId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('friend_group_members')
        .insert({
          group_id: groupId,
          user_id: friendId,
          role: 'member'
        });

      if (error) throw error;

      toast({
        title: "Friend Invited!",
        description: "Your friend has been added to the group.",
      });

      loadMembers();
      loadFriends();
    } catch (error) {
      console.error('Error inviting friend:', error);
      toast({
        title: "Failed to Invite",
        description: "Could not invite friend. They may already be in the group.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const removeMember = async (memberId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('friend_group_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      toast({
        title: "Member Removed",
        description: "The member has been removed from the group.",
      });

      loadMembers();
      loadFriends();
    } catch (error) {
      console.error('Error removing member:', error);
      toast({
        title: "Failed to Remove",
        description: "Could not remove member. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateMemberRole = async (memberId: string, newRole: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('friend_group_members')
        .update({ role: newRole })
        .eq('id', memberId);

      if (error) throw error;

      toast({
        title: "Role Updated",
        description: `Member role has been updated to ${newRole}.`,
      });

      loadMembers();
    } catch (error) {
      console.error('Error updating role:', error);
      toast({
        title: "Failed to Update Role",
        description: "Could not update member role. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const isCurrentUserAdmin = () => {
    return members.some(m => m.user_id === user?.id && m.role === 'admin');
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Manage {groupName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 overflow-auto">
          {/* Current Members */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Current Members ({members.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>
                          {member.profiles?.first_name?.[0] || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">
                          {member.profiles?.first_name} {member.profiles?.last_name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {member.profiles?.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={member.role === 'admin' ? 'default' : 'secondary'}>
                        {member.role === 'admin' && <Crown className="h-3 w-3 mr-1" />}
                        {member.role}
                      </Badge>
                      {isCurrentUserAdmin() && member.user_id !== user?.id && (
                        <div className="flex items-center gap-1">
                          {member.role === 'member' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateMemberRole(member.id, 'admin')}
                              disabled={loading}
                            >
                              <Shield className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => removeMember(member.id)}
                            disabled={loading}
                          >
                            <UserMinus className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Invite Friends */}
          {friends.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Invite Friends ({friends.length} available)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {friends.map((friend) => (
                    <div key={friend.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>
                            {friend.friend_profile?.first_name?.[0] || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">
                            {friend.friend_profile?.first_name} {friend.friend_profile?.last_name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {friend.friend_profile?.email}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => inviteFriend(friend.friend_id)}
                        disabled={loading}
                      >
                        <UserPlus className="h-3 w-3 mr-1" />
                        Invite
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Invite by Email */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Invite by Email</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter email address"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="flex-1"
                />
                <Button
                  onClick={() => {
                    toast({
                      title: "Feature Coming Soon!",
                      description: "Email invitations will be available soon.",
                    });
                    setInviteEmail("");
                  }}
                  disabled={loading}
                >
                  <Mail className="h-3 w-3 mr-1" />
                  Send Invite
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Send an invitation to someone who isn't on your friends list yet
              </p>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
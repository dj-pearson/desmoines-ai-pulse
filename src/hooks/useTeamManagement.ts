import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "./use-toast";
import { createLogger } from '@/lib/logger';

const log = createLogger('useTeamManagement');

export interface TeamMember {
  id: string;
  campaignOwnerId: string;
  teamMemberEmail: string;
  teamMemberId: string | null;
  role: "owner" | "admin" | "editor" | "viewer";
  invitationStatus: "pending" | "accepted" | "declined" | "expired";
  invitedAt: string;
  acceptedAt: string | null;
  expiresAt: string;
}

export function useTeamManagement(campaignOwnerId?: string) {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (campaignOwnerId) {
      fetchTeamMembers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignOwnerId]);

  const fetchTeamMembers = async () => {
    if (!campaignOwnerId) return;

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("campaign_team_members")
        .select("*")
        .eq("campaign_owner_id", campaignOwnerId)
        .order("invited_at", { ascending: false });

      if (error) throw error;

      setTeamMembers((data as TeamMember[]) || []);
    } catch (err) {
      log.error("Error fetching team members", { action: 'fetchTeamMembers', metadata: { error: err } });
      toast({
        variant: "destructive",
        title: "Failed to fetch team members",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const inviteTeamMember = async (email: string, role: "admin" | "editor" | "viewer"): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if already invited
      const { data: existing } = await supabase
        .from("campaign_team_members")
        .select("id")
        .eq("campaign_owner_id", user.id)
        .eq("team_member_email", email)
        .single();

      if (existing) {
        toast({
          variant: "destructive",
          title: "Already invited",
          description: "This email has already been invited to your team.",
        });
        return false;
      }

      // Generate invitation token
      const invitationToken = `invite_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      // Set expiration to 7 days from now
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { error } = await supabase
        .from("campaign_team_members")
        .insert({
          campaign_owner_id: user.id,
          team_member_email: email,
          role,
          invitation_status: "pending",
          invitation_token: invitationToken,
          expires_at: expiresAt,
        });

      if (error) throw error;

      toast({
        title: "Invitation sent",
        description: `An invitation has been sent to ${email}.`,
      });

      await fetchTeamMembers();
      return true;
    } catch (err) {
      log.error("Error inviting team member", { action: 'inviteTeamMember', metadata: { error: err } });
      toast({
        variant: "destructive",
        title: "Failed to send invitation",
        description: err instanceof Error ? err.message : "Unknown error",
      });
      return false;
    }
  };

  const resendInvitation = async (memberId: string): Promise<boolean> => {
    try {
      // Update expiration to 7 days from now
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { error } = await supabase
        .from("campaign_team_members")
        .update({
          expires_at: expiresAt,
          invitation_status: "pending",
        })
        .eq("id", memberId);

      if (error) throw error;

      toast({
        title: "Invitation resent",
        description: "The invitation has been resent with a new expiration date.",
      });

      await fetchTeamMembers();
      return true;
    } catch (err) {
      log.error("Error resending invitation", { action: 'resendInvitation', metadata: { error: err } });
      toast({
        variant: "destructive",
        title: "Failed to resend invitation",
        description: err instanceof Error ? err.message : "Unknown error",
      });
      return false;
    }
  };

  const updateMemberRole = async (memberId: string, role: "admin" | "editor" | "viewer"): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("campaign_team_members")
        .update({ role })
        .eq("id", memberId);

      if (error) throw error;

      toast({
        title: "Role updated",
        description: "Team member role has been updated successfully.",
      });

      await fetchTeamMembers();
      return true;
    } catch (err) {
      log.error("Error updating role", { action: 'updateMemberRole', metadata: { error: err } });
      toast({
        variant: "destructive",
        title: "Failed to update role",
        description: err instanceof Error ? err.message : "Unknown error",
      });
      return false;
    }
  };

  const removeMember = async (memberId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("campaign_team_members")
        .delete()
        .eq("id", memberId);

      if (error) throw error;

      toast({
        title: "Member removed",
        description: "Team member has been removed from your team.",
      });

      await fetchTeamMembers();
      return true;
    } catch (err) {
      log.error("Error removing member", { action: 'removeMember', metadata: { error: err } });
      toast({
        variant: "destructive",
        title: "Failed to remove member",
        description: err instanceof Error ? err.message : "Unknown error",
      });
      return false;
    }
  };

  const acceptInvitation = async (token: string): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Find invitation by token
      const { data: invitation, error: findError } = await supabase
        .from("campaign_team_members")
        .select("*")
        .eq("invitation_token", token)
        .single();

      if (findError || !invitation) {
        throw new Error("Invalid invitation token");
      }

      // Check if expired
      if (new Date(invitation.expires_at) < new Date()) {
        throw new Error("Invitation has expired");
      }

      // Update invitation
      const { error } = await supabase
        .from("campaign_team_members")
        .update({
          team_member_id: user.id,
          invitation_status: "accepted",
          accepted_at: new Date().toISOString(),
        })
        .eq("invitation_token", token);

      if (error) throw error;

      toast({
        title: "Invitation accepted",
        description: "You have successfully joined the team.",
      });

      return true;
    } catch (err) {
      log.error("Error accepting invitation", { action: 'acceptInvitation', metadata: { error: err } });
      toast({
        variant: "destructive",
        title: "Failed to accept invitation",
        description: err instanceof Error ? err.message : "Unknown error",
      });
      return false;
    }
  };

  return {
    teamMembers,
    isLoading,
    inviteTeamMember,
    resendInvitation,
    updateMemberRole,
    removeMember,
    acceptInvitation,
    refetch: fetchTeamMembers,
  };
}

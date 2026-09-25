import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "./use-toast";
import { handleError, ErrorSeverity } from "@/lib/errorHandler";

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

const TEAM_COLUMNS =
  "id, campaign_owner_id, team_member_email, team_member_id, role, invitation_status, invited_at, accepted_at, expires_at";

interface TeamMemberRow {
  id: string;
  campaign_owner_id: string;
  team_member_email: string;
  team_member_id: string | null;
  role: string;
  invitation_status: string;
  invited_at: string;
  accepted_at: string | null;
  expires_at: string;
}

/**
 * The table is snake_case and the page reads camelCase. This used to be a
 * cast (`data as TeamMember[]`), which type-checked and rendered every row
 * blank, because `teamMemberEmail` was never on the object.
 */
export function toTeamMember(row: TeamMemberRow): TeamMember {
  return {
    id: row.id,
    campaignOwnerId: row.campaign_owner_id,
    teamMemberEmail: row.team_member_email,
    teamMemberId: row.team_member_id,
    role: row.role as TeamMember["role"],
    invitationStatus: row.invitation_status as TeamMember["invitationStatus"],
    invitedAt: row.invited_at,
    acceptedAt: row.accepted_at,
    expiresAt: row.expires_at,
  };
}

/**
 * NOTHING SENDS EMAIL AND NOTHING GRANTS ACCESS. An invitation is a row in
 * campaign_team_members; no function mails it and no policy or RPC lets the
 * invitee see the owner's campaigns (business plan D13). The copy below says
 * that instead of "Invitation sent".
 */
export function useTeamManagement(campaignOwnerId?: string) {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // WEB-QA-031: the fetch toasted and left teamMembers as [], so the page
  // rendered "No team members yet" to someone who may well have several. A
  // toast is gone in five seconds; the empty state is what stays on screen.
  const [error, setError] = useState<unknown>(null);
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
      setError(null);
      const { data, error } = await supabase
        .from("campaign_team_members")
        .select(TEAM_COLUMNS)
        .eq("campaign_owner_id", campaignOwnerId)
        .order("invited_at", { ascending: false });

      if (error) throw error;

      setTeamMembers(((data ?? []) as TeamMemberRow[]).map(toTeamMember));
    } catch (err) {
      setError(err);
      handleError(err, { component: "useTeamManagement", action: "fetch" }, ErrorSeverity.WARNING);
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
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      // An auth read that FAILED and a user who is genuinely signed out both
      // produced "Not authenticated", which sends a signed-in person to the
      // login screen for a network blip.
      if (authError) throw new Error(`Could not verify your session: ${authError.message}`);
      if (!user) throw new Error("Not authenticated");

      // Check if already invited.
      //
      // PGRST116 IS THE SUCCESS CASE HERE - .single() reports "no rows" as an
      // error, and no rows is exactly what "not yet invited" looks like. Any
      // OTHER error used to land in the same place, because the result was
      // destructured without `error`: existing came back null and a second
      // invitation was created, with a second token, for someone who already
      // had one. The guard has to tell the two apart or it is not a guard.
      const { data: existing, error: existingError } = await supabase
        .from("campaign_team_members")
        .select("id")
        .eq("campaign_owner_id", user.id)
        .eq("team_member_email", email)
        .single();

      if (existingError && existingError.code !== "PGRST116") {
        throw new Error(`Could not check existing invitations: ${existingError.message}`);
      }

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
        title: "Invitation saved",
        description: "No email goes out yet, and team access isn't switched on, so they can't see your campaigns yet.",
      });

      await fetchTeamMembers();
      return true;
    } catch (err) {
      handleError(err, { component: "useTeamManagement", action: "invite" }, ErrorSeverity.WARNING);
      toast({
        variant: "destructive",
        title: "Couldn't save the invitation",
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
        title: "Invitation renewed",
        description: "It now expires in 7 days. No email goes out yet; tell them yourself.",
      });

      await fetchTeamMembers();
      return true;
    } catch (err) {
      handleError(err, { component: "useTeamManagement", action: "renew" }, ErrorSeverity.WARNING);
      toast({
        variant: "destructive",
        title: "Couldn't renew the invitation",
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
      handleError(err, { component: "useTeamManagement", action: "update-role" }, ErrorSeverity.WARNING);
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
      handleError(err, { component: "useTeamManagement", action: "remove" }, ErrorSeverity.WARNING);
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
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      // An auth read that FAILED and a user who is genuinely signed out both
      // produced "Not authenticated", which sends a signed-in person to the
      // login screen for a network blip.
      if (authError) throw new Error(`Could not verify your session: ${authError.message}`);
      if (!user) throw new Error("Not authenticated");

      // Find invitation by token
      const { data: invitation, error: findError } = await supabase
        .from("campaign_team_members")
        .select("id, expires_at")
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
      handleError(err, { component: "useTeamManagement", action: "accept" }, ErrorSeverity.WARNING);
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
    error,
    inviteTeamMember,
    resendInvitation,
    updateMemberRole,
    removeMember,
    acceptInvitation,
    refetch: fetchTeamMembers,
  };
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, MoreVertical, RefreshCw, Shield, Trash2, UserPlus } from "lucide-react";
import { BusinessLayout } from "@/components/business/BusinessLayout";
import SEOHead from "@/components/SEOHead";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useTeamManagement, type TeamMember } from "@/hooks/useTeamManagement";
import { BUSINESS_CONTACT_EMAIL, BUSINESS_CONTACT_HREF } from "@/lib/businessCopy";

type InviteRole = "admin" | "editor" | "viewer";

const ROLE_LABELS: Record<TeamMember["role"], string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

const STATUS_LABELS: Record<TeamMember["invitationStatus"], string> = {
  pending: "Not accepted",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};

/** Badge variants built on theme token pairs, so the text keeps 4.5:1 in both themes. */
const STATUS_VARIANT: Record<TeamMember["invitationStatus"], "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  accepted: "default",
  declined: "secondary",
  expired: "secondary",
};

function isInviteRole(value: string): value is InviteRole {
  return value === "admin" || value === "editor" || value === "viewer";
}

function formatDay(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : format(d, "MMM d, yyyy");
}

export default function TeamManagement() {
  const { user } = useAuth();
  const { teamMembers, isLoading, error, refetch, inviteTeamMember, resendInvitation, updateMemberRole, removeMember } =
    useTeamManagement(user?.id);

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("viewer");
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [newRole, setNewRole] = useState<InviteRole>("viewer");
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    const ok = await inviteTeamMember(inviteEmail.trim(), inviteRole);
    if (ok) {
      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteRole("viewer");
    }
  };

  const handleUpdateRole = async () => {
    if (!selectedMember) return;
    const ok = await updateMemberRole(selectedMember.id, newRole);
    if (ok) {
      setRoleDialogOpen(false);
      setSelectedMember(null);
    }
  };

  const handleRemove = async () => {
    if (!selectedMember) return;
    const ok = await removeMember(selectedMember.id);
    if (ok) {
      setRemoveDialogOpen(false);
      setSelectedMember(null);
    }
  };

  let body;
  if (isLoading && teamMembers.length === 0 && !error) {
    body = (
      <p role="status" className="py-8 text-muted-foreground">
        Loading...
      </p>
    );
  } else if (error) {
    // WEB-QA-031: "No team members yet" is a wrong answer when the list simply failed to load.
    body = <ErrorState error={error} onRetry={() => void refetch()} />;
  } else if (teamMembers.length === 0) {
    body = <p className="py-8 text-muted-foreground">No one is on your list yet.</p>;
  } else {
    body = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Added</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {teamMembers.map((member) => (
            <TableRow key={member.id}>
              <TableCell className="break-all">{member.teamMemberEmail}</TableCell>
              <TableCell>
                <Badge variant="secondary">{ROLE_LABELS[member.role] ?? member.role}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[member.invitationStatus] ?? "outline"}>
                  {STATUS_LABELS[member.invitationStatus] ?? member.invitationStatus}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{formatDay(member.invitedAt)}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Options for ${member.teamMemberEmail}`}>
                      <MoreVertical className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {member.invitationStatus !== "accepted" && (
                      <DropdownMenuItem onClick={() => void resendInvitation(member.id)}>
                        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                        Renew for 7 days
                      </DropdownMenuItem>
                    )}
                    {member.invitationStatus === "accepted" && (
                      <DropdownMenuItem
                        onClick={() => {
                          setSelectedMember(member);
                          setNewRole(isInviteRole(member.role) ? member.role : "viewer");
                          setRoleDialogOpen(true);
                        }}
                      >
                        <Shield className="mr-2 h-4 w-4" aria-hidden="true" />
                        Change role
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => {
                        setSelectedMember(member);
                        setRemoveDialogOpen(true);
                      }}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <BusinessLayout>
      <SEOHead title="Campaign team" description="People you've added to your campaigns." robots="noindex, follow" />
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <Button asChild variant="ghost" className="mb-4 -ml-3">
          <Link to="/campaigns">
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Your campaigns
          </Link>
        </Button>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-2xl font-bold sm:text-3xl text-foreground">Campaign team</h1>
          <Button onClick={() => setInviteDialogOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
            Add someone
          </Button>
        </div>

        <div className="mt-4 max-w-prose space-y-2 rounded-xl border p-4 text-sm">
          <p>
            <strong>Team access isn't switched on yet.</strong> You can keep a list of the people you'll work with,
            but we don't email them, and adding someone doesn't let them see or change your campaigns.
          </p>
          <p className="text-muted-foreground">
            Need a colleague to manage a campaign now? Email{" "}
            <a href={BUSINESS_CONTACT_HREF} className="underline underline-offset-4">
              {BUSINESS_CONTACT_EMAIL}
            </a>
            .
          </p>
        </div>

        <section aria-labelledby="members-heading" className="mt-8">
          <h2 id="members-heading" className="text-lg font-semibold">
            People{teamMembers.length > 0 ? ` (${teamMembers.length})` : ""}
          </h2>
          <div className="mt-2">{body}</div>
        </section>
      </div>

      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add someone</DialogTitle>
            <DialogDescription>
              They're added to your list only. No email goes out, and they get no access until team access is
              switched on.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="team-email">Email address</Label>
              <Input
                id="team-email"
                type="email"
                autoComplete="email"
                placeholder="colleague@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-role">Role</Label>
              <Select value={inviteRole} onValueChange={(val) => isInviteRole(val) && setInviteRole(val)}>
                <SelectTrigger id="team-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
              Close
            </Button>
            <Button onClick={() => void handleInvite()} disabled={!inviteEmail.trim()}>
              Add to list
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription>For {selectedMember?.teamMemberEmail}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="team-new-role">Role</Label>
            <Select value={newRole} onValueChange={(val) => isInviteRole(val) && setNewRole(val)}>
              <SelectTrigger id="team-new-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>
              Close
            </Button>
            <Button onClick={() => void handleUpdateRole()}>Save role</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {selectedMember?.teamMemberEmail}?</AlertDialogTitle>
            <AlertDialogDescription>They come off your list. You can add them again later.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRemove()} className="bg-destructive text-destructive-foreground">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </BusinessLayout>
  );
}

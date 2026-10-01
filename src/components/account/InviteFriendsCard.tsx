import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useReferralStats } from "@/hooks/useReferralStats";
import { BRAND } from "@/lib/brandConfig";
import { ErrorSeverity, handleError } from "@/lib/errorHandler";

/**
 * "Invite friends" on the profile page (plan WP6). Shows the user's share link
 * and how many people signed up through it.
 *
 * The copy promises nothing. The planner's old "20% off for you and your
 * referral" had nothing behind it; whether invites earn a reward is an owner
 * decision, and until one exists this card only counts.
 *
 * Hidden while loading and whenever the stats RPC is unavailable, so a
 * database without 20261006000002 shows no card rather than a broken one.
 */
export function InviteFriendsCard() {
  const { data } = useReferralStats();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  if (!data) return null;

  const link = `${BRAND.baseUrl}/?ref=${data.referralCode}`;
  const countLabel =
    data.signedUp === 1 ? "1 person has signed up" : `${data.signedUp} people have signed up`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      handleError(error, { component: "InviteFriendsCard", action: "copy" }, ErrorSeverity.WARNING);
      toast({ title: "Couldn't copy", description: "Select the link and copy it by hand." });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite friends</CardTitle>
        <CardDescription>
          Send this link to someone. If they open it and create an account, they count as your invite.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input value={link} readOnly aria-label="Your invite link" className="flex-1" />
          <Button type="button" onClick={copy} className="min-h-11">
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{countLabel} through your link so far.</p>
      </CardContent>
    </Card>
  );
}

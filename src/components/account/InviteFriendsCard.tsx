import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useReferralStats } from "@/hooks/useReferralStats";
import { BRAND } from "@/lib/brandConfig";
import { shareWithOutcome } from "@/lib/capacitorUtils";
import { ErrorSeverity, handleError } from "@/lib/errorHandler";
import { referralCountLabel } from "@/lib/referralCode";

/**
 * "Invite friends" on the profile page (plan WP6). Shows the user's share link
 * and how many people signed up through it, and how many of those now pay.
 *
 * The copy promises nothing. The planner's old "20% off for you and your
 * referral" had nothing behind it; whether invites earn a reward is an owner
 * decision, and until one exists this card only counts.
 *
 * Hidden while loading and whenever the stats RPC is unavailable, so a
 * database without 20261006000002 shows no card rather than a broken one.
 *
 * Share (WEB-ADS-020): on a phone an invite goes out through a messaging app,
 * and "copy, switch app, paste" is three steps where the share sheet is one.
 * The button appears only where navigator.share exists. A closed sheet is the
 * member's answer and changes nothing (their clipboard included); a sheet that
 * cannot open falls back to copying, so the press still does something.
 */
export function InviteFriendsCard() {
  const { data } = useReferralStats();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  if (!data) return null;

  const link = `${BRAND.baseUrl}/?ref=${data.referralCode}`;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

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

  const share = async () => {
    const outcome = await shareWithOutcome({
      title: BRAND.name,
      text: `Find things to do in ${BRAND.city} on ${BRAND.name}.`,
      url: link,
    });
    if (outcome === "unavailable") await copy();
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
        <div className="flex flex-wrap gap-2">
          <Input value={link} readOnly aria-label="Your invite link" className="min-w-0 flex-1 basis-48" />
          <div className="flex gap-2">
            {canShare && (
              <Button type="button" onClick={share} className="min-h-11">
                Share
              </Button>
            )}
            <Button type="button" variant={canShare ? "outline" : "default"} onClick={copy} className="min-h-11">
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{referralCountLabel(data)}</p>
      </CardContent>
    </Card>
  );
}

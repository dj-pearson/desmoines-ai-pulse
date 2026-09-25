import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { EmailPreferencesCard } from "@/components/EmailPreferencesCard";
import { ConsentSwitch } from "@/components/PreferencesManager";
import { ConsentHistory } from "@/components/account/ConsentHistory";

/**
 * Every email we send you, each next to the switch the sender actually reads
 * (account plan bet 5, WP5 item 6).
 *
 *   Weekly digest          user_email_preferences.weekly_digest_enabled,
 *                          read by get_weekly_digest_recipients
 *   Account and activity   communication_preferences.email_notifications,
 *                          read by the lifecycle classifier's messagingAllowed,
 *                          which gates the onboarding drip, milestones,
 *                          re-engagement and win-back agents
 *   Saved-search alerts    owned by the Search plan's Saved searches tab, so
 *                          this is a link, not a second switch for one column
 *
 * Security alerts and password emails are transactional and always send, which
 * the copy says rather than offering a switch that could not stop them.
 */
export function EmailStreams() {
  return (
    <Card id="emails" className="scroll-mt-24">
      <CardHeader>
        <CardTitle>Emails</CardTitle>
        <CardDescription>
          Each switch here controls one kind of email. Security alerts and password emails always send,
          because they are how we reach you if someone else gets into your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <EmailPreferencesCard />

        <Separator />

        <ConsentSwitch
          consentKey="email_notifications"
          id="account-emails"
          label="Account and activity emails"
          description="Getting-started tips after you join, notes when you hit a milestone, and a nudge if you haven't visited in a while."
        />

        <Separator />

        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="space-y-1">
            <p className="text-base font-medium">Saved-search alerts</p>
            <p className="text-sm text-muted-foreground">
              Set per search, on the searches you've saved.
            </p>
          </div>
          <Link
            to="/dashboard?tab=saved-searches"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Manage saved searches
          </Link>
        </div>

        <Separator />

        <ConsentHistory />
      </CardContent>
    </Card>
  );
}

import { Link } from "react-router-dom";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PRICING_PATH, SUBSCRIPTION_PATH } from "@/lib/billingLinks";

/**
 * The way from Settings to the subscription page (WEB-LEGAL-016).
 *
 * Trial, dunning and upgrade emails sent before that story linked to
 * /profile?tab=settings, which had no billing on it: the trial notice's
 * "Cancel before you are charged" button landed on security settings. Those
 * emails are in inboxes and cannot be recalled, so this card sits at the top
 * of the tab they open. It reads nothing; the subscription page owns the plan
 * state and the controls.
 */
export function SubscriptionLinkCard() {
  return (
    <Card id="subscription">
      <CardHeader>
        <CardTitle>Subscription and billing</CardTitle>
        <CardDescription>
          Your plan, payment method, receipts and cancellation are on your subscription page.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button asChild>
          <Link to={SUBSCRIPTION_PATH}>
            <CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />
            Manage subscription
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link to={PRICING_PATH}>See plans</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

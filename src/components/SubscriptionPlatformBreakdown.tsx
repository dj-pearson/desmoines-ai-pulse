import { Apple, ChevronRight, CreditCard, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSubscription, type SubscriptionPlatform, type UserSubscription } from "@/hooks/useSubscription";
import { usePayments } from "@/hooks/usePayments";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

const PLATFORM_LABELS: Record<SubscriptionPlatform, string> = {
  web: "Website (Stripe)",
  ios: "Apple App Store",
  android: "Google Play",
};

function PlatformIcon({ platform }: { platform: SubscriptionPlatform }) {
  switch (platform) {
    case "ios":
      return <Apple className="h-4 w-4" aria-hidden="true" />;
    case "android":
      return <Smartphone className="h-4 w-4" aria-hidden="true" />;
    case "web":
    default:
      return <CreditCard className="h-4 w-4" aria-hidden="true" />;
  }
}

function formatTierName(name: string | undefined): string {
  if (!name) return "Free";
  if (name.toLowerCase() === "vip") return "VIP";
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function formatPeriodEnd(end: string | undefined): string {
  if (!end) return "—";
  return new Date(end).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface SubscriptionPlatformBreakdownProps {
  /**
   * When true, renders the breakdown even if the user only has a single
   * subscription. Defaults to showing only when 2+ rows exist (the case
   * where users genuinely need to know which platform to cancel from).
   */
  alwaysShow?: boolean;
}

/**
 * Per-platform breakdown of the user's active subscriptions, with cancel
 * routing per row. Only renders when the user has subscriptions on more
 * than one platform (Stripe / Apple / Google), unless `alwaysShow` is set.
 *
 * Cancel routing:
 *   - web    → Stripe customer portal (manage-subscription edge function)
 *   - ios    → https://apps.apple.com/account/subscriptions
 *   - android → https://play.google.com/store/account/subscriptions
 *
 * Implements SUB-SYNC-012.
 */
export function SubscriptionPlatformBreakdown({
  alwaysShow = false,
}: SubscriptionPlatformBreakdownProps) {
  const { subscriptions, isLoading } = useSubscription();
  const { openCustomerPortal, portalLoading } = usePayments();

  if (isLoading) return null;
  if (subscriptions.length === 0) return null;
  if (!alwaysShow && subscriptions.length < 2) return null;

  const handleCancel = (sub: UserSubscription) => {
    switch (sub.platform) {
      case "web":
        // Send the user to the Stripe customer portal in a new tab so the
        // Profile page state isn't lost.
        void openCustomerPortal(window.location.href);
        return;
      case "ios":
        // App Store deep link — works on macOS Safari and iOS browsers; on
        // desktop browsers it falls back to the marketing page.
        window.open("https://apps.apple.com/account/subscriptions", "_blank", "noopener,noreferrer");
        return;
      case "android":
        window.open(
          "https://play.google.com/store/account/subscriptions",
          "_blank",
          "noopener,noreferrer",
        );
        return;
    }
  };

  const sortedSubs = [...subscriptions].sort((a, b) => {
    const order: Record<SubscriptionPlatform, number> = { web: 0, ios: 1, android: 2 };
    return order[a.platform] - order[b.platform];
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Your Subscriptions</CardTitle>
        <p className="text-sm text-muted-foreground">
          You have active subscriptions on more than one platform. Cancel from
          the platform you bought it on — that's the only place each store will
          let you manage the renewal.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {sortedSubs.map((sub) => {
          const tierName = formatTierName(sub.plan?.name);
          const platformLabel = PLATFORM_LABELS[sub.platform];

          return (
            <div
              key={sub.id}
              className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-md bg-muted p-2">
                  <PlatformIcon platform={sub.platform} />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{tierName}</span>
                    <Badge variant="secondary">{platformLabel}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {sub.cancel_at_period_end
                      ? `Cancels on ${formatPeriodEnd(sub.current_period_end)}`
                      : `Renews on ${formatPeriodEnd(sub.current_period_end)}`}
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCancel(sub)}
                disabled={sub.platform === "web" && portalLoading}
                aria-label={`Manage ${tierName} subscription on ${platformLabel}`}
              >
                {sub.platform === "web" ? (
                  <>
                    Manage on Stripe
                    <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
                  </>
                ) : (
                  <>
                    Manage on {sub.platform === "ios" ? "App Store" : "Play Store"}
                    <SpriteIcon name="external-link" className="ml-1 h-4 w-4" aria-hidden="true" />
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

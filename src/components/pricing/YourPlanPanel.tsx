import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  isSubscriptionEntitled,
  useSubscription,
  type SubscriptionPlatform,
  type UserSubscription,
} from "@/hooks/useSubscription";
import { useSavedCount } from "@/hooks/useSavedCount";

/**
 * "Your plan" at the top of /pricing for a signed-in visitor (pricing plan
 * WP2 item 12, bets 2 and 3).
 *
 * Everything here is read, not computed: the tier is the entitled one from
 * useSubscription, the dates are the rows' own current_period_end, and the
 * saved count is useSavedCount's server count. A failed read hides its line
 * rather than printing a zero - "0 of 3 saved" for someone whose count simply
 * didn't load is a false statement about their account.
 *
 * No grace-period date is printed for a past_due row: the job that ends access
 * uses a different window from the one entitlement uses until pricing D3
 * deploys, so any date shown here could be wrong in either direction.
 */

const BILLER: Record<SubscriptionPlatform, string> = {
  web: "Stripe",
  ios: "the App Store",
  android: "Google Play",
};

const STORE_MANAGE_URL: Partial<Record<SubscriptionPlatform, string>> = {
  ios: "https://apps.apple.com/account/subscriptions",
  android: "https://play.google.com/store/account/subscriptions",
};

const PLATFORM_ORDER: Record<SubscriptionPlatform, number> = { web: 0, ios: 1, android: 2 };

export function tierLabel(name: string | undefined): string {
  if (!name || name === "free") return "Free";
  if (name === "vip") return "VIP";
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function formatDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusLine(sub: UserSubscription): string {
  const end = formatDate(sub.current_period_end);
  if (sub.status === "past_due") return "Payment failed. Update your card to keep access.";
  if (sub.status === "trialing") return end ? `Free trial until ${end}` : "Free trial";
  if (sub.cancel_at_period_end) return end ? `Cancelled, access until ${end}` : "Cancelled at period end";
  return end ? `Renews ${end}` : "Active";
}

function ManageLink({ sub }: { sub: UserSubscription }) {
  const storeUrl = STORE_MANAGE_URL[sub.platform];
  if (storeUrl) {
    return (
      <a
        href={storeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4"
      >
        Manage in {sub.platform === "ios" ? "the App Store" : "Google Play"}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  return (
    <Link
      to="/subscription"
      className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4"
    >
      Manage on this site
    </Link>
  );
}

export function YourPlanPanel() {
  const {
    tier,
    subscriptions,
    subscriptionLoading,
    subscriptionError,
    refetchSubscription,
    limits,
    getPlanByName,
  } = useSubscription();
  const saved = useSavedCount();

  const heading = (
    <h2 id="your-plan-heading" className="text-lg font-semibold text-foreground">
      {subscriptionLoading || subscriptionError ? "Your plan" : `Your plan: ${tierLabel(tier)}`}
    </h2>
  );

  if (subscriptionLoading) {
    return (
      <section aria-labelledby="your-plan-heading" aria-busy="true" className="mx-auto mb-10 max-w-3xl rounded-xl border bg-card p-5">
        {heading}
        <div className="mt-3 h-4 w-48 animate-pulse rounded bg-muted" />
      </section>
    );
  }

  if (subscriptionError) {
    return (
      <section aria-labelledby="your-plan-heading" className="mx-auto mb-10 max-w-3xl rounded-xl border bg-card p-5">
        {heading}
        <p className="mt-2 text-sm text-muted-foreground">
          We couldn't check your plan just now, so this page can't tell you which one you have.
        </p>
        <Button variant="outline" size="sm" className="mt-3 min-h-11" onClick={() => void refetchSubscription()}>
          Try again
        </Button>
      </section>
    );
  }

  const rows = subscriptions
    .filter((s) => isSubscriptionEntitled(s) || s.status === "past_due")
    .sort((a, b) => PLATFORM_ORDER[a.platform] - PLATFORM_ORDER[b.platform]);
  const isPaid = tier !== "free";

  const insiderSearches = getPlanByName("insider")?.limits?.saved_searches;
  const vipSearches = getPlanByName("vip")?.limits?.saved_searches;
  const showSearchLimits = typeof insiderSearches === "number" && typeof vipSearches === "number";
  const favoritesLimit = limits.favorites;

  return (
    <section aria-labelledby="your-plan-heading" className="mx-auto mb-10 max-w-3xl rounded-xl border bg-card p-5">
      {heading}

      {rows.length > 0 && (
        <ul className="mt-3 divide-y">
          {rows.map((sub) => (
            <li key={sub.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <p className="font-medium text-foreground">
                  {tierLabel(sub.plan?.name)}, billed by {BILLER[sub.platform]}
                </p>
                <p className="text-muted-foreground">{statusLine(sub)}</p>
              </div>
              <ManageLink sub={sub} />
            </li>
          ))}
        </ul>
      )}

      {!isPaid && (
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          {saved.count !== null && !saved.isError && typeof favoritesLimit === "number" && favoritesLimit >= 0 && (
            <li>
              Favorites saved: <span className="font-medium text-foreground">{saved.count} of {favoritesLimit}</span>
            </li>
          )}
          {showSearchLimits && (
            <li>
              Saved searches with alerts: Insider {insiderSearches === -1 ? "no limit" : insiderSearches}, VIP{" "}
              {vipSearches === -1 ? "no limit" : vipSearches}
            </li>
          )}
        </ul>
      )}

      {isPaid && (
        <Button asChild className="mt-4 min-h-11">
          <Link to="/subscription">Manage subscription</Link>
        </Button>
      )}
    </section>
  );
}

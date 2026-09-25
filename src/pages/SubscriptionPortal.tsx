import { useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertCircle, Check, CreditCard, Crown, Receipt, RefreshCw, Sparkles } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SubscriptionPlatformBreakdown } from "@/components/SubscriptionPlatformBreakdown";
import {
  PlanStatusLine,
  formatBillingDate,
  formatChargeAmount,
  parseBillingDate,
} from "@/components/subscription/PlanStatusLine";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { isStoreManaged, usePayments, type ManageAt } from "@/hooks/usePayments";
import { useSubscription } from "@/hooks/useSubscription";
import { benefitsFor, displayPrice, type PlanName } from "@/lib/planBenefits";

type PaidPlan = Exclude<PlanName, "free">;

const TIER_LABEL: Record<PlanName, string> = { free: "Free", insider: "Insider", vip: "VIP" };

// Insider amber, VIP brand red: the same pairing as PremiumBadge and the
// success page, as a chip on a flat card.
const TIER_CHIP: Record<PlanName, string> = {
  free: "bg-muted text-muted-foreground",
  insider: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  vip: "bg-secondary/10 text-secondary",
};

const STORE_NAME: Record<ManageAt, string> = { appstore: "the App Store", play: "Google Play" };

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Active", variant: "default" },
  trialing: { label: "Trial", variant: "secondary" },
  past_due: { label: "Past due", variant: "destructive" },
};

function isPaidPlan(value: unknown): value is PaidPlan {
  return value === "insider" || value === "vip";
}

function TierIcon({ plan }: { plan: PlanName }) {
  if (plan === "vip") return <Crown className="h-5 w-5" aria-hidden="true" />;
  if (plan === "insider") return <Sparkles className="h-5 w-5" aria-hidden="true" />;
  return <CreditCard className="h-5 w-5" aria-hidden="true" />;
}

/**
 * /subscription (docs/page-plans/pricing.md, WP3 items 4-11).
 *
 * Two sources, each for what it is right about. useSubscription gives the
 * ENTITLED tier: the highest plan on any platform, which is what the member
 * has. manage-subscription `details` gives the row this site can act on: the
 * web row when there is one, otherwise the store row plus where to manage it.
 * Cancel, Resume, the Canceling badge and every billing date come from that
 * row. They used to come from useSubscription's highest row, so a web Insider
 * with an iOS VIP saw Stripe controls labelled with the Apple row's dates.
 */
export default function SubscriptionPortal() {
  useDocumentTitle("Subscription and billing");

  const {
    subscriptionDetails: row,
    upcomingInvoice,
    subscriptionLoading: detailsLoading,
    subscriptionDetailsError,
    refetchSubscription: refetchDetails,
    portalLoading,
    openCustomerPortal,
    cancelSubscription,
    resumeSubscription,
    isCanceling,
    isResuming,
    // WEB-FEAT-015: set when Apple or Google bills this subscriber, in which
    // case none of the Stripe actions on this page can act on it.
    manageAt,
    manageUrl,
  } = usePayments();
  const {
    tier,
    plans,
    limits,
    subscriptionLoading,
    subscriptionError,
    refetchSubscription,
  } = useSubscription();

  const [dialog, setDialog] = useState<"cancel" | "resume" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const actionPending = isCanceling || isResuming;

  const webRow = row && !manageAt && (row.platform ?? "web") === "web" ? row : null;
  const storeRow = row && manageAt ? row : null;
  const billingRow = webRow ?? storeRow;

  // The entitled tier names the plan. A past_due row beyond its grace window
  // entitles nothing, but it is still a subscription with a payment to fix, so
  // its own plan name is shown rather than "Free".
  const planName: PlanName =
    tier !== "free" ? tier : isPaidPlan(billingRow?.plan?.name) ? billingRow.plan.name : "free";
  const webPlanName: PlanName | null = isPaidPlan(webRow?.plan?.name) ? webRow.plan.name : null;

  const handleManagePayment = async () => {
    const url = await openCustomerPortal();
    if (!url) toast.error("We couldn't open the billing portal. Please try again.");
  };

  const openStore = () => {
    if (manageUrl) window.open(manageUrl, "_blank", "noopener,noreferrer");
  };

  const closeDialog = (open: boolean) => {
    if (open || actionPending) return;
    setDialog(null);
    setActionError(null);
  };

  const confirmAction = async (kind: "cancel" | "resume", event: MouseEvent<HTMLButtonElement>) => {
    // Keep the dialog open until the server answers, so a failure is shown
    // where the member clicked instead of in a toast behind a closed dialog.
    event.preventDefault();
    setActionError(null);
    try {
      const result = kind === "cancel" ? await cancelSubscription() : await resumeSubscription();
      setDialog(null);
      if (isStoreManaged(result)) {
        // A stale render reached a Stripe action for a store-billed plan.
        toast.info(result.message);
        window.open(result.manageUrl, "_blank", "noopener,noreferrer");
        return;
      }
      toast.success(
        kind === "cancel"
          ? "Your subscription is set to end. You won't be charged again."
          : "Your subscription will renew as normal.",
      );
    } catch (err) {
      setActionError(
        err instanceof Error && err.message
          ? err.message
          : "Something went wrong. Your subscription is unchanged.",
      );
    }
  };

  const loading = subscriptionLoading || detailsLoading;
  const loadError = subscriptionError ?? subscriptionDetailsError;

  const periodStart = parseBillingDate(billingRow?.currentPeriodStart);
  const periodEnd = parseBillingDate(billingRow?.currentPeriodEnd);
  const nextPayment = webRow ? formatChargeAmount(upcomingInvoice) : null;
  const endDate =
    webRow?.status === "trialing"
      ? formatBillingDate(webRow.trialEnd) ?? formatBillingDate(webRow.currentPeriodEnd)
      : formatBillingDate(webRow?.currentPeriodEnd);
  const statusBadge = billingRow ? STATUS_BADGE[billingRow.status] : undefined;
  const hasPlan = planName !== "free" || !!billingRow;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      {/* App.tsx already renders the page's <main>; this is its content column. */}
      <div className="container mx-auto px-4 py-6 md:py-10" id="subscription-portal">
        <div className="mx-auto max-w-3xl">
          <Breadcrumbs
            className="mb-4"
            items={[
              { label: "Home", href: "/" },
              { label: "Account", href: "/profile" },
              { label: "Subscription" },
            ]}
          />
          <h1 className="mb-6 text-3xl font-bold text-foreground">Subscription and billing</h1>

          {loading ? (
            <div className="space-y-4" aria-busy="true" aria-label="Loading your subscription">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : loadError ? (
            <ErrorState
              error={loadError}
              title="We couldn't load your subscription"
              description="Your plan hasn't changed. Try again in a moment."
              onRetry={() => {
                void refetchSubscription();
                void refetchDetails();
              }}
            />
          ) : (
            <div className="space-y-6">
              {/* Renders only when the member holds rows on 2+ platforms. */}
              <SubscriptionPlatformBreakdown />

              {hasPlan ? (
                <Card>
                  <CardHeader className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex rounded-full p-2 ${TIER_CHIP[planName]}`}>
                          <TierIcon plan={planName} />
                        </span>
                        <div>
                          <h2 className="text-xl font-semibold leading-none text-foreground">
                            {TIER_LABEL[planName]}
                          </h2>
                          <CardDescription>
                            {webRow
                              ? "Billed by Stripe"
                              : manageAt
                                ? `Billed by ${STORE_NAME[manageAt]}`
                                : null}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {statusBadge && (
                          <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                        )}
                        {billingRow?.cancelAtPeriodEnd && (
                          <Badge variant="outline" className="gap-1 border-destructive text-destructive">
                            <AlertCircle className="h-3 w-3" aria-hidden="true" />
                            Canceling
                          </Badge>
                        )}
                      </div>
                    </div>

                    {webPlanName && webPlanName !== planName && (
                      <p className="text-sm text-muted-foreground">
                        Stripe bills your {TIER_LABEL[webPlanName]} plan. Your{" "}
                        {TIER_LABEL[planName]} access comes from the app store subscription
                        listed above.
                      </p>
                    )}

                    {billingRow && (
                      <PlanStatusLine
                        status={billingRow.status}
                        cancelAtPeriodEnd={billingRow.cancelAtPeriodEnd}
                        currentPeriodEnd={billingRow.currentPeriodEnd}
                        trialEnd={billingRow.trialEnd}
                        nextAmount={webRow ? upcomingInvoice : null}
                        onManagePayment={
                          webRow ? () => void handleManagePayment() : manageUrl ? openStore : undefined
                        }
                        managePaymentPending={portalLoading}
                      />
                    )}
                  </CardHeader>

                  <CardContent className="space-y-6">
                    {(periodStart && periodEnd) || nextPayment ? (
                      <dl className="grid gap-4 sm:grid-cols-2">
                        {periodStart && periodEnd && (
                          <div className="rounded-lg bg-muted/50 p-4">
                            <dt className="mb-1 text-sm text-muted-foreground">Current period</dt>
                            <dd className="font-medium">
                              {formatBillingDate(billingRow?.currentPeriodStart)} to{" "}
                              {formatBillingDate(billingRow?.currentPeriodEnd)}
                            </dd>
                          </div>
                        )}
                        {nextPayment && !webRow?.cancelAtPeriodEnd && (
                          <div className="rounded-lg bg-muted/50 p-4">
                            <dt className="mb-1 text-sm text-muted-foreground">Next payment</dt>
                            <dd className="font-medium">{nextPayment}</dd>
                          </div>
                        )}
                      </dl>
                    ) : null}

                    {planName !== "free" && (
                      <div>
                        <h3 className="mb-3 text-base font-semibold text-foreground">
                          What {TIER_LABEL[planName]} includes
                        </h3>
                        <ul className="grid gap-2 sm:grid-cols-2">
                          {benefitsFor(planName, limits).map((benefit) => (
                            <li key={benefit.key} className="flex items-start gap-2 text-sm">
                              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-700 dark:text-green-400" aria-hidden="true" />
                              {benefit.href ? (
                                <Link to={benefit.href} className="underline-offset-4 hover:underline">
                                  {benefit.text}
                                </Link>
                              ) : (
                                <span>{benefit.text}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>

                  {/* WEB-FEAT-015 -- STRIPE CANNOT ACT ON A STORE SUBSCRIPTION.
                      Apple and Google own that billing, so the only honest
                      control is a link to it. */}
                  {storeRow && manageAt && manageUrl && (
                    <CardFooter className="flex flex-col items-start gap-3">
                      <p className="text-sm text-muted-foreground">
                        {manageAt === "appstore"
                          ? "Apple bills this subscription. Payment method, renewal and cancellation are handled in your App Store account."
                          : "Google Play bills this subscription. Payment method, renewal and cancellation are handled in your Play account."}
                      </p>
                      <Button asChild variant="outline">
                        <a href={manageUrl} target="_blank" rel="noopener noreferrer">
                          <CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />
                          {manageAt === "appstore" ? "Manage in the App Store" : "Manage in Google Play"}
                        </a>
                      </Button>
                    </CardFooter>
                  )}

                  {webRow && (
                    <CardFooter className="flex flex-wrap gap-3">
                      <Button
                        variant="outline"
                        onClick={() => void handleManagePayment()}
                        disabled={portalLoading}
                      >
                        <CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />
                        {portalLoading ? "Opening..." : "Manage payment method"}
                      </Button>
                      {webRow.cancelAtPeriodEnd ? (
                        <Button
                          variant="outline"
                          onClick={() => setDialog("resume")}
                          disabled={actionPending}
                        >
                          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                          Resume subscription
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDialog("cancel")}
                          disabled={actionPending}
                        >
                          Cancel subscription
                        </Button>
                      )}
                      <Button variant="ghost" asChild>
                        <Link to="/pricing">See all plans</Link>
                      </Button>
                    </CardFooter>
                  )}
                </Card>
              ) : (
                <FreePlanCard plans={plans} />
              )}

              {billingRow && (
                <Card>
                  <CardHeader>
                    <h2 className="flex items-center gap-2 text-lg font-semibold leading-none text-foreground">
                      <Receipt className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                      Receipts and invoices
                    </h2>
                    <CardDescription>
                      {webRow
                        ? "Invoices and receipts are in the Stripe billing portal."
                        : manageAt === "appstore"
                          ? "Apple keeps your receipts in your App Store account."
                          : "Google keeps your receipts in your Google Play account."}
                    </CardDescription>
                  </CardHeader>
                  <CardFooter>
                    {webRow ? (
                      <Button
                        variant="outline"
                        onClick={() => void handleManagePayment()}
                        disabled={portalLoading}
                      >
                        {portalLoading ? "Opening..." : "Open billing portal"}
                      </Button>
                    ) : manageUrl ? (
                      <Button asChild variant="outline">
                        <a href={manageUrl} target="_blank" rel="noopener noreferrer">
                          {manageAt === "appstore" ? "Open the App Store" : "Open Google Play"}
                        </a>
                      </Button>
                    ) : null}
                  </CardFooter>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
      <Footer />

      <AlertDialog open={dialog === "cancel"} onOpenChange={closeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              {endDate
                ? `You keep ${TIER_LABEL[planName]} until ${endDate} and won't be charged again. You can resume any time before then.`
                : `You keep ${TIER_LABEL[planName]} until the end of this billing period and won't be charged again. You can resume any time before then.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionError && dialog === "cancel" && (
            <p role="alert" className="text-sm text-destructive">
              {actionError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionPending}>Keep subscription</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => void confirmAction("cancel", e)}
              disabled={actionPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isCanceling ? "Canceling..." : "Yes, cancel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "resume"} onOpenChange={closeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resume your subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              {endDate
                ? `Your plan continues and renews on ${endDate}.`
                : "Your plan continues and renews at the end of this billing period."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionError && dialog === "resume" && (
            <p role="alert" className="text-sm text-destructive">
              {actionError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionPending}>Not now</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => void confirmAction("resume", e)} disabled={actionPending}>
              {isResuming ? "Resuming..." : "Resume subscription"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface FreePlanCardProps {
  plans: ReturnType<typeof useSubscription>["plans"];
}

/**
 * The free member's view. It links to /pricing rather than starting checkout
 * here: one checkout path, on the page that carries the renewal disclosure.
 */
function FreePlanCard({ plans }: FreePlanCardProps) {
  const paid: PaidPlan[] = ["insider", "vip"];
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className={`inline-flex rounded-full p-2 ${TIER_CHIP.free}`}>
            <TierIcon plan="free" />
          </span>
          <div>
            <h2 className="text-xl font-semibold leading-none text-foreground">Free</h2>
            <CardDescription>You're on the free plan. Nothing is billed.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          {paid.map((name) => {
            const row = plans.find((p) => p.name === name);
            const price = displayPrice(plans, name, "monthly");
            return (
              <div key={name} className="flex flex-col rounded-xl border p-4">
                <h3 className="text-lg font-semibold text-foreground">{TIER_LABEL[name]}</h3>
                {price !== null && (
                  <p className="text-sm text-muted-foreground">
                    {formatChargeAmount({ amount: price, currency: "usd" })} a month
                  </p>
                )}
                <ul className="my-4 flex-1 space-y-2">
                  {benefitsFor(name, row?.limits).map((benefit) => (
                    <li key={benefit.key} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-700 dark:text-green-400" aria-hidden="true" />
                      <span>{benefit.text}</span>
                    </li>
                  ))}
                </ul>
                <Button asChild variant={name === "insider" ? "default" : "outline"} className="w-full">
                  <Link to={`/pricing?plan=${name}`}>See {TIER_LABEL[name]}</Link>
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

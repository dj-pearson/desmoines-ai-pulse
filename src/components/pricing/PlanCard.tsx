import { Link } from "react-router-dom";
import { Check, Loader2, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Benefit, PlanName } from "@/lib/planBenefits";
import type { BillingPeriod } from "./BillingPeriodToggle";

export interface PlanCardCta {
  label: string;
  /** In-app route. When set the button is a link and onClick is ignored. */
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}

interface PlanCardProps {
  planId: PlanName;
  name: string;
  description: string;
  featured?: boolean;
  badge?: string;
  /** Display price for the selected period; null when no price is known. Never sent anywhere. */
  price: number | null;
  period: BillingPeriod;
  /** Yearly saving in dollars and cents, shown only on the yearly view. */
  yearlySaving: number | null;
  /** A line above the list that is context rather than a benefit, e.g. "Everything in Free, plus:". */
  leadIn?: string;
  included: Benefit[];
  excluded?: Benefit[];
  /** Paid plans only: whether this visitor would get the trial. Drives the pre-CTA disclosure. */
  trialEligible?: boolean;
  cta: PlanCardCta;
}

export const planCtaId = (planId: PlanName) => `plan-cta-${planId}`;

const money = (n: number) => `$${n.toFixed(2)}`;

function BenefitText({ benefit }: { benefit: Benefit }) {
  if (!benefit.href) return <>{benefit.text}</>;
  return (
    <Link to={benefit.href} className="underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-foreground">
      {benefit.text}
    </Link>
  );
}

/**
 * Renewal terms, directly above the paid button. FTC click-to-cancel, ROSCA
 * and California's ARL want the renewal terms clear and conspicuous BEFORE the
 * subscribe action, so this block may move but must stay above the CTA.
 */
function RenewalDisclosure({
  price,
  period,
  trialEligible,
}: {
  price: number | null;
  period: BillingPeriod;
  trialEligible: boolean;
}) {
  const per = period === "yearly" ? "a year" : "a month";
  return (
    <div role="note" aria-label="Renewal terms" className="mb-4 space-y-1 text-xs text-muted-foreground">
      <p>
        {price !== null
          ? `Auto-renews at ${money(price)} ${per} until you cancel.`
          : "Auto-renews at the plan price until you cancel."}{" "}
        {trialEligible ? "7-day free trial for first-time subscribers only." : "Billing starts today."}
      </p>
      <p>
        Cancel online any time from{" "}
        <Link to="/subscription" className="text-foreground underline underline-offset-4">
          your subscription
        </Link>
        .
      </p>
      <details className="group">
        <summary className="cursor-pointer py-1 text-foreground underline underline-offset-4">
          Full renewal terms
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Paid plans auto-renew at the end of each billing period ({period === "yearly" ? "every 12 months" : "every month"}) at
            the price shown, until you cancel.
          </li>
          <li>
            The 7-day free trial is for first-time subscribers only. If you've had a trial before, on any plan or
            platform, billing starts immediately. A trial becomes a paid subscription at the price shown unless you
            cancel before it ends.
          </li>
          <li>
            Cancel online from{" "}
            <Link to="/subscription" className="text-foreground underline underline-offset-4">
              your subscription page
            </Link>
            . One click, no phone call.
          </li>
          <li>
            Subscriptions bought in the iPhone app are billed by Apple; cancel in Settings, Apple ID, Subscriptions.
            Subscriptions bought in the Android app are billed by Google Play; cancel in Play Store, Subscriptions.
          </li>
        </ul>
      </details>
    </div>
  );
}

export function PlanCard({
  planId,
  name,
  description,
  featured = false,
  badge,
  price,
  period,
  yearlySaving,
  leadIn,
  included,
  excluded = [],
  trialEligible = false,
  cta,
}: PlanCardProps) {
  const isFree = planId === "free";
  const buttonVariant = featured ? "default" : "outline";
  const ctaContent = cta.loading ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
      Starting checkout...
    </>
  ) : (
    cta.label
  );

  return (
    <Card
      id={`plan-${planId}`}
      aria-labelledby={`plan-${planId}-name`}
      className={`relative flex flex-col scroll-mt-24 ${featured ? "border-2 border-primary md:scale-105 md:z-10" : ""}`}
    >
      {badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary text-primary-foreground">{badge}</Badge>
        </div>
      )}

      <CardHeader className="pb-4 text-center">
        <CardTitle id={`plan-${planId}-name`} className="text-2xl text-foreground">
          {name}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col">
        <div className="mb-6 text-center" aria-live="polite">
          <p className="text-4xl font-bold text-foreground">
            {isFree ? "$0" : price !== null ? money(price) : "Price unavailable"}
            {!isFree && price !== null && (
              <span className="text-lg font-normal text-muted-foreground">
                /{period === "yearly" ? "year" : "mo"}
              </span>
            )}
          </p>
          {!isFree && period === "yearly" && yearlySaving !== null && yearlySaving > 0 && (
            <p className="mt-1 text-sm text-foreground">Saves {money(yearlySaving)} a year against paying monthly</p>
          )}
        </div>

        {leadIn && <p className="mb-3 text-sm font-medium text-foreground">{leadIn}</p>}
        <ul className="mb-6 flex-1 space-y-3">
          {included.map((benefit) => (
            <li key={`in-${benefit.key}`} className="flex items-start gap-2 text-sm text-foreground">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
              <span>
                <BenefitText benefit={benefit} />
              </span>
            </li>
          ))}
          {excluded.map((benefit) => (
            <li key={`out-${benefit.key}`} className="flex items-start gap-2 text-sm text-muted-foreground">
              <Minus className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span>
                <span className="sr-only">Not included: </span>
                {benefit.text}
              </span>
            </li>
          ))}
        </ul>

        {!isFree && <RenewalDisclosure price={price} period={period} trialEligible={trialEligible} />}

        {cta.href && !cta.disabled ? (
          <Button asChild variant={buttonVariant} size="lg" className="w-full">
            <Link id={planCtaId(planId)} to={cta.href}>
              {cta.label}
            </Link>
          </Button>
        ) : (
          <Button
            id={planCtaId(planId)}
            type="button"
            variant={buttonVariant}
            size="lg"
            className="w-full"
            onClick={cta.onClick}
            disabled={cta.disabled || cta.loading}
            aria-busy={cta.loading || undefined}
          >
            {ctaContent}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

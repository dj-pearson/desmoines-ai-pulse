/**
 * The one list of plan benefit lines (docs/page-plans/pricing.md, WP1).
 *
 * Pricing, UpgradeModal, SubscriptionSuccess and SubscriptionPortal render
 * their benefit lines from here and nowhere else. Four surfaces each keeping
 * their own copy is how WEB-FEAT-016's withdrawn claims survived on three of
 * them after the pricing page was fixed.
 *
 * Every line has a key, and supabase/functions/_tests/plan-features-truthful.test.ts
 * requires each key to map to the code that enforces it: a DELIVERED entitlement
 * with a consumer, a free-tier route or limit, or (for VIP) a server-side limit.
 * Adding a line means adding that evidence to the test in the same change.
 *
 * Display only. Prices here are what the page shows while the plan rows load;
 * Stripe's price object decides what anyone is charged (CLAUDE.md "Money is
 * decided on the server").
 */
import { AI_PLANNER_AVAILABLE } from "@/lib/tripPlannerStatus";
import type { SubscriptionLimits, SubscriptionPlan } from "@/hooks/useSubscription";

export type PlanName = "free" | "insider" | "vip";

export type BillingInterval = "monthly" | "yearly";

export interface Benefit {
  key: string;
  text: string;
  href?: string;
}

/**
 * Monthly AI trip plans per tier; -1 is unlimited. Mirrors
 * TRIP_PLANNER_MONTHLY_QUOTA in supabase/functions/generate-itinerary/index.ts,
 * which is what enforces it. The truthfulness test fails if the two drift.
 */
export const TRIP_PLANNER_MONTHLY_QUOTA = { insider: 5, vip: -1 } as const;

/**
 * Shown only while the subscription_plans rows are loading, so the first paint
 * has a price. Matches the seeded rows (20251126000000). Display only.
 */
export const FALLBACK_PRICES: Record<Exclude<PlanName, "free">, Record<BillingInterval, number>> = {
  insider: { monthly: 4.99, yearly: 49.99 },
  vip: { monthly: 12.99, yearly: 129.99 },
};

/** Used when no plan row limit is available for the tier being described. */
const FALLBACK_FREE_FAVORITES = 3;
const FALLBACK_INSIDER_SAVED_SEARCHES = 10;

interface PlanLine {
  key: string;
  href?: string;
  /** Only listed while the AI trip planner can run (AI_PLANNER_AVAILABLE). */
  needsPlanner?: boolean;
  text: (limits?: Partial<SubscriptionLimits>) => string | null;
}

// The test reads the `key:` literals in each list below, so keep one list per
// tier, one object per line, and the key as a plain string literal.

const FREE_BENEFITS: PlanLine[] = [
  {
    key: "browse",
    href: "/events",
    text: () => "Browse events, restaurants, hotels and attractions",
  },
  { key: "keyword_search", href: "/search", text: () => "Keyword search" },
  {
    key: "favorites_limit",
    text: (limits) => {
      const n = limits?.favorites ?? FALLBACK_FREE_FAVORITES;
      if (n === -1) return "Unlimited favorites";
      if (n <= 0) return null;
      return `Save up to ${n} favorite${n === 1 ? "" : "s"}`;
    },
  },
  { key: "view_reviews", text: () => "Read ratings and reviews" },
  { key: "weekly_digest", text: () => "Weekly email digest" },
];

const INSIDER_BENEFITS: PlanLine[] = [
  { key: "unlimited_favorites", text: () => "Unlimited favorites" },
  {
    key: "save_searches",
    href: "/search",
    text: (limits) => {
      const n = limits?.saved_searches ?? FALLBACK_INSIDER_SAVED_SEARCHES;
      if (n === -1) return "Unlimited saved searches and event alerts";
      if (n <= 0) return null;
      return `Saved searches and event alerts (up to ${n})`;
    },
  },
  { key: "write_reviews", text: () => "Write reviews and ratings" },
  { key: "ad_free", text: () => "Ad-free browsing" },
  // Kept verbatim pending Search plan D2 (docs/page-plans/search.md). Linked
  // from /search since NON_CORE_REVIEW_2026-09 WP4; before that nothing on the
  // site led to /search/advanced, so the benefit was unreachable.
  {
    key: "advanced_filters",
    href: "/search/advanced",
    text: () => "Advanced search filters",
  },
  {
    key: "trip_planner",
    href: "/trip-planner",
    needsPlanner: true,
    text: () => quotaLine(TRIP_PLANNER_MONTHLY_QUOTA.insider),
  },
];

const VIP_BENEFITS: PlanLine[] = [
  { key: "everything_in_insider", text: () => "Everything in Insider" },
  {
    key: "unlimited_saved_searches",
    href: "/search",
    text: () => "Unlimited saved searches and alerts",
  },
  {
    key: "unlimited_trip_plans",
    href: "/trip-planner",
    needsPlanner: true,
    text: () => quotaLine(TRIP_PLANNER_MONTHLY_QUOTA.vip),
  },
];

function quotaLine(quota: number): string {
  return quota === -1 ? "Unlimited AI trip plans" : `AI trip plans (${quota} a month)`;
}

const LINES: Record<PlanName, PlanLine[]> = {
  free: FREE_BENEFITS,
  insider: INSIDER_BENEFITS,
  vip: VIP_BENEFITS,
};

/**
 * The lines to show for a plan. Free lists what everyone gets; Insider and VIP
 * list what that tier adds over the one below (VIP starts with "Everything in
 * Insider"). Pass the plan row's own `limits` so numbers come from the row.
 */
export function benefitsFor(plan: PlanName, limits?: Partial<SubscriptionLimits>): Benefit[] {
  const out: Benefit[] = [];
  for (const line of LINES[plan]) {
    if (line.needsPlanner && !AI_PLANNER_AVAILABLE) continue;
    const text = line.text(limits);
    if (!text) continue;
    out.push(line.href ? { key: line.key, text, href: line.href } : { key: line.key, text });
  }
  return out;
}

type PricedPlan = Pick<SubscriptionPlan, "name" | "price_monthly" | "price_yearly">;

function toCents(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/**
 * The price to display for a plan and interval, in dollars.
 *
 * Reads the plan row. An empty `plans` list is treated as "still loading" and
 * answers from FALLBACK_PRICES; once rows exist, a plan with no row or no price
 * returns null so the page shows nothing rather than a stale number.
 */
export function displayPrice(
  plans: readonly PricedPlan[],
  name: PlanName,
  interval: BillingInterval,
): number | null {
  if (name === "free") return 0;
  if (plans.length === 0) return FALLBACK_PRICES[name][interval];
  const row = plans.find((p) => p.name === name);
  if (!row) return null;
  const cents = toCents(interval === "monthly" ? row.price_monthly : row.price_yearly);
  return cents === null ? null : cents / 100;
}

/**
 * What paying yearly saves against twelve monthly payments, in dollars to the
 * exact cent (4.99 x 12 - 49.99 = 9.89, not "$10"). Null when there is no
 * saving or no price to compare.
 */
export function yearlySavings(plans: readonly PricedPlan[], name: PlanName): number | null {
  if (name === "free") return null;
  const monthly = toCents(displayPrice(plans, name, "monthly"));
  const yearly = toCents(displayPrice(plans, name, "yearly"));
  if (monthly === null || yearly === null || monthly <= 0 || yearly <= 0) return null;
  const saved = monthly * 12 - yearly;
  return saved > 0 ? saved / 100 : null;
}

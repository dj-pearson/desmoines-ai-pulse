/**
 * How campaign money, dates and states are shown on the business pages.
 *
 * DISPLAY ONLY. Nothing here decides what anyone is charged: the pricing
 * trigger on campaign_placements and create-campaign-checkout do that
 * (CLAUDE.md, "Money is decided on the server"). formatUSD prints a number
 * the server gave us; campaignDays counts days the same way the trigger does,
 * so the page can say how many days a campaign spans, not price them.
 */
import { format } from "date-fns";
import { dateOnlySpanDays, isDateOnly, parseDateOnly } from "@/lib/dateOnly";

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** "$66.50". A missing amount prints "-", never "$0.00". */
export function formatUSD(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "-";
  return USD.format(amount);
}

/**
 * Inclusive day count, matching the pricing trigger's `(end - start) + 1`
 * (20260902000008). Oct 1 to Oct 30 is 30. Null when either date is missing
 * or unreadable, or when the end is before the start.
 */
export function campaignDays(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  if (!isDateOnly(start.slice(0, 10)) || !isDateOnly(end.slice(0, 10))) return null;
  const days = dateOnlySpanDays(start, end);
  return days >= 1 ? days : null;
}

/**
 * A campaign date as the calendar day it names. `new Date("2026-10-01")` is
 * UTC midnight, which is September 30 in Des Moines; parseDateOnly is not.
 */
export function formatCampaignDate(value: string, pattern = "MMMM d, yyyy"): string {
  if (!value || !isDateOnly(value.slice(0, 10))) return "-";
  return format(parseDateOnly(value), pattern);
}

export type CampaignStatusTone = "neutral" | "info" | "success" | "warning" | "danger";

/**
 * Wording and tone for every campaigns.status value. pending_payment is
 * neutral: an unpaid draft is a step, not an error.
 *
 * pending_review means approved and waiting for its start date, because
 * approve_campaign_creative only sets it once every creative is approved
 * (20260902000003:91-101). Use campaignStatusLabel to get the date in.
 */
export const CAMPAIGN_STATUS: Record<string, { label: string; tone: CampaignStatusTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_payment: { label: "Awaiting payment", tone: "neutral" },
  pending_creative: { label: "Needs artwork", tone: "warning" },
  pending_review: { label: "Approved, waiting to start", tone: "info" },
  active: { label: "Running", tone: "success" },
  paused: { label: "Paused", tone: "warning" },
  completed: { label: "Finished", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  rejected: { label: "Rejected", tone: "danger" },
};

/**
 * Badge classes per tone, shared by /campaigns and /campaigns/:id. Each pairs
 * a surface with its own foreground token, so text stays at 4.5:1.
 */
export const CAMPAIGN_STATUS_BADGE_CLASS: Record<CampaignStatusTone, string> = {
  neutral: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary",
  info: "border-border bg-background text-foreground hover:bg-background",
  success: "border-transparent bg-primary text-primary-foreground hover:bg-primary",
  warning: "border-transparent bg-warning text-warning-foreground hover:bg-warning",
  danger: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive",
};

/** Label for a status, with the start date filled in for pending_review. */
export function campaignStatusLabel(status: string, startDate?: string | null): string {
  if (status === "pending_review" && startDate && isDateOnly(startDate.slice(0, 10))) {
    return `Approved, starts ${formatCampaignDate(startDate)}`;
  }
  return CAMPAIGN_STATUS[status]?.label ?? status.replace(/_/g, " ");
}

export type CreativeStage = "none" | "in_review" | "changes_needed" | "approved";

/**
 * Where a campaign's artwork stands. Any creative sent back with a reason
 * wins over the rest, because that one needs the advertiser to act.
 */
export function creativeStage(
  creatives: Array<{ is_approved: boolean | null; rejection_reason: string | null }>,
): CreativeStage {
  if (!creatives || creatives.length === 0) return "none";
  if (creatives.some((c) => c.is_approved !== true && !!c.rejection_reason)) return "changes_needed";
  if (creatives.every((c) => c.is_approved === true)) return "approved";
  return "in_review";
}

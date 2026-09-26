/**
 * VIP support queue position (plan WP7, NON_CORE_REVIEW_2026-09).
 *
 * The ticket classifier derives a priority from urgency and sentiment, and the
 * priority sets the SLA target. A ticket from a VIP subscriber moves up one
 * step, so it is answered before an otherwise equal ticket. It never lifts a
 * ticket into "urgent": that stays reserved for what the classifier itself
 * reads as critical, so a VIP cannot page the on-call with a routine question.
 *
 * planBenefits.ts sells this as the "support_queue_first" VIP line and
 * _tests/plan-features-truthful.test.ts ties that line to this file.
 */
export type TicketPriority = "low" | "normal" | "high" | "urgent";

const VIP_BUMP: Record<TicketPriority, TicketPriority> = {
  low: "normal",
  normal: "high",
  high: "high",
  urgent: "urgent",
};

export function priorityForTier(priority: string, tier: string | null | undefined): string {
  if (tier !== "vip") return priority;
  return VIP_BUMP[priority as TicketPriority] ?? priority;
}

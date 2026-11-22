/**
 * Business claim mail and the pending-claim check (WEB-ADS-047).
 *
 * Pure: no client, no env, so the words a claimant receives and the rule that
 * raises an alert are both tested without a network.
 *
 * THE MAIL IS FIXED COPY. The admin's notes and a revoke reason are written for
 * the record ("domain is a reseller", "sold to new owners 2026-11") and are
 * never interpolated into what the claimant receives. The only variable text
 * is the listing's name, which comes from the listing row.
 */
import { escapeHtml } from "./escapeHtml.ts";

export type ClaimDecision = "approved" | "rejected" | "revoked";

export const CLAIM_DECISIONS: readonly ClaimDecision[] = ["approved", "rejected", "revoked"];

/** The business_claims state each decision mail describes. */
export function decisionMatchesClaim(
  decision: ClaimDecision,
  claim: { status: string; revoked_at: string | null },
): boolean {
  if (decision === "approved") return claim.status === "verified";
  if (decision === "revoked") return claim.status === "rejected" && !!claim.revoked_at;
  return claim.status === "rejected" && !claim.revoked_at;
}

export interface ClaimEmailInput {
  decision: ClaimDecision;
  listingName: string;
  listingType: "restaurant" | "attraction" | "venue";
  /** Site origin without a trailing slash. */
  siteUrl: string;
}

export interface ClaimEmail {
  subject: string;
  text: string;
  html: string;
}

const NOUN: Record<ClaimEmailInput["listingType"], string> = {
  restaurant: "restaurant",
  attraction: "attraction",
  venue: "venue",
};

/** Header-safe: no line breaks, bounded. */
function subjectLine(s: string): string {
  return s.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 150);
}

export function buildClaimDecisionEmail(input: ClaimEmailInput): ClaimEmail {
  const name = input.listingName.trim() || `your ${NOUN[input.listingType]}`;
  const site = input.siteUrl.replace(/\/+$/, "");
  const workspace = `${site}/business`;

  let subject: string;
  let paragraphs: string[];
  let nextStep: string;

  if (input.decision === "approved") {
    subject = `Your claim on ${name} is approved`;
    paragraphs = [
      `We checked your claim on ${name} on Des Moines Insider and approved it. You are now the verified owner of the listing.`,
    ];
    nextStep =
      `Next step: sign in with this email address and open your business workspace at ${workspace}. ` +
      `From there you can correct the description, website, phone number and photo, and see how many people viewed the listing.`;
  } else if (input.decision === "rejected") {
    subject = `We could not verify your claim on ${name}`;
    paragraphs = [
      `We looked at your claim on ${name} on Des Moines Insider and could not confirm that you represent the business, so the claim was not approved.`,
    ];
    nextStep =
      `Next step: the fastest way through is to claim again at ${workspace} while signed in with an email address at the ` +
      `business's own website domain, which verifies on the spot. If you do not have one, reply to this email with something ` +
      `that shows you run ${name} (for example a link to the business's site or social page that names you) and we will look again.`;
  } else {
    subject = `You are no longer the verified owner of ${name}`;
    paragraphs = [
      `Your verified ownership of ${name} on Des Moines Insider has been removed, so this account can no longer edit the listing.`,
      `This usually happens when a business changes hands or we are asked to confirm who runs it now.`,
    ];
    nextStep =
      `Next step: if you still run ${name}, reply to this email and tell us, and we will review it. ` +
      `You can also submit a new claim at ${workspace}; it will be checked by a person.`;
  }

  const text = [...paragraphs, nextStep, "", "Des Moines Insider"].join("\n\n");
  const html = [
    ...paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`),
    `<p><strong>${escapeHtml(nextStep)}</strong></p>`,
    `<p><a href="${escapeHtml(workspace)}">Open your business workspace</a></p>`,
    `<p>Des Moines Insider</p>`,
  ].join("\n");

  return { subject: subjectLine(subject), text, html };
}

// -- the daily pending check --

export const PENDING_ALERT_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PendingClaimRow {
  id: string;
  listing_type: string;
  listing_id: string;
  created_at: string;
}

/** Claims that have waited longer than `days`, oldest first. */
export function overdueClaims(
  rows: PendingClaimRow[],
  now: Date,
  days = PENDING_ALERT_DAYS,
): PendingClaimRow[] {
  const cutoff = now.getTime() - days * DAY_MS;
  return rows
    .filter((r) => {
      const t = Date.parse(r.created_at);
      return Number.isFinite(t) && t < cutoff;
    })
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

/** The alert text, or null when nothing is overdue. */
export function pendingClaimsAlert(
  pendingTotal: number,
  overdue: PendingClaimRow[],
  now: Date,
  siteUrl: string,
  days = PENDING_ALERT_DAYS,
): string | null {
  if (overdue.length === 0) return null;
  const oldest = Math.floor((now.getTime() - Date.parse(overdue[0].created_at)) / DAY_MS);
  const lines = overdue.slice(0, 10).map((r) => {
    const age = Math.floor((now.getTime() - Date.parse(r.created_at)) / DAY_MS);
    return `- ${r.listing_type} ${r.listing_id}, waiting ${age} days`;
  });
  if (overdue.length > 10) lines.push(`- and ${overdue.length - 10} more`);
  return [
    `${overdue.length} business claim${overdue.length === 1 ? " has" : "s have"} been pending more than ${days} days ` +
    `(${pendingTotal} pending in all; the oldest has waited ${oldest} days). The claimant hears nothing until it is reviewed.`,
    ...lines,
    `Review them at ${siteUrl.replace(/\/+$/, "")}/admin/business-claims`,
  ].join("\n");
}

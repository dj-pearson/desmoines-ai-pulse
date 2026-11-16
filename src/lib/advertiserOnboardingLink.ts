/**
 * The link a closer sends a won deal into the self-serve funnel with
 * (AOS-PROSPECT-007 AC3).
 *
 * Before this, marking a CRM opportunity "won" set onboarding_started and
 * pinged ops, and nothing on the board got the business to /advertise: the
 * closer had to tell them to find the page and search for their own listing.
 * The account already knows which listing it came from (crm_accounts.
 * business_ref, copied from prospect_leads.source_ref as "restaurants:<uuid>"),
 * so the link preselects it the same way ClaimListingCta does.
 *
 * Pure, so the URL the board copies and the deep link /advertise parses are
 * tested against each other. No price goes in the link: the page asks the
 * server for the total (CLAUDE.md, "Money is decided on the server").
 */
import { getCanonicalUrl } from "./brandConfig";

/** Listing types /advertise's deep link understands. Only event and
 *  restaurant can be sponsored; the other two get a "banner works" notice. */
export type OnboardingListingType = "restaurant" | "event" | "attraction" | "venue";

export interface OnboardingListing {
  type: OnboardingListingType;
  id: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// business_ref names the source table, so it is plural.
const TABLE_TO_TYPE: Record<string, OnboardingListingType> = {
  restaurants: "restaurant",
  events: "event",
  attractions: "attraction",
  venues: "venue",
};

/** The listing a crm_accounts.business_ref points at, or null for anything
 *  that is not "<known table>:<uuid>". */
export function listingFromBusinessRef(ref: string | null | undefined): OnboardingListing | null {
  if (!ref) return null;
  const sep = ref.indexOf(":");
  if (sep < 0) return null;
  const type = TABLE_TO_TYPE[ref.slice(0, sep).trim().toLowerCase()];
  const id = ref.slice(sep + 1).trim();
  if (!type || !UUID_RE.test(id)) return null;
  return { type, id };
}

/** UTM tags so a visit that starts from a sales handoff is told apart from one
 *  that found the page on its own: the same utm_* keys campaignAttribution.ts
 *  reads. */
export const ONBOARDING_UTM = {
  utm_source: "crm",
  utm_medium: "sales",
  utm_campaign: "won_deal",
} as const;

/** Absolute /advertise URL for a won account, listing preselected when known. */
export function advertiserOnboardingLink(account: { business_ref?: string | null }): string {
  const params = new URLSearchParams();
  const listing = listingFromBusinessRef(account.business_ref);
  if (listing) {
    params.set("listing_type", listing.type);
    params.set("listing_id", listing.id);
  }
  for (const [key, value] of Object.entries(ONBOARDING_UTM)) params.set(key, value);
  return getCanonicalUrl(`/advertise?${params.toString()}`);
}

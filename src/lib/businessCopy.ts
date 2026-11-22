/**
 * Sentences that must read the same on every business page (/advertise,
 * /campaigns/*, /business, /business-partnership, /submit-event).
 *
 * Which mailbox is monitored for business mail is open (business plan D16).
 * Until it is decided, the one address in BRAND is used everywhere, so
 * changing it is one edit in brandConfig.ts.
 */
import { BRAND } from "@/lib/brandConfig";

export const BUSINESS_CONTACT_EMAIL: string = BRAND.email;

export const BUSINESS_CONTACT_HREF = `mailto:${BUSINESS_CONTACT_EMAIL}`;

export const CREATIVE_REVIEW_COPY =
  "Every creative is reviewed before it runs. You'll get an email with the result.";

/** The Account plan's sentence (account.md), so both surfaces promise the same thing. */
export const SUBMISSION_REVIEW_COPY =
  "Most submissions are checked automatically within a few minutes; some go to a person.";

/**
 * Minimum number of days from today before a campaign can start. Gives time
 * for creative upload and review. Moved from Advertise.tsx.
 */
export const MIN_LEAD_TIME_DAYS = 3;

/**
 * What an owner can change, per listing type. Each line names only fields
 * update_claimed_listing accepts for that type and the /business editor
 * shows (WEB-ADS-048): attractions have no hours or phone on the form.
 */
export const CLAIM_EDIT_COPY: Record<"restaurant" | "attraction", string> = {
  restaurant:
    "Opening hours, phone, website, menu link, description and photo, changed from your own account instead of an email to us. You can also tell us if you're temporarily closed, closed for good, or open again.",
  attraction:
    "Description, website and photo, changed from your own account instead of an email to us.",
};

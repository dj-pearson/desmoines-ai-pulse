/**
 * Claim pages and owner outreach (growth roadmap #2).
 *
 * Pure: the claim page, the admin outreach list and their tests all read
 * these, so the URL an admin copies and the page it opens cannot drift apart.
 */
import { BRAND } from "./brandConfig";
import { createSlug } from "./slug";

export type ClaimableType = "restaurant" | "attraction";

export interface ClaimTeaser {
  name: string;
  claimed: boolean;
  closed: boolean;
  /** 30-day views floored to tens; null under ten, once claimed, or closed. */
  viewsFloor: number | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isClaimableType(v: string | undefined): v is ClaimableType {
  return v === "restaurant" || v === "attraction";
}

export function isListingId(v: string | undefined): v is string {
  return !!v && UUID_RE.test(v);
}

/** get_listing_claim_teaser's jsonb, checked. Null for null or anything odd. */
export function parseClaimTeaser(raw: unknown): ClaimTeaser | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.name !== "string" || typeof o.claimed !== "boolean") return null;
  const floor = o.views_30d_floor;
  return {
    name: o.name,
    claimed: o.claimed,
    closed: o.closed === true,
    viewsFloor: typeof floor === "number" && Number.isFinite(floor) && floor >= 10 ? floor : null,
  };
}

/** The path of the public claim page. */
export function claimPagePath(type: ClaimableType, id: string): string {
  return `/business/claim/${type}/${id}`;
}

/** The absolute URL an admin pastes into an email. Always production. */
export function claimPageUrl(type: ClaimableType, id: string): string {
  return `${BRAND.baseUrl}${claimPagePath(type, id)}`;
}

/** The listing's own page, built the way useMyBusinessClaims builds it. */
export function listingPath(type: ClaimableType, id: string, name: string, slug?: string | null): string {
  return type === "restaurant" ? `/restaurants/${slug || id}` : `/attractions/${createSlug(name)}`;
}

/** The claim page's headline. Only claims a number the function returned. */
export function teaserHeadline(teaser: ClaimTeaser): string {
  if (teaser.viewsFloor) {
    return `${teaser.viewsFloor.toLocaleString()}+ people looked at ${teaser.name} on ${BRAND.name} in the last 30 days`;
  }
  return `People find ${teaser.name} on ${BRAND.name}`;
}

/**
 * A short email an admin can send by hand. Plain text, no tracking, and it
 * quotes the same floored figure the claim page shows, so the owner who
 * clicks through sees the number they were told. Under ten views it makes no
 * traffic claim at all.
 */
export function outreachDraft(name: string, views: number, url: string): { subject: string; body: string } {
  const floor = views >= 10 ? Math.floor(views / 10) * 10 : null;
  const opener = floor
    ? `${floor}+ people looked at ${name}'s page on ${BRAND.name} in the last 30 days.`
    : `${name} has a page on ${BRAND.name}, the Des Moines events and dining guide.`;
  return {
    subject: `${name} on ${BRAND.name}`,
    body: [
      "Hi,",
      "",
      opener,
      "",
      "If you claim the listing (free), you can fix your hours and details, see how many people view and share your page each week, and compare it with similar places in town.",
      "",
      `Claim it here: ${url}`,
      "",
      "If this isn't the right person, I'd be grateful if you passed it on.",
      "",
      `${BRAND.name}`,
    ].join("\n"),
  };
}

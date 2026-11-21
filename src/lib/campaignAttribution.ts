/**
 * Campaign (UTM) attribution for signups (WEB-ADS-016).
 *
 * useNewsletterSubscription used to read utm_* from window.location at the
 * moment of submit. Most signups come from the footer form, after the visitor
 * has clicked at least once, and an SPA navigation drops the query string -
 * so a visitor who arrived from ?utm_source=facebook&utm_campaign=fall-guide
 * and subscribed on the second page was stored with no campaign at all. The
 * admin subscriber list shows utm_source / utm_campaign, and it was mostly
 * blank for exactly the visitors a campaign brought in.
 *
 * Two layers, and the split is about consent rather than convenience:
 *   - in memory, always: the last campaign seen in this tab survives SPA
 *     navigation. Nothing touches the device, so no consent is needed.
 *   - in safeStorage, only with analytics consent: survives a reload or a
 *     return visit for 30 days. Persisting a campaign on the device is
 *     analytics storage, and analyticsGranted() is the one place that decides
 *     whether that is allowed. Withdrawing consent removes the stored copy.
 *
 * The latest campaign link wins, matching the referral capture. A URL counts
 * as a campaign touch only when it names a source or a campaign; a bare
 * utm_medium says nothing anyone can act on.
 */
import { storage } from "@/lib/safeStorage";

/** safeStorage key. New in WEB-ADS-016; not renamed from anything. */
export const CAMPAIGN_ATTRIBUTION_STORAGE_KEY = "dmi_campaign_attribution";

/** A stored campaign is honoured for 30 days, then dropped unread. */
export const CAMPAIGN_ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** newsletter-subscribe truncates to the same length server-side. */
const MAX_VALUE_LENGTH = 200;

export interface CampaignAttribution {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

interface StoredCampaignAttribution extends CampaignAttribution {
  expiresAt: number;
}

const EMPTY: CampaignAttribution = { utm_source: null, utm_medium: null, utm_campaign: null };

let sessionAttribution: CampaignAttribution | null = null;

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_VALUE_LENGTH) : null;
}

function isTouch(a: CampaignAttribution): boolean {
  return a.utm_source !== null || a.utm_campaign !== null;
}

/** The campaign named by a query string, or null when it names none. */
export function attributionFromSearch(search: string): CampaignAttribution | null {
  const params = new URLSearchParams(search);
  const found: CampaignAttribution = {
    utm_source: clean(params.get("utm_source")),
    utm_medium: clean(params.get("utm_medium")),
    utm_campaign: clean(params.get("utm_campaign")),
  };
  return isTouch(found) ? found : null;
}

/** The stored campaign, or null when none, malformed or expired (an expired one is removed). */
export function readStoredCampaignAttribution(now = Date.now()): CampaignAttribution | null {
  const stored = storage.get<StoredCampaignAttribution>(CAMPAIGN_ATTRIBUTION_STORAGE_KEY);
  if (!stored || typeof stored !== "object") return null;
  const value: CampaignAttribution = {
    utm_source: clean(stored.utm_source),
    utm_medium: clean(stored.utm_medium),
    utm_campaign: clean(stored.utm_campaign),
  };
  if (typeof stored.expiresAt !== "number" || stored.expiresAt <= now || !isTouch(value)) {
    storage.remove(CAMPAIGN_ATTRIBUTION_STORAGE_KEY);
    return null;
  }
  return value;
}

function persist(a: CampaignAttribution, now: number): void {
  storage.set<StoredCampaignAttribution>(CAMPAIGN_ATTRIBUTION_STORAGE_KEY, {
    ...a,
    expiresAt: now + CAMPAIGN_ATTRIBUTION_TTL_MS,
  });
}

/**
 * Remember the campaign in `search`, if it names one. Kept in memory always;
 * written to the device only when `canPersist` (analytics consent) is true.
 */
export function captureCampaignAttribution(
  search: string,
  canPersist: boolean,
  now = Date.now(),
): void {
  const found = attributionFromSearch(search);
  if (!found) return;
  sessionAttribution = found;
  if (canPersist) persist(found, now);
}

/**
 * Consent changed. Granted: persist what this tab already saw, so accepting
 * the banner on the landing page still counts that landing. Withdrawn: remove
 * the stored copy; the in-memory one dies with the tab.
 */
export function applyAttributionConsent(granted: boolean, now = Date.now()): void {
  if (!granted) {
    storage.remove(CAMPAIGN_ATTRIBUTION_STORAGE_KEY);
    return;
  }
  if (sessionAttribution) persist(sessionAttribution, now);
}

/**
 * What a signup should carry: the current URL's campaign, else the one seen
 * earlier in this tab, else the stored one, else all nulls.
 */
export function resolveCampaignAttribution(search: string, now = Date.now()): CampaignAttribution {
  return (
    attributionFromSearch(search) ??
    sessionAttribution ??
    readStoredCampaignAttribution(now) ??
    { ...EMPTY }
  );
}

/** Test seam: forget the in-memory campaign. */
export function resetSessionAttributionForTests(): void {
  sessionAttribution = null;
}

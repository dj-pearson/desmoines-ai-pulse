/**
 * Cookie consent record: reading, writing, and the reopen signal.
 *
 * Split out of CookieConsentBanner.tsx (WEB-PERF-059). Analytics hooks that
 * run on every page imported hasConsent() from the component file, which
 * pulled the banner, Radix Checkbox/Label and their helpers into the entry
 * chunk for every visitor, including the returning ones whose choice is
 * already stored and who never see it. Everything a non-banner caller needs
 * lives here; the banner itself is loaded on demand by CookieConsentGate.
 *
 * Import from here, not from the component. src/lib/__tests__/cookieConsent
 * fails if anything but the gate imports the banner module.
 */

import { storage } from "@/lib/safeStorage";
import { logCookieConsent } from "@/lib/consentLog";

export const CONSENT_STORAGE_KEY = "cookie-consent";
/** Window event that asks the banner to reappear (see reopenConsentBanner). */
export const CONSENT_REOPEN_EVENT = "cookie-consent-reopen";
export const CONSENT_VERSION = "2026-04-13";
const CONSENT_LIFETIME_MS = 13 * 30 * 24 * 60 * 60 * 1000; // ~13 months

export interface CookieConsent {
  version: string;
  timestamp: string;
  essential: true; // always true, non-toggleable
  preferences: boolean;
  analytics: boolean;
  advertising: boolean;
  gpc?: boolean; // true if set via Global Privacy Control signal
}

export const DEFAULT_REJECT: Omit<CookieConsent, "timestamp"> = {
  version: CONSENT_VERSION,
  essential: true,
  preferences: false,
  analytics: false,
  advertising: false,
};

/**
 * Read the current stored consent record, or null if none / expired / stale version.
 */
export function getStoredConsent(): CookieConsent | null {
  const record = storage.get<CookieConsent>(CONSENT_STORAGE_KEY);
  if (!record) return null;
  if (record.version !== CONSENT_VERSION) return null;
  if (!record.timestamp) return null;
  const age = Date.now() - new Date(record.timestamp).getTime();
  if (Number.isNaN(age) || age > CONSENT_LIFETIME_MS) return null;
  return record;
}

export function detectGPC(): boolean {
  if (typeof navigator === "undefined") return false;
  // @ts-expect-error — globalPrivacyControl is not in the standard lib yet
  return navigator.globalPrivacyControl === true;
}

export function saveConsent(consent: CookieConsent) {
  storage.set(CONSENT_STORAGE_KEY, consent);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<CookieConsent>("cookie-consent-changed", {
        detail: consent,
      })
    );
  }
  // Append to the consent audit log for GDPR Art. 7 / CCPA record-keeping.
  // Fire-and-forget so a logging failure can't block the user's choice.
  void logCookieConsent(
    { analytics: consent.analytics, advertising: consent.advertising },
    { gpc: !!consent.gpc, version: consent.version }
  );
}

/**
 * Decide on mount whether the visitor must be asked. A Global Privacy Control
 * signal is recorded as a rejection here (CPRA/CPA treat it as a valid
 * opt-out), so a GPC visitor is never prompted and never downloads the banner.
 */
export function needsConsentPrompt(): boolean {
  if (getStoredConsent()) return false;
  if (detectGPC()) {
    saveConsent({
      ...DEFAULT_REJECT,
      timestamp: new Date().toISOString(),
      gpc: true,
    });
    return false;
  }
  return true;
}

/**
 * Utility — use in analytics/ads initialization code to check whether a
 * given consent category has been granted. Returns false if no record exists
 * (i.e., we treat the absence of explicit consent as denial).
 */
export function hasConsent(
  category: "preferences" | "analytics" | "advertising"
): boolean {
  const record = getStoredConsent();
  if (!record) return false;
  return !!record[category];
}

/**
 * Reopen the consent banner without discarding the user's current choice.
 * CookieConsentGate loads the banner on this event if it is not mounted yet,
 * and the banner reappears pre-filled with the stored selections. Preferred
 * over resetConsentPrompt() for "manage/change my choices" entry points
 * (footer link, Cookie Policy page) because it never silently wipes an
 * existing opt-out.
 */
export function reopenConsentBanner() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CONSENT_REOPEN_EVENT));
  }
}

/**
 * Clears the current record and reloads so the banner reappears. Prefer
 * reopenConsentBanner(); this hard-reset remains for callers that need the
 * record fully cleared.
 */
export function resetConsentPrompt() {
  storage.remove(CONSENT_STORAGE_KEY);
  if (typeof window !== "undefined") {
    window.location.reload();
  }
}

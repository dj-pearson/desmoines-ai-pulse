/**
 * Cookie Consent Banner
 *
 * Granular, opt-in cookie consent component. Complies with:
 *  - GDPR / UK GDPR (ePrivacy Directive) — requires opt-in for non-essential cookies
 *  - CCPA/CPRA — "Do Not Sell or Share" / opt-out of targeted advertising
 *  - Colorado Privacy Act, Virginia CDPA, Connecticut CDPA — universal opt-out recognition
 *  - ADA/WCAG 2.1 AA — keyboard navigable, screen-reader friendly, focus management
 *
 * Behavior:
 *  - Non-blocking banner shown until the user makes an explicit choice
 *  - "Accept All", "Reject Non-Essential", and "Customize" (granular) options
 *  - Essential cookies (auth, session, security) cannot be disabled
 *  - Choice persisted in safe storage; re-prompts after 13 months per GDPR guidance
 *  - Honors Global Privacy Control (GPC) browser signal — auto-rejects non-essential
 *    cookies when navigator.globalPrivacyControl === true (required by CPA/CPRA)
 *  - Emits a window event `cookie-consent-changed` so analytics/marketing scripts
 *    can react without coupling to this component
 */

import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { storage } from "@/lib/safeStorage";
import { logCookieConsent } from "@/lib/consentLog";
import { Cookie, X } from "lucide-react";

const STORAGE_KEY = "cookie-consent";
const CONSENT_VERSION = "2026-04-13";
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

const DEFAULT_REJECT: Omit<CookieConsent, "timestamp"> = {
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
  const record = storage.get<CookieConsent>(STORAGE_KEY);
  if (!record) return null;
  if (record.version !== CONSENT_VERSION) return null;
  if (!record.timestamp) return null;
  const age = Date.now() - new Date(record.timestamp).getTime();
  if (Number.isNaN(age) || age > CONSENT_LIFETIME_MS) return null;
  return record;
}

function detectGPC(): boolean {
  if (typeof navigator === "undefined") return false;
  // @ts-expect-error — globalPrivacyControl is not in the standard lib yet
  return navigator.globalPrivacyControl === true;
}

function saveConsent(consent: CookieConsent) {
  storage.set(STORAGE_KEY, consent);
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

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [prefs, setPrefs] = useState({
    preferences: false,
    analytics: false,
    advertising: false,
  });

  // Decide whether to show the banner on mount
  useEffect(() => {
    const existing = getStoredConsent();
    if (existing) {
      setVisible(false);
      return;
    }

    // Honor Global Privacy Control — auto-record a rejection for non-essential cookies
    // as required by CPRA/CPA regulations that treat GPC as a valid opt-out signal.
    if (detectGPC()) {
      saveConsent({
        ...DEFAULT_REJECT,
        timestamp: new Date().toISOString(),
        gpc: true,
      });
      setVisible(false);
      return;
    }

    setVisible(true);
  }, []);

  const acceptAll = useCallback(() => {
    saveConsent({
      version: CONSENT_VERSION,
      timestamp: new Date().toISOString(),
      essential: true,
      preferences: true,
      analytics: true,
      advertising: true,
    });
    setVisible(false);
  }, []);

  const rejectNonEssential = useCallback(() => {
    saveConsent({
      ...DEFAULT_REJECT,
      timestamp: new Date().toISOString(),
    });
    setVisible(false);
  }, []);

  const saveCustom = useCallback(() => {
    saveConsent({
      version: CONSENT_VERSION,
      timestamp: new Date().toISOString(),
      essential: true,
      preferences: prefs.preferences,
      analytics: prefs.analytics,
      advertising: prefs.advertising,
    });
    setVisible(false);
  }, [prefs]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-description"
      className="fixed bottom-0 inset-x-0 z-[60] p-4 sm:p-6"
    >
      <div className="max-w-4xl mx-auto rounded-lg border bg-background shadow-2xl">
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <Cookie
              className="h-6 w-6 text-primary flex-shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <h2
                id="cookie-consent-title"
                className="text-base font-semibold mb-1"
              >
                We value your privacy
              </h2>
              <p
                id="cookie-consent-description"
                className="text-sm text-muted-foreground"
              >
                We use cookies to keep you signed in, remember your preferences,
                measure how people use the site, and — with your permission —
                personalize content and ads. You can accept all, reject
                non-essential, or customize your choices. Essential cookies are
                always on because the site can&apos;t function without them.{" "}
                <Link
                  to="/cookie-policy"
                  className="underline hover:no-underline"
                >
                  Learn more
                </Link>
                .
              </p>
            </div>
            <button
              type="button"
              onClick={rejectNonEssential}
              aria-label="Reject non-essential cookies and close banner"
              className="tap-area-44 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary rounded-sm p-1"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {showDetails && (
            <fieldset className="mt-5 space-y-3 border-t pt-4">
              <legend className="sr-only">Cookie categories</legend>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="cc-essential"
                  checked
                  disabled
                  aria-describedby="cc-essential-desc"
                />
                <div className="flex-1">
                  <Label htmlFor="cc-essential" className="text-sm font-medium">
                    Essential (always on)
                  </Label>
                  <p
                    id="cc-essential-desc"
                    className="text-xs text-muted-foreground"
                  >
                    Authentication, security, session state, CSRF protection. Required for the site to work.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="cc-preferences"
                  checked={prefs.preferences}
                  onCheckedChange={(v) =>
                    setPrefs((p) => ({ ...p, preferences: !!v }))
                  }
                  aria-describedby="cc-preferences-desc"
                />
                <div className="flex-1">
                  <Label
                    htmlFor="cc-preferences"
                    className="text-sm font-medium"
                  >
                    Preferences
                  </Label>
                  <p
                    id="cc-preferences-desc"
                    className="text-xs text-muted-foreground"
                  >
                    Remembers UI settings like theme, language, and recently-viewed venues.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="cc-analytics"
                  checked={prefs.analytics}
                  onCheckedChange={(v) =>
                    setPrefs((p) => ({ ...p, analytics: !!v }))
                  }
                  aria-describedby="cc-analytics-desc"
                />
                <div className="flex-1">
                  <Label htmlFor="cc-analytics" className="text-sm font-medium">
                    Analytics
                  </Label>
                  <p
                    id="cc-analytics-desc"
                    className="text-xs text-muted-foreground"
                  >
                    Aggregated usage measurement (page views, feature adoption). Helps us improve the product.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="cc-advertising"
                  checked={prefs.advertising}
                  onCheckedChange={(v) =>
                    setPrefs((p) => ({ ...p, advertising: !!v }))
                  }
                  aria-describedby="cc-advertising-desc"
                />
                <div className="flex-1">
                  <Label
                    htmlFor="cc-advertising"
                    className="text-sm font-medium"
                  >
                    Advertising &amp; targeting
                  </Label>
                  <p
                    id="cc-advertising-desc"
                    className="text-xs text-muted-foreground"
                  >
                    Partner cookies used to personalize ads and measure campaigns. Turning this off opts you out of &quot;sale&quot; and &quot;sharing&quot; under CCPA/CPRA.
                  </p>
                </div>
              </div>
            </fieldset>
          )}

          <div className="mt-5 flex flex-col sm:flex-row gap-2 sm:justify-end">
            {!showDetails ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDetails(true)}
                >
                  Customize
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={rejectNonEssential}
                >
                  Reject non-essential
                </Button>
                <Button size="sm" onClick={acceptAll}>
                  Accept all
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDetails(false)}
                >
                  Back
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={rejectNonEssential}
                >
                  Reject non-essential
                </Button>
                <Button size="sm" onClick={saveCustom}>
                  Save my choices
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
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
 * Allows the user to reopen and change their choices (e.g. from a footer link).
 * Clears the current record so the banner reappears on next render.
 */
export function resetConsentPrompt() {
  storage.remove(STORAGE_KEY);
  if (typeof window !== "undefined") {
    window.location.reload();
  }
}

export default CookieConsentBanner;

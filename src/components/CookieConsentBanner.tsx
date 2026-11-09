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
 *  - Can be reopened at any time via `reopenConsentBanner()` (e.g. the footer
 *    "Your Privacy Choices" link) WITHOUT discarding the user's stored choice —
 *    the panel re-appears pre-filled with the current selections.
 */

import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  CONSENT_REOPEN_EVENT,
  CONSENT_VERSION,
  DEFAULT_REJECT,
  getStoredConsent,
  saveConsent,
} from "@/lib/cookieConsent";
import { Cookie, X } from "lucide-react";

interface CookieConsentBannerProps {
  /**
   * Mount already open on the Customize panel. CookieConsentGate passes this
   * when a reopenConsentBanner() call is what caused the banner to load: that
   * event fired before this component existed to hear it.
   */
  reopenOnMount?: boolean;
}

/** Three across on a phone, 44px tall, labels allowed to wrap. */
const CHOICE_BUTTON =
  "h-auto min-h-11 whitespace-normal px-2 text-xs leading-tight sm:h-9 sm:min-h-0 sm:px-3 sm:text-sm";

export function CookieConsentBanner({ reopenOnMount = false }: CookieConsentBannerProps) {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [prefs, setPrefs] = useState({
    preferences: false,
    analytics: false,
    advertising: false,
  });

  // The gate mounts this only when needsConsentPrompt() said to ask (no
  // stored record, no GPC signal, which it already recorded) or when a reopen
  // was requested, so a missing record here means "ask".
  useEffect(() => {
    setVisible(!getStoredConsent());
  }, []);

  // Allow the banner to be reopened from anywhere (e.g. the footer "Your Privacy
  // Choices" link) without clearing the stored record. We pre-fill the toggles
  // with the current choices so the user edits rather than starts over — required
  // for a functional, non-destructive CPRA opt-out control.
  useEffect(() => {
    const handleReopen = () => {
      const current = getStoredConsent();
      if (current) {
        setPrefs({
          preferences: current.preferences,
          analytics: current.analytics,
          advertising: current.advertising,
        });
      }
      setShowDetails(true);
      setVisible(true);
    };
    if (reopenOnMount) handleReopen();
    window.addEventListener(CONSENT_REOPEN_EVENT, handleReopen);
    return () => window.removeEventListener(CONSENT_REOPEN_EVENT, handleReopen);
  }, [reopenOnMount]);

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

  // Marks <html> while the banner is up, so the accessibility widget (fixed
  // bottom-left, z-[9998]) can step aside instead of covering "Reject
  // non-essential" on a phone. An attribute rather than a shared store keeps
  // the two components from importing each other.
  useEffect(() => {
    const root = document.documentElement;
    if (visible) root.setAttribute("data-consent-open", "");
    else root.removeAttribute("data-consent-open");
    return () => root.removeAttribute("data-consent-open");
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-description"
      className="fixed bottom-0 inset-x-0 z-[60] p-2 sm:p-6"
    >
      {/* Below sm the banner is one line and three buttons (about 140px on a
          390x844 phone); the full text and the categories are behind
          Customize. It used to cover 418-844px of an 844px screen. */}
      <div className="max-w-4xl mx-auto max-h-[85dvh] overflow-y-auto rounded-lg border bg-background shadow-2xl">
        <div className="p-3 sm:p-6">
          <div className="flex items-center gap-3 sm:items-start">
            <Cookie
              className="hidden h-6 w-6 text-primary flex-shrink-0 mt-0.5 sm:block"
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <h2
                id="cookie-consent-title"
                className="sr-only text-base font-semibold mb-1 sm:not-sr-only"
              >
                We value your privacy
              </h2>
              <p
                id="cookie-consent-description"
                className="text-sm text-muted-foreground"
              >
                <span className={showDetails ? "hidden" : "sm:hidden"}>
                  We use cookies; essential ones are always on.{" "}
                </span>
                <span className={showDetails ? undefined : "hidden sm:inline"}>
                We use cookies to keep you signed in, remember your preferences,
                measure how people use the site, and — with your permission —
                personalize content and ads. You can accept all, reject
                non-essential, or customize your choices. Essential cookies are
                always on because the site can&apos;t function without them.{" "}
                </span>
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
                    Signing you in, keeping you signed in, and the bot protection in front of the site. Required for the site to work.
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

          <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-5 sm:flex sm:flex-row sm:justify-end">
            {!showDetails ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className={CHOICE_BUTTON}
                  onClick={() => setShowDetails(true)}
                >
                  Customize
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={CHOICE_BUTTON}
                  onClick={rejectNonEssential}
                >
                  Reject non-essential
                </Button>
                <Button size="sm" className={CHOICE_BUTTON} onClick={acceptAll}>
                  Accept all
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className={CHOICE_BUTTON}
                  onClick={() => setShowDetails(false)}
                >
                  Back
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={CHOICE_BUTTON}
                  onClick={rejectNonEssential}
                >
                  Reject non-essential
                </Button>
                <Button size="sm" className={CHOICE_BUTTON} onClick={saveCustom}>
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

export default CookieConsentBanner;

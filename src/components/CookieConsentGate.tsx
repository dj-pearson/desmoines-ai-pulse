/**
 * Loads the cookie consent banner only for visitors who will see it
 * (WEB-PERF-059).
 *
 * The banner used to sit in the entry chunk, so every page view paid for it
 * and for Radix Checkbox, Label and Presence, though a returning visitor with
 * a stored choice never renders it. Now the decision is made here from the
 * stored record, and the banner chunk is fetched only when the visitor has no
 * valid choice, or when something calls reopenConsentBanner() (footer link,
 * Cookie Policy, Privacy Controls).
 *
 * The banner is position:fixed, so arriving one chunk later moves nothing on
 * the page (no CLS).
 */

import { lazy, Suspense, useEffect, useState } from "react";
import { CONSENT_REOPEN_EVENT, needsConsentPrompt } from "@/lib/cookieConsent";

type GateMode = "hidden" | "prompt" | "reopen";

const CookieConsentBanner = lazy(() =>
  import("@/components/CookieConsentBanner")
    .then((m) => ({ default: m.CookieConsentBanner }))
    // A failed chunk must not take the app down through the root error
    // boundary. Rendering nothing leaves no stored record, which every
    // hasConsent() caller already treats as denial.
    .catch(() => ({ default: () => null })),
);

export function CookieConsentGate() {
  const [mode, setMode] = useState<GateMode>("hidden");

  useEffect(() => {
    if (needsConsentPrompt()) setMode("prompt");
    // Once the banner is mounted it listens for this event itself; the gate
    // only needs it to load the banner the first time.
    const onReopen = () => setMode((m) => (m === "hidden" ? "reopen" : m));
    window.addEventListener(CONSENT_REOPEN_EVENT, onReopen);
    return () => window.removeEventListener(CONSENT_REOPEN_EVENT, onReopen);
  }, []);

  if (mode === "hidden") return null;

  return (
    <Suspense fallback={null}>
      <CookieConsentBanner reopenOnMount={mode === "reopen"} />
    </Suspense>
  );
}

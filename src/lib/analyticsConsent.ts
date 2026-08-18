/**
 * Analytics consent bridge (WEB-LEGAL-001).
 *
 * index.html sets Google Consent Mode v2 defaults to "denied" and deliberately
 * does not request gtag.js. This module is the only thing that lifts either
 * restriction, and it does so strictly from the stored consent record.
 *
 * Why the grant lives here rather than in the inline script: the validity rules
 * for a consent record (version match, 13-month expiry, absence means denial)
 * belong to CookieConsentBanner.tsx. Duplicating them in a hand-written inline
 * script would let the two drift, and a drift in the permissive direction is
 * exactly the failure this story exists to fix. getStoredConsent() stays the
 * single source of truth.
 *
 * GPC needs no special handling here: the banner records a rejection when it
 * sees the signal, so a GPC visitor's record simply has analytics:false.
 */

import { getStoredConsent, type CookieConsent } from "@/components/CookieConsentBanner";

type Gtag = (...args: unknown[]) => void;

interface AnalyticsWindow extends Window {
  gtag?: Gtag;
  __dmiLoadAnalytics?: () => void;
}

function win(): AnalyticsWindow | null {
  return typeof window === "undefined" ? null : (window as AnalyticsWindow);
}

/**
 * True when the visitor has actively granted the analytics category. Absence of
 * a record, an expired record and a stale-version record all read as false.
 */
export function analyticsGranted(consent?: CookieConsent | null): boolean {
  const record = consent === undefined ? getStoredConsent() : consent;
  return !!record?.analytics;
}

function advertisingGranted(consent?: CookieConsent | null): boolean {
  const record = consent === undefined ? getStoredConsent() : consent;
  return !!record?.advertising;
}

/**
 * Drop the cookies GA4 sets, so revoking consent stops the identifier rather
 * than merely stopping new collection. Cleared on the bare host and on the
 * registrable-domain form, which is where gtag.js actually writes them.
 */
function clearAnalyticsCookies(): void {
  if (typeof document === "undefined") return;
  const names = document.cookie
    .split(";")
    .map((c) => c.split("=")[0]?.trim())
    .filter((n): n is string => !!n && (n === "_ga" || n.startsWith("_ga_") || n === "_gid" || n.startsWith("_gat")));

  const host = window.location.hostname;
  const domains = [undefined, host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`];
  for (const name of names) {
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ""}`;
    }
  }
}

function apply(consent?: CookieConsent | null): void {
  const w = win();
  if (!w?.gtag) return;

  const analytics = analyticsGranted(consent);
  const advertising = advertisingGranted(consent);

  w.gtag("consent", "update", {
    analytics_storage: analytics ? "granted" : "denied",
    ad_storage: advertising ? "granted" : "denied",
    ad_user_data: advertising ? "granted" : "denied",
    ad_personalization: advertising ? "granted" : "denied",
    personalization_storage: analytics ? "granted" : "denied",
  });

  if (analytics) {
    w.__dmiLoadAnalytics?.();
  } else {
    clearAnalyticsCookies();
  }
}

/**
 * Call once at startup. Applies the stored choice immediately, then tracks the
 * banner's `cookie-consent-changed` event so a toggle takes effect without a
 * reload (the banner never reloads the page on change).
 */
export function initAnalyticsConsent(): void {
  const w = win();
  if (!w) return;

  apply();

  w.addEventListener("cookie-consent-changed", (event) => {
    apply((event as CustomEvent<CookieConsent>).detail ?? undefined);
  });
}

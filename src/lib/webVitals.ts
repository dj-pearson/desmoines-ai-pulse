/**
 * Real-user web-vitals (RUM) reporting (WEB-PERF-007).
 *
 * Dynamically imports the `web-vitals` library on idle (kept off the critical
 * path / initial bundle), samples a fraction of sessions, respects Do-Not-Track,
 * and posts anonymous LCP/CLS/INP/TTFB readings to the web_vitals table. The
 * weekly job aggregates these into p75 trends + regression alerts.
 *
 * CONSENT (WEB-PERF-039 AC3). These beacons are first-party and carry no
 * identifier that outlives the tab, but they are still measurement, and the
 * banner offers an analytics category that a visitor can decline. So this waits
 * for the same grant GA waits for, through the same helper - analyticsGranted()
 * reads the stored record and treats absence, expiry and a stale version as a
 * refusal. Do-Not-Track is kept as a second, independent refusal: the banner
 * records analytics:false for a GPC visitor, but DNT is a different signal and
 * a visitor sending it has not agreed to anything.
 */
import { supabase } from "@/integrations/supabase/client";
import { analyticsGranted } from "@/lib/analyticsConsent";

const SAMPLE_RATE = 0.2; // 20% of (non-DNT) sessions

/** Collapse dynamic detail routes so trends group cleanly. */
function pageGroup(path: string): string {
  if (/^\/events\/[^/]+$/.test(path)) return "/events/detail";
  if (/^\/restaurants\/[^/]+$/.test(path)) return "/restaurants/detail";
  if (/^\/attractions\/[^/]+$/.test(path)) return "/attractions/detail";
  if (path === "/" || path === "") return "/home";
  return path.replace(/\/$/, "");
}

function doNotTrack(): boolean {
  if (typeof navigator === "undefined") return true;
  const nav = navigator as Navigator & { msDoNotTrack?: string };
  const win = window as Window & { doNotTrack?: string };
  return (
    nav.doNotTrack === "1" ||
    win.doNotTrack === "1" ||
    nav.msDoNotTrack === "1"
  );
}

let started = false;
let awaitingConsent = false;

export function initWebVitals(): void {
  if (started || typeof window === "undefined") return;
  if (doNotTrack()) return;

  if (!analyticsGranted()) {
    // Not "never" - "not yet". The banner fires cookie-consent-changed when the
    // visitor chooses, and without this a first-time visitor who accepts is
    // measured from their NEXT page load onwards, which is the load least like
    // the one that matters. `started` is deliberately not latched above, so the
    // re-entry below reaches the gates again.
    if (!awaitingConsent) {
      awaitingConsent = true;
      window.addEventListener("cookie-consent-changed", () => {
        awaitingConsent = false;
        initWebVitals();
      }, { once: true });
    }
    return;
  }

  started = true;
  if (Math.random() > SAMPLE_RATE) return;

  const sessionId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now());

  const report = (metric: { name: string; value: number; rating?: string }) => {
    try {
      // .then(), not `void`. A PostgrestBuilder is a THENABLE, not a promise:
      // it issues no request until something subscribes to it. `void <builder>`
      // evaluates the expression and throws the result away without ever
      // subscribing, so this table had never received a single row - which is
      // what the admin panel's "No web-vitals rollup yet" was actually saying.
      // Measured in a browser: with the void, TTFB fired and zero requests
      // left the page; with this, one POST per metric. WEB-PERF-039.
      void supabase
        .from("web_vitals")
        .insert({
          metric: metric.name,
          value: metric.value,
          rating: metric.rating ?? null,
          page_group: pageGroup(window.location.pathname),
          path: window.location.pathname,
          session_id: sessionId,
        })
        .then(undefined, () => {
          // never let telemetry break the page
        });
    } catch {
      // never let telemetry break the page
    }
  };

  import("web-vitals")
    .then((wv) => {
      wv.onLCP(report);
      wv.onCLS(report);
      wv.onINP(report);
      wv.onTTFB(report);
    })
    .catch(() => {
      // web-vitals failed to load — ignore
    });
}

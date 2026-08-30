/**
 * Real-user web-vitals (RUM) reporting (WEB-PERF-007).
 *
 * Dynamically imports the `web-vitals` library on idle (kept off the critical
 * path / initial bundle), samples a fraction of sessions, respects Do-Not-Track,
 * and posts anonymous LCP/CLS/INP/TTFB readings to the web_vitals table. The
 * weekly job aggregates these into p75 trends + regression alerts.
 */
import { supabase } from "@/integrations/supabase/client";

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

export function initWebVitals(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  if (doNotTrack()) return;
  if (Math.random() > SAMPLE_RATE) return;

  const sessionId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now());

  const report = (metric: { name: string; value: number; rating?: string }) => {
    try {
      void supabase.from("web_vitals").insert({
        metric: metric.name,
        value: metric.value,
        rating: metric.rating ?? null,
        page_group: pageGroup(window.location.pathname),
        path: window.location.pathname,
        session_id: sessionId,
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

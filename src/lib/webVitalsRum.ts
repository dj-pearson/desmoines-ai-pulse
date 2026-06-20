import { supabase } from "@/integrations/supabase/client";

/**
 * Real-user web-vitals collection (WEB-PERF-007). Reports LCP/CLS/INP/TTFB from a
 * sampled slice of anonymous sessions to the `web_vitals` table, so performance
 * regressions report themselves. Respects Do-Not-Track, never blocks rendering
 * (the web-vitals lib is dynamically imported on idle), and adds nothing to the
 * critical bundle.
 */

const SAMPLE_RATE = 0.1; // 10% of sessions
const SESSION_KEY = "wv_session_id";

function doNotTrack(): boolean {
  if (typeof navigator === "undefined") return true;
  const nav = navigator as Navigator & { msDoNotTrack?: string };
  const win = typeof window !== "undefined" ? (window as Window & { doNotTrack?: string }) : undefined;
  const dnt = nav.doNotTrack ?? win?.doNotTrack ?? nav.msDoNotTrack;
  return dnt === "1" || dnt === "yes";
}

/** Coarse page-group from the path so metrics aggregate by surface, not by id. */
function pageGroup(path: string): string {
  if (path === "/" || path === "") return "home";
  const seg = path.split("/").filter(Boolean);
  const detail = seg.length >= 2 && seg[1].length > 0;
  switch (seg[0]) {
    case "events": return detail ? "event-detail" : "events";
    case "restaurants": return detail ? "restaurant-detail" : "restaurants";
    case "attractions": return detail ? "attraction-detail" : "attractions";
    case "trip-planner": return "trip-planner";
    default: return seg[0] || "other";
  }
}

function sessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

let started = false;

export function initWebVitalsRum(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  // Honor DNT and the sampling rate before doing any work.
  if (doNotTrack() || Math.random() > SAMPLE_RATE) return;

  const run = () => {
    const sid = sessionId();
    void import("web-vitals").then(({ onLCP, onCLS, onINP, onTTFB }) => {
      const report = (metric: { name: string; value: number; rating?: string }) => {
        void supabase
          .from("web_vitals")
          .insert({
            metric: metric.name,
            value: metric.value,
            rating: metric.rating ?? null,
            page_group: pageGroup(window.location.pathname),
            session_id: sid,
          })
          .then(() => {});
      };
      onLCP(report);
      onCLS(report);
      onINP(report);
      onTTFB(report);
    });
  };

  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  if (typeof w.requestIdleCallback === "function") {
    w.requestIdleCallback(run, { timeout: 5000 });
  } else {
    window.setTimeout(run, 2000);
  }
}

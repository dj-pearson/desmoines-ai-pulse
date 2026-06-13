/**
 * Real-User-Monitoring (RUM) Core Web Vitals reporting (WEB-PERF-007).
 *
 * Anonymous, sampled, DNT-respecting. The `web-vitals` library is dynamically
 * imported on idle (see lib/lazyInit → performance.trackWebVitals) so this adds
 * nothing to the critical path. Metrics are buffered and flushed with
 * navigator.sendBeacon on page-hide, so reporting never blocks rendering and
 * survives the page unload.
 */

const SAMPLE_RATE = 0.25; // report ~25% of eligible sessions
const ENDPOINT = "/functions/v1/web-vitals-collector";

interface BufferedSample {
  metric: string;
  value: number;
  rating?: string;
  page_group: string;
  navigation_type?: string;
  connection_type?: string;
}

/** Respect Do-Not-Track / Global Privacy Control across browser variants. */
function doNotTrack(): boolean {
  try {
    const nav = navigator as Navigator & {
      doNotTrack?: string;
      msDoNotTrack?: string;
      globalPrivacyControl?: boolean;
    };
    const win = window as Window & { doNotTrack?: string };
    const dnt = nav.doNotTrack ?? win.doNotTrack ?? nav.msDoNotTrack;
    return dnt === "1" || dnt === "yes" || nav.globalPrivacyControl === true;
  } catch {
    return false;
  }
}

/** Normalize the current path to a bounded set of page-group buckets. */
function currentPageGroup(): string {
  const path = window.location.pathname;
  if (path === "/" || path === "") return "home";
  const [a, b] = path.split("/").filter(Boolean);
  switch (a) {
    case "events":
      return b ? "event-detail" : "events-list";
    case "restaurants":
      return b ? "restaurant-detail" : "restaurants-list";
    case "attractions":
      return b ? "attraction-detail" : "attractions-list";
    case "articles":
      return b ? "article-detail" : "articles-list";
    case "playgrounds":
      return "playgrounds";
    case "trip-planner":
      return "trip-planner";
    case "search":
      return "search";
    case "auth":
      return "auth";
    case "profile":
      return "profile";
    case "dashboard":
      return "dashboard";
    case "admin":
      return "admin";
    default:
      return "other";
  }
}

function connectionType(): string | undefined {
  const c = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
  return c?.effectiveType;
}

/**
 * Wire web-vitals reporting. Safe to call multiple times (idempotent via a
 * module flag). No-op outside production, inside Capacitor, or when DNT is set.
 */
export function initWebVitalsReporting(): void {
  if (typeof window === "undefined") return;
  if (started) return;

  // Web RUM only: skip the native app shell and non-production / local builds.
  const isCapacitor = !!(window as { Capacitor?: unknown }).Capacitor;
  const baseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (isCapacitor || !import.meta.env.PROD || !baseUrl) return;
  if (doNotTrack()) return;
  if (Math.random() >= SAMPLE_RATE) return;

  started = true;
  const url = `${baseUrl.replace(/\/$/, "")}${ENDPOINT}`;
  const buffer: BufferedSample[] = [];
  const pageGroup = currentPageGroup();
  const conn = connectionType();

  const record = (metric: { name: string; value: number; rating?: string; navigationType?: string }) => {
    buffer.push({
      metric: metric.name,
      value: metric.value,
      rating: metric.rating,
      page_group: pageGroup,
      navigation_type: metric.navigationType,
      connection_type: conn,
    });
  };

  const flush = () => {
    if (buffer.length === 0) return;
    const payload = JSON.stringify({ samples: buffer.splice(0, buffer.length) });
    try {
      // text/plain Blob keeps this a CORS-simple request (no preflight) so
      // sendBeacon can deliver it during unload.
      const blob = new Blob([payload], { type: "text/plain" });
      if (!navigator.sendBeacon || !navigator.sendBeacon(url, blob)) {
        fetch(url, { method: "POST", body: payload, keepalive: true }).catch(() => {});
      }
    } catch {
      // Telemetry must never throw into the app.
    }
  };

  import("web-vitals")
    .then(({ onCLS, onINP, onLCP, onTTFB, onFCP }) => {
      onCLS(record);
      onINP(record);
      onLCP(record);
      onTTFB(record);
      onFCP(record);
    })
    .catch(() => {});

  // Flush when the page is backgrounded or unloaded.
  addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  addEventListener("pagehide", flush);
}

let started = false;

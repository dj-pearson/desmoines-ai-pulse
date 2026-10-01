import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { BRAND } from "@/lib/brandConfig";
import { cn } from "@/lib/utils";
import { createLogger } from "@/lib/logger";

const log = createLogger("PreferredSourceButton");

/**
 * Google "preferred source" button (SEO-037).
 *
 * Google's documented install is two lines: publisher.js in <head> and a
 * `<div google-add-preferred-source-btn>` in the body
 * (developers.google.com/search/docs/appearance/preferred-sources). This keeps
 * that markup but changes WHEN the script arrives:
 *
 *   - Not in <head>. publisher.js is ~140 KB and nothing above the fold needs
 *     it, so it is injected only once a button scrolls near the viewport. No
 *     LCP or TBT cost on any page.
 *   - Never during prerender. scripts/prerender.mjs drives puppeteer, which sets
 *     navigator.webdriver. Running the script there would bake Google's shadow
 *     DOM into static HTML; instead the static HTML carries the plain deeplink,
 *     which is Google's other documented install and works with no JavaScript.
 *     Playwright sets the same flag, so E2E sees the link too.
 *   - The link stays until the script has actually inflated the button (it
 *     attaches an open shadow root). A blocked script, a CSP refusal or a
 *     timeout all leave the link in place rather than an empty box.
 *
 * Theme: publisher.js reads data-theme once, when it inflates an element, and
 * an element can only get one shadow root. So the div is keyed by theme; a
 * theme toggle mounts a fresh div and init() is called again for it. init()
 * skips elements it has already marked data-initialized.
 */

const PREFERRED_SOURCE_SCRIPT_SRC = "https://news.google.com/swg/js/v1/publisher.js";

const PREFERRED_SOURCE_DOMAIN = new URL(BRAND.baseUrl).hostname;

const PREFERRED_SOURCE_FALLBACK_URL = `https://www.google.com/preferences/source?q=${PREFERRED_SOURCE_DOMAIN}`;

/** How long to wait for the shadow root after the script loads. */
const INFLATE_TIMEOUT_MS = 4000;
const INFLATE_POLL_MS = 150;

type Status = "idle" | "loading" | "ready" | "failed";

interface PreferredSourceApi {
  init: (options?: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    PREFERRED_SOURCE?: { api?: PreferredSourceApi };
  }
}

let scriptPromise: Promise<void> | null = null;

/** One script tag per page, however many buttons mount. A failure is sticky. */
function loadPublisherScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PREFERRED_SOURCE_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("publisher.js failed to load"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** False in prerender (puppeteer), under Playwright, and in browsers without IntersectionObserver. */
function canLoadThirdPartyScript(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (navigator.webdriver) return false;
  return typeof IntersectionObserver !== "undefined";
}

export interface PreferredSourceButtonProps {
  /**
   * Surface the button sits on. "dark" pins Google's dark theme and light link
   * text, for always-dark surfaces like the footer. "auto" follows the site theme.
   */
  surface?: "auto" | "dark";
  /** Short line shown above the button. Omit for a bare button. */
  description?: string;
  className?: string;
}

export function PreferredSourceButton({
  surface = "auto",
  description,
  className,
}: PreferredSourceButtonProps) {
  const { actualTheme } = useTheme();
  const theme = surface === "dark" ? "dark" : actualTheme;

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    if (!canLoadThirdPartyScript()) return;
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          setStatus("loading");
        }
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (status !== "loading" && status !== "ready") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    loadPublisherScript()
      .then(() => {
        if (cancelled) return;
        window.PREFERRED_SOURCE?.api?.init();
        const startedAt = Date.now();
        const check = () => {
          if (cancelled) return;
          if (buttonRef.current?.shadowRoot) {
            setStatus("ready");
          } else if (Date.now() - startedAt > INFLATE_TIMEOUT_MS) {
            setStatus("failed");
          } else {
            timer = setTimeout(check, INFLATE_POLL_MS);
          }
        };
        check();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        log.warn("loadPublisherScript", "publisher.js unavailable, keeping the deeplink", {
          error: error instanceof Error ? error.message : String(error),
        });
        setStatus("failed");
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // `theme` is a dependency on purpose: a new theme mounts a new div to inflate.
  }, [status, theme]);

  const showGoogleButton = status === "loading" || status === "ready";
  const showLink = status !== "ready";

  return (
    <div
      ref={rootRef}
      className={cn("flex flex-col gap-3", className)}
      data-preferred-source={status}
    >
      {description && (
        <p
          className={cn(
            "text-sm max-w-prose",
            surface === "dark" ? "text-neutral-300" : "text-muted-foreground",
          )}
        >
          {description}
        </p>
      )}
      {/* Fixed-height slot so swapping link for button does not shift layout. */}
      <div className="flex min-h-10 items-center">
        {showGoogleButton && (
          <div
            key={theme}
            ref={buttonRef}
            google-add-preferred-source-btn=""
            data-theme={theme}
            data-lang="en"
          />
        )}
        {showLink && (
          <a
            href={PREFERRED_SOURCE_FALLBACK_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-preferred-source-link=""
            className={cn(
              "inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              surface === "dark"
                ? "border-neutral-600 text-white hover:bg-neutral-800 focus-visible:ring-offset-neutral-900"
                : "border-border text-foreground hover:bg-muted",
            )}
          >
            Add {BRAND.name} as a preferred source on Google
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
      </div>
    </div>
  );
}

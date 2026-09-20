/**
 * Cloudflare Turnstile (WEB-SEC-029).
 *
 * The signup, login and password-reset forms had nothing a script has to
 * clear. The only defences were a disposable-domain RPC and the two lockouts
 * from WEB-SEC-027/028, and a lockout is per-identity: it bounds credential
 * stuffing against ONE account, and does nothing about a thousand scripted
 * signups burning the confirmation-email quota and filling auth.users with
 * unconfirmed rows.
 *
 * INERT UNTIL THE KEY IS SET, and that is the whole shipping strategy. With
 * VITE_TURNSTILE_SITE_KEY absent - which is the state today, in CI, and in
 * every preview - isTurnstileEnabled() is false, no script is loaded, no
 * widget renders, and captchaToken is undefined at all three call sites, so
 * the forms behave exactly as they do now.
 *
 * WHY THAT MATTERS RATHER THAN BEING MERE TIDINESS. Turnstile enforcement in
 * Supabase is PROJECT-WIDE: the moment it is switched on in the dashboard,
 * every client that does not send a token is rejected - including the shipped
 * iOS and Android binaries, which do not send one. CLAUDE.md lists "adding a
 * required request field older binaries don't send" among the things that must
 * never happen in a single release. So the web code lands first and does
 * nothing; the switch is an owner action that must not be taken until the
 * mobile decision in WEB-SEC-029 AC4 is made and recorded.
 */

/** Cloudflare's always-passes test key, for local runs and Playwright. */
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";

export const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** The configured site key, or null when Turnstile is not configured. */
export function getTurnstileSiteKey(): string | null {
  const key = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  return typeof key === "string" && key.trim() ? key.trim() : null;
}

/** True only when a site key is configured. Everything else keys off this. */
export function isTurnstileEnabled(): boolean {
  return getTurnstileSiteKey() !== null;
}

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
      appearance?: "always" | "execute" | "interaction-only";
      size?: "normal" | "flexible" | "compact";
      theme?: "auto" | "light" | "dark";
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi | null> | null = null;

/**
 * Loads the Turnstile script once, on demand.
 *
 * Deliberately NOT in index.html: a third-party script on every route, for a
 * widget that appears on one, is the kind of thing WEB-PERF-020 exists to stop.
 * Resolves null rather than rejecting when the script cannot load - see
 * useTurnstile for why that is a deliberate fail-open.
 */
export function loadTurnstile(): Promise<TurnstileApi | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${TURNSTILE_SCRIPT_SRC}"]`,
    );
    const script = existing ?? document.createElement("script");
    const done = () => resolve(window.turnstile ?? null);

    script.addEventListener("load", done, { once: true });
    script.addEventListener("error", () => resolve(null), { once: true });

    if (!existing) {
      script.src = TURNSTILE_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });

  return scriptPromise;
}

/** Test seam: forget the cached load so a suite can start clean. */
export function resetTurnstileLoaderForTests(): void {
  scriptPromise = null;
}

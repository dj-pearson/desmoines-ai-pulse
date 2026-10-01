import { useCallback, useEffect, useRef, useState } from "react";
import {
  getTurnstileSiteKey,
  isTurnstileEnabled,
  loadTurnstile,
} from "@/lib/turnstile";
import { createLogger } from "@/lib/logger";

const log = createLogger("useTurnstile");

export interface UseTurnstileResult {
  /** Attach to the element the widget should render into. */
  containerRef: React.RefObject<HTMLDivElement>;
  /** The solved token, or undefined. Pass straight to Supabase as captchaToken. */
  token: string | undefined;
  /** True when a site key is configured at all. */
  enabled: boolean;
  /** Throw away the current token and re-challenge. Call after a failed submit. */
  reset: () => void;
}

/**
 * Solves a Turnstile challenge in the background (WEB-SEC-029).
 *
 * MANAGED/INVISIBLE, so the form stays one step: appearance "execute" renders
 * nothing for a visitor who passes, and only shows a checkbox for one Cloudflare
 * wants to interrogate. AC3 asks for exactly this - a captcha that adds a step
 * to every signup costs more conversions than it saves bots.
 *
 * IT FAILS OPEN, AND THAT IS NOT A WEAKNESS HERE. If the script is blocked, the
 * widget errors, or no site key is configured, `token` stays undefined and the
 * form submits without one. The enforcement that matters is SERVER-side: when
 * Supabase Auth has Turnstile switched on it rejects a tokenless request itself.
 * A client-side block would only stop the honest visitor behind a strict ad
 * blocker, while a script - which never runs this code - is unaffected.
 *
 * A TOKEN IS SINGLE-USE. Supabase rejects a replayed one, so reset() must be
 * called after any failed submit or the visitor's second attempt fails for a
 * reason they cannot see.
 */
export function useTurnstile(): UseTurnstileResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [token, setToken] = useState<string | undefined>(undefined);
  const enabled = isTurnstileEnabled();

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    void loadTurnstile().then((turnstile) => {
      if (cancelled || !turnstile || !containerRef.current) return;
      const sitekey = getTurnstileSiteKey();
      if (!sitekey) return;

      try {
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey,
          appearance: "execute",
          size: "flexible",
          theme: "auto",
          callback: (solved) => setToken(solved),
          // Both of these leave `token` undefined, which is the fail-open path
          // described above rather than a state the form has to handle.
          "error-callback": () => {
            log.warn("render", "Turnstile challenge errored; submitting without a token");
            setToken(undefined);
          },
          "expired-callback": () => setToken(undefined),
        });
      } catch (error) {
        log.warn("render", "Turnstile failed to render", { error });
      }
    });

    return () => {
      cancelled = true;
      const id = widgetIdRef.current;
      if (id && window.turnstile) {
        try {
          window.turnstile.remove(id);
        } catch {
          // Already gone; nothing to clean up.
        }
      }
      widgetIdRef.current = null;
    };
  }, [enabled]);

  const reset = useCallback(() => {
    setToken(undefined);
    const id = widgetIdRef.current;
    if (id && window.turnstile) {
      try {
        window.turnstile.reset(id);
      } catch (error) {
        log.warn("reset", "Turnstile reset failed", { error });
      }
    }
  }, []);

  return { containerRef, token, enabled, reset };
}

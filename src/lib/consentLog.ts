/**
 * Consent logging helper
 *
 * Writes append-only rows to the `consent_records` table so we can demonstrate
 * affirmative, timestamped consent when required by GDPR, CCPA/CPRA, CAN-SPAM,
 * or TCPA. Safe to call from the browser — RLS restricts what a user can write
 * to their own rows (and anonymous rows for pre-auth events).
 *
 * Usage:
 *   await logConsent({ type: 'terms', granted: true, source: 'signup', policyVersion: '2026-03-10' });
 *
 * This helper never throws — consent logging is best-effort so that a logging
 * failure cannot block a consent action (e.g. signup, cookie banner). The call
 * site is responsible for the primary state change (e.g. subscribing the user).
 */

import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("consentLog");

export type ConsentType =
  | "terms"
  | "marketing_email"
  | "marketing_sms"
  | "personalization_ai"
  | "cookies_analytics"
  | "cookies_advertising"
  | "newsletter"
  | "data_sale_opt_out";

export interface LogConsentInput {
  type: ConsentType;
  granted: boolean;
  source:
    | "signup"
    | "profile_settings"
    | "cookie_banner"
    | "newsletter_form"
    | "unsubscribe_page"
    | "api"
    | "other";
  /** Version string of the policy the user accepted, if applicable. */
  policyVersion?: string;
  /** Optional email for anonymous flows; hashed before storage. */
  email?: string;
  /** Free-form JSON context (never include raw passwords / full PII). */
  metadata?: Record<string, unknown>;
}

/**
 * Simple SHA-256 email hash so we can correlate anonymous consent events to a
 * user without keeping the plaintext email in the audit log.
 */
async function hashEmail(email: string): Promise<string | null> {
  try {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return null;
    const enc = new TextEncoder().encode(normalized);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

export async function logConsent(input: LogConsentInput): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const email_hash = input.email ? await hashEmail(input.email) : null;

    const { error } = await supabase.from("consent_records").insert({
      user_id: user?.id ?? null,
      email_hash,
      consent_type: input.type,
      granted: input.granted,
      policy_version: input.policyVersion ?? null,
      source: input.source,
      user_agent:
        typeof navigator !== "undefined" ? navigator.userAgent : null,
      metadata: input.metadata ?? {},
    });
    if (error) {
      log.warn("insert", "failed to record consent", {
        type: input.type,
        error: error.message,
      });
    }
  } catch (err) {
    log.warn("insert", "unexpected error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Convenience helper used by the cookie consent banner to emit one row per
 * consent category that was granted or denied in a single banner interaction.
 */
export async function logCookieConsent(
  categories: {
    analytics: boolean;
    advertising: boolean;
  },
  extra?: Record<string, unknown>
): Promise<void> {
  await Promise.all([
    logConsent({
      type: "cookies_analytics",
      granted: categories.analytics,
      source: "cookie_banner",
      metadata: extra,
    }),
    logConsent({
      type: "cookies_advertising",
      granted: categories.advertising,
      source: "cookie_banner",
      metadata: extra,
    }),
  ]);
}

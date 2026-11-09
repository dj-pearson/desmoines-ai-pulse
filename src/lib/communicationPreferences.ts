import { supabase } from "@/integrations/supabase/client";

/**
 * The consent keys the web owns in profiles.communication_preferences.
 *
 * sms_notifications is no longer shown or written: no SMS sender exists, so a
 * switch for it controlled nothing. A stored value is left where it is.
 */
export type ConsentKey = "email_notifications" | "event_recommendations";

/**
 * ONLY AN EXPLICIT true IS AN OPT-IN (account plan WP5 item 5).
 *
 * This read `?? true`, so every account without the key - every Google and
 * Apple sign-up, which never passes through the sign-up form's unticked boxes -
 * rendered as opted in, and pressing Save for an unrelated interest wrote that
 * opt-in to the row. Sign-up leaves both unticked; so does this.
 *
 * Lives here rather than in PreferencesManager so the home page's For You rail
 * can honour the same answer without pulling the settings UI into its chunk.
 */
export function readOptIn(bag: unknown, key: ConsentKey): boolean {
  if (!bag || typeof bag !== "object") return false;
  return (bag as Record<string, unknown>)[key] === true;
}

/**
 * Write consent keys into the caller's own communication_preferences bag.
 *
 * The bag is shared (taste_preferences, ui_preferences and the lifecycle keys
 * live in it too) and a PostgREST update of a JSONB column replaces it, so this
 * reads first and merges. A failed read throws rather than writing over an
 * empty bag. It writes no consent_records row: callers that need one log it.
 */
export async function mergeConsentKeys(
  userId: string,
  patch: Partial<Record<ConsentKey, boolean>>,
): Promise<void> {
  const { data: current, error: readError } = await supabase
    .from("profiles")
    .select("communication_preferences")
    .eq("user_id", userId)
    .single();
  if (readError) throw readError;

  const existing = (current?.communication_preferences as Record<string, unknown> | null) ?? {};
  const { error } = await supabase
    .from("profiles")
    .update({ communication_preferences: { ...existing, ...patch } })
    .eq("user_id", userId);
  if (error) throw error;
}

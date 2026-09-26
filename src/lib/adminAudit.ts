import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("adminAudit");

export type AdminAuditSeverity = "low" | "medium" | "high";

export type AdminAuditEventType =
  | "admin_action"
  | "suspicious_activity"
  | "validation_error"
  | "auth_failure"
  | "rate_limit"
  | "security_anomaly";

export interface AdminAuditEntry {
  /** Short verb, e.g. "newsletter:unsubscribed". */
  action: string;
  /** What was acted on, e.g. "newsletter_subscribers". */
  resource: string;
  details?: Record<string, unknown> | null;
  severity?: AdminAuditSeverity;
  eventType?: AdminAuditEventType;
}

/** PostgREST's "no such function", returned until the migration is applied. */
const RPC_NOT_FOUND = "PGRST202";

/**
 * Write one security_audit_logs row as the signed-in admin.
 *
 * Goes through record_admin_audit (migration 20261005000002), which takes the
 * actor from auth.uid() and refuses non-admins. The browser used to insert
 * into the table directly, which only worked because the table accepts inserts
 * from anyone - including rows with someone else's user_id. Those policies are
 * dropped in the release after this one (docs/plans/NON_CORE_REVIEW_2026-09.md,
 * WP5).
 *
 * Until the migration is applied the RPC answers PGRST202, and only in that
 * case this falls back to the old direct insert so no audit row is lost in the
 * window. Remove the fallback with the policy drop.
 *
 * Never throws; returns whether the row was written. An audit hiccup must not
 * fail the admin action it describes.
 */
export async function recordAdminAudit(entry: AdminAuditEntry): Promise<boolean> {
  const severity = entry.severity ?? "low";
  const eventType = entry.eventType ?? "admin_action";
  const details = entry.details ? JSON.parse(JSON.stringify(entry.details)) : null;
  try {
    // `as never` until the types are regenerated with 20261005000002 applied,
    // the same pattern as publish_submission in EventSubmissionsManager.
    const { error } = await supabase.rpc("record_admin_audit" as never, {
      p_action: entry.action,
      p_resource: entry.resource,
      p_details: details,
      p_severity: severity,
      p_event_type: eventType,
    } as never);
    if (!error) return true;

    if ((error as { code?: string }).code !== RPC_NOT_FOUND) {
      log.warn("recordAdminAudit", "record_admin_audit failed", { error: error.message });
      return false;
    }

    const { data: auth } = await supabase.auth.getUser();
    const actor = auth.user?.id ?? null;
    const { error: insertError } = await supabase.from("security_audit_logs").insert({
      event_type: eventType,
      identifier: actor ?? "admin",
      user_id: actor,
      action: entry.action,
      resource: entry.resource,
      severity,
      details,
    });
    if (insertError) {
      log.warn("recordAdminAudit", "fallback insert failed", { error: insertError.message });
      return false;
    }
    return true;
  } catch (err) {
    log.error("recordAdminAudit", "unexpected error writing audit row", { err });
    return false;
  }
}

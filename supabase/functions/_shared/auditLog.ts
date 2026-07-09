/**
 * Lightweight audit-log writer for sensitive admin/account operations.
 *
 * Writes an immutable row to public.security_audit_logs. Best-effort: never
 * throws, so an audit hiccup can't break the underlying operation. Use a
 * service-role client so the insert isn't blocked by RLS.
 */
// deno-lint-ignore no-explicit-any
type ServiceClient = any;

export interface AuditEntry {
  /** e.g. 'account_deletion', 'campaign_refund', 'role_assignment' */
  eventType: string;
  /** The actor performing the action (verified user id). Doubles as identifier. */
  actorId: string | null;
  /** Short verb, e.g. 'delete_account', 'process_refund'. */
  action: string;
  /** Affected table/resource, e.g. 'profiles', 'campaigns'. */
  resource: string;
  severity?: 'low' | 'medium' | 'high';
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
}

export async function writeAuditLog(
  supabase: ServiceClient,
  entry: AuditEntry,
): Promise<void> {
  try {
    await supabase.from('security_audit_logs').insert({
      event_type: entry.eventType,
      identifier: entry.actorId ?? 'system',
      user_id: entry.actorId,
      action: entry.action,
      resource: entry.resource,
      severity: entry.severity ?? 'medium',
      ip_address: entry.ipAddress ?? null,
      user_agent: entry.userAgent ?? null,
      details: entry.details ?? null,
    });
  } catch (err) {
    console.error('[auditLog] failed to write security_audit_logs row:', err);
  }
}

export interface AgentAuditEntry {
  agentKey: string;
  /** The run that took the action (ledger run id / runtime correlation id). */
  runId?: string | null;
  /** e.g. 'create_task', 'execute_publish_content', 'tool:search_events'. */
  actionType: string;
  /** What was acted on, e.g. 'agent_tasks:<id>', 'events:<id>', a URL. */
  targetRef?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  actor?: string;
}

/**
 * Append one row to the immutable agent action audit trail (AOS-GOV-002).
 * Best-effort: never throws, so an audit hiccup can't break the action. The
 * table is append-only (UPDATE blocked by trigger; no non-service RLS).
 */
export async function writeAgentAudit(
  supabase: ServiceClient,
  entry: AgentAuditEntry,
): Promise<void> {
  try {
    await supabase.from('agent_audit_log').insert({
      agent_key: entry.agentKey,
      run_id: entry.runId ?? null,
      action_type: entry.actionType,
      target_ref: entry.targetRef ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      actor: entry.actor ?? 'agent',
    });
  } catch (err) {
    console.error('[auditLog] failed to write agent_audit_log row:', err);
  }
}

/** Pull the trusted client IP from request headers (CF first). */
export function auditIp(req: Request): string | null {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',').pop()?.trim() ||
    null
  );
}

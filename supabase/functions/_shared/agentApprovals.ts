/**
 * agentApprovals — the human-in-the-loop approval gate (AOS-CORE-007).
 *
 * Some agent actions must not run unattended (publishing, outreach, refunds,
 * destructive fixes). `requiresApproval(actionType)` marks those; a guarded
 * action creates a pending approval and stops instead of executing. A human
 * approves it later (which runs the registered executor) or rejects it.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { writeAgentAudit } from "./auditLog.ts";

/**
 * Action types that must be human-approved before they run. Agents tag a tool
 * with one of these (AgentTool.actionType); the runtime queues an approval
 * instead of executing.
 */
export const GUARDED_ACTIONS = new Set<string>([
  "publish_content",
  "send_outreach",
  "send_bulk_email",
  "process_refund",
  "issue_credit",
  "delete_records",
  "destructive_fix",
  "modify_pricing",
  "external_post",
]);

/** Default approval TTL (hours) before an unattended request expires. */
export const DEFAULT_APPROVAL_TTL_HOURS = 24;

export function requiresApproval(actionType: string | undefined | null): boolean {
  return !!actionType && GUARDED_ACTIONS.has(actionType);
}

export interface CreateApprovalArgs {
  agentKey: string;
  actionType: string;
  payload?: Record<string, unknown>;
  ttlHours?: number;
}

export interface CreateApprovalResult {
  ok: boolean;
  approvalId?: string;
  error?: string;
}

/** Create a pending approval row for a guarded action. Best-effort. */
export async function createApproval(
  supabase: SupabaseClient,
  args: CreateApprovalArgs,
): Promise<CreateApprovalResult> {
  const ttl = args.ttlHours ?? DEFAULT_APPROVAL_TTL_HOURS;
  const expiresAt = new Date(Date.now() + ttl * 60 * 60 * 1000).toISOString();
  try {
    const { data, error } = await supabase
      .from("agent_action_approvals")
      .insert({
        agent_key: args.agentKey,
        action_type: args.actionType,
        proposed_payload: args.payload ?? null,
        status: "pending",
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    if (error) throw error;
    await writeAgentAudit(supabase, {
      agentKey: args.agentKey,
      actionType: "create_approval",
      targetRef: `agent_action_approvals:${data?.id}`,
      after: { actionType: args.actionType, expiresAt },
    });
    return { ok: true, approvalId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[agentApprovals] failed to create approval for ${args.agentKey}/${args.actionType}:`, message);
    return { ok: false, error: message };
  }
}

/**
 * Executor registry: maps an action_type to the function that actually performs
 * it once a human approves. Concrete guarded actions register their executor as
 * their agent story lands. Unregistered types are surfaced (not silently run).
 */
export type ApprovalExecutor = (
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

const EXECUTORS = new Map<string, ApprovalExecutor>();

export function registerApprovalExecutor(actionType: string, fn: ApprovalExecutor): void {
  EXECUTORS.set(actionType, fn);
}

export function hasApprovalExecutor(actionType: string): boolean {
  return EXECUTORS.has(actionType);
}

/**
 * Execute a now-approved action. Returns the executor result, or a
 * `{ executed: false }` marker when no executor is registered (so the approval
 * is recorded as approved but the side effect is left to a human/registration).
 */
export async function executeApprovedAction(
  supabase: SupabaseClient,
  actionType: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const fn = EXECUTORS.get(actionType);
  if (!fn) {
    return { executed: false, note: `no executor registered for action_type "${actionType}"` };
  }
  try {
    const result = await fn(supabase, payload);
    await writeAgentAudit(supabase, {
      agentKey: "approval-executor",
      actionType: `execute_${actionType}`,
      before: payload,
      after: { executed: true, ...result },
      actor: "agent",
    });
    return { executed: true, ...result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await writeAgentAudit(supabase, {
      agentKey: "approval-executor",
      actionType: `execute_${actionType}`,
      before: payload,
      after: { executed: false, error: message },
    });
    return { executed: false, error: message };
  }
}

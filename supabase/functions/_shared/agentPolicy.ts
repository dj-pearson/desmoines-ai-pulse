/**
 * agentPolicy — the guardrail policy layer (AOS-GOV-003).
 *
 * Each agent is constrained to an explicit allowlist of action types, enforced
 * centrally in the runtime before any action executes. An agent can never
 * perform an action outside its remit, even if its prompt is manipulated —
 * default-deny for anything not listed. Financial/destructive actions are
 * approval-required by policy regardless of the agent's allowlist.
 */

import { GUARDED_ACTIONS } from "./agentApprovals.ts";

/**
 * Financial / destructive action types. These always require human approval
 * (on top of any per-agent allowlisting) — a refund, delete, mass-send, or
 * unpublish must never run unattended.
 */
export const FINANCIAL_DESTRUCTIVE_ACTIONS = new Set<string>([
  "process_refund",
  "issue_credit",
  "modify_pricing",
  "delete_records",
  "destructive_fix",
  "unpublish_content",
  "send_bulk_email",
  "external_post",
]);

export interface AgentPolicy {
  /** Allowed action types, or '*' for "any" (still subject to approval rules). */
  allow: string[] | "*";
}

/**
 * Per-agent allowlists. Keep these tight — an agent should only list the
 * action types it genuinely needs. Unlisted agents default-deny all action
 * types (reads are always allowed; only tools carrying an actionType are gated).
 */
export const AGENT_POLICY: Record<string, AgentPolicy> = {
  "dev-agent": { allow: ["open_pr", "comment", "create_task"] },
  "maintenance-agent": { allow: ["delete_records", "destructive_fix", "create_task"] },
  "nurture-agent": { allow: ["publish_content", "send_outreach", "schedule_post", "create_task"] },
  "prospect-agent": { allow: ["enrich_prospect", "create_task"] },
  "support-agent": { allow: ["reply_ticket", "issue_credit", "create_task"] },
  "account-manager-agent": { allow: ["update_account", "process_refund", "create_task"] },
  "billing-selfservice": { allow: ["process_refund", "cancel_subscription", "resend_receipt", "create_task"] },
  "churn-winback": { allow: ["issue_credit", "send_outreach", "create_task"] },
  "subscription-nurture": { allow: ["issue_credit", "send_outreach", "create_task"] },
  "security-agent": { allow: ["flag_incident", "create_task"] },
  "governance-agent": { allow: ["flag_violation", "create_task"] },
};

/**
 * Is this action type allowed for this agent? Default-deny: an agent not in the
 * policy map, or an action not in its allowlist, is refused.
 */
export function isActionAllowed(agentKey: string, actionType: string): boolean {
  const policy = AGENT_POLICY[agentKey];
  if (!policy) return false;
  if (policy.allow === "*") return true;
  return policy.allow.includes(actionType);
}

/**
 * Does this action require human approval by policy? True for globally-guarded
 * actions (agentApprovals.GUARDED_ACTIONS) and all financial/destructive types.
 */
export function policyRequiresApproval(actionType: string): boolean {
  return GUARDED_ACTIONS.has(actionType) || FINANCIAL_DESTRUCTIVE_ACTIONS.has(actionType);
}

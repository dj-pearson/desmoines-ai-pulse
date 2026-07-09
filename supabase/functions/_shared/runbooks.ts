/**
 * runbooks — codified incident-response actions (AOS-SEC-005).
 *
 * Maps an incident type to an ordered set of response steps. Safe, reversible
 * steps (notify, rotate-reminder) auto-run as tier-1; account/data-affecting
 * steps (revoke sessions, lock account, block IP) are approval-gated via
 * AOS-CORE-007. A responder triggers steps from /admin/inbox; each executed step
 * is audited and appended to the incident task timeline.
 */

export interface RunbookStep {
  id: string;
  label: string;
  /** The action verb. Approval-gated ones reuse the AOS-CORE-007 approval flow. */
  action:
    | "notify_ops"
    | "notify_user"
    | "rotate_reminder"
    | "revoke_sessions"
    | "lock_account"
    | "block_ip"
    | "throttle_client"
    | "flag_account_review"
    | "reconcile_entitlement";
  /** true => queues a human approval instead of running immediately. */
  requiresApproval: boolean;
  description: string;
}

const NOTIFY: RunbookStep = {
  id: "notify_ops",
  label: "Notify ops",
  action: "notify_ops",
  requiresApproval: false,
  description: "Send a summary of this incident to the ops channel (safe, reversible).",
};

export const RUNBOOKS: Record<string, RunbookStep[]> = {
  credential_stuffing: [
    NOTIFY,
    { id: "block_ip", label: "Block source IP", action: "block_ip", requiresApproval: true, description: "Add the source IP to the block list." },
    { id: "revoke_sessions", label: "Revoke affected sessions", action: "revoke_sessions", requiresApproval: true, description: "Force sign-out of the targeted account's sessions." },
  ],
  quota_abuse: [
    NOTIFY,
    { id: "throttle_client", label: "Throttle client", action: "throttle_client", requiresApproval: true, description: "Apply a stricter rate limit to the abusive client within existing infra." },
  ],
  refund: [
    NOTIFY,
    { id: "flag_account_review", label: "Flag account for review", action: "flag_account_review", requiresApproval: true, description: "Mark the account for a manual billing/fraud review." },
  ],
  entitlement: [
    NOTIFY,
    { id: "reconcile_entitlement", label: "Reconcile entitlement", action: "reconcile_entitlement", requiresApproval: true, description: "Reconcile the subscription/entitlement against Stripe." },
  ],
  secret_leak: [
    NOTIFY,
    { id: "rotate_reminder", label: "Send rotation reminder", action: "rotate_reminder", requiresApproval: false, description: "Remind the owner to rotate the exposed secret (safe)." },
    { id: "revoke_sessions", label: "Revoke service sessions", action: "revoke_sessions", requiresApproval: true, description: "Revoke sessions/keys that may have used the leaked secret." },
  ],
  policy_violation: [NOTIFY],
  generic: [NOTIFY],
};

/** Determine the incident type from a task's payload / origin. */
export function incidentTypeOf(task: {
  payload?: Record<string, unknown> | null;
  dedupe_key?: string | null;
  agent_key?: string | null;
}): string {
  const p = task.payload ?? {};
  const raw = String(p.anomaly ?? p.finding ?? p.reason ?? "");
  if (raw.startsWith("credential_stuffing")) return "credential_stuffing";
  if (raw.startsWith("quota")) return "quota_abuse";
  if (raw.startsWith("refund")) return "refund";
  if (raw.startsWith("entitlement")) return "entitlement";
  if (raw === "secret_leak" || task.dedupe_key === "secret_leak") return "secret_leak";
  if (raw.startsWith("cve") || task.agent_key === "dependency-cve-scanner") return "cve";
  if (raw === "policy_denied") return "policy_violation";
  return "generic";
}

export function runbookFor(task: {
  payload?: Record<string, unknown> | null;
  dedupe_key?: string | null;
  agent_key?: string | null;
}): { incidentType: string; steps: RunbookStep[] } {
  const incidentType = incidentTypeOf(task);
  return { incidentType, steps: RUNBOOKS[incidentType] ?? RUNBOOKS.generic };
}

export function stepById(incidentType: string, stepId: string): RunbookStep | undefined {
  return (RUNBOOKS[incidentType] ?? RUNBOOKS.generic).find((s) => s.id === stepId);
}

/**
 * agentTasks — the tiered task + escalation contract (AOS-CORE-004).
 *
 * createAgentTask() is how an agent files a work item. It applies the agent's
 * per-category tier-1 confidence threshold (from agent_registry): a task whose
 * confidence meets or beats the threshold takes the tier-1 auto path; below it,
 * the task escalates to a human tier. An SLA due date is computed from a
 * per-category policy so the escalation console can flag overdue work.
 *
 * Fail-safe: the DB write is surfaced (callers usually want the task id), but
 * threshold/SLA computation never throws — a missing registry row falls back to
 * the permissive getAgentConfig default.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getAgentConfig } from "./agentConfig.ts";
import { writeAgentAudit } from "./auditLog.ts";

export type AgentTaskStatus =
  | "open"
  | "auto_resolving"
  | "resolved"
  | "escalated"
  | "assigned"
  | "closed"
  | "failed";

export type AgentCategory =
  | "dev"
  | "maintain"
  | "nurture"
  | "prospect"
  | "support"
  | "manage"
  | "security"
  | "governance";

export interface CreateAgentTaskInput {
  agentKey: string;
  category: AgentCategory;
  title: string;
  /** Model/agent confidence in [0,1] that this item is correct/actionable. */
  confidence: number;
  payload?: Record<string, unknown>;
  /** Override the confidence→tier decision (e.g. force human review). */
  forceTier?: 1 | 2 | 3;
  /** Coalescing key: if an open task with the same (agentKey, dedupeKey) exists,
   *  it is returned instead of creating a duplicate. */
  dedupeKey?: string;
}

export interface AgentTaskRow {
  id: string;
  agent_key: string;
  category: string;
  tier: number;
  title: string;
  payload: Record<string, unknown> | null;
  confidence: number | null;
  status: AgentTaskStatus;
  assigned_to: string | null;
  sla_due_at: string | null;
  resolution: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAgentTaskResult {
  ok: boolean;
  task?: AgentTaskRow;
  tier: number;
  status: AgentTaskStatus;
  slaDueAt: string | null;
  error?: string;
}

/**
 * Per-category SLA policy, in hours from creation, by resolution tier.
 * tier 1 (auto) gets a short watchdog window; tier 2/3 (human) get progressively
 * longer human-response windows. Security is the tightest across the board.
 * `null` means "no SLA" (not applicable).
 */
const SLA_HOURS: Record<AgentCategory, { 1: number | null; 2: number; 3: number }> = {
  dev:        { 1: 6,  2: 48, 3: 96 },
  maintain:   { 1: 6,  2: 48, 3: 96 },
  nurture:    { 1: 12, 2: 72, 3: 120 },
  prospect:   { 1: 12, 2: 72, 3: 120 },
  support:    { 1: 2,  2: 8,  3: 24 },
  manage:     { 1: 8,  2: 48, 3: 96 },
  security:   { 1: 1,  2: 4,  3: 12 },
  governance: { 1: 4,  2: 24, 3: 48 },
};

const DEFAULT_SLA = { 1: 6 as number | null, 2: 48, 3: 96 };

/**
 * Decide the tier from confidence vs the agent's registry threshold.
 *  - confidence >= threshold        -> tier 1 (auto path)
 *  - threshold/2 <= confidence < th  -> tier 2 (human)
 *  - confidence < threshold/2        -> tier 3 (senior human)
 */
export function decideTier(confidence: number, threshold: number): 1 | 2 | 3 {
  if (confidence >= threshold) return 1;
  if (confidence >= threshold / 2) return 2;
  return 3;
}

function slaDueAt(category: AgentCategory, tier: 1 | 2 | 3, now: number): string | null {
  const policy = SLA_HOURS[category] ?? DEFAULT_SLA;
  const hours = policy[tier];
  if (hours == null) return null;
  return new Date(now + hours * 60 * 60 * 1000).toISOString();
}

export async function createAgentTask(
  supabase: SupabaseClient,
  input: CreateAgentTaskInput,
): Promise<CreateAgentTaskResult> {
  const cfg = await getAgentConfig(supabase, input.agentKey);
  const threshold = cfg.tier1ConfidenceThreshold;

  const tier: 1 | 2 | 3 = input.forceTier ?? decideTier(input.confidence, threshold);
  // tier 1 clears itself autonomously; tier 2/3 wait for a human.
  const status: AgentTaskStatus = tier === 1 ? "auto_resolving" : "escalated";
  const due = slaDueAt(input.category, tier, Date.now());

  try {
    // Idempotent on dedupeKey: don't stack duplicate open tasks for the same
    // ongoing condition (e.g. a persistent security anomaly re-detected each run).
    if (input.dedupeKey) {
      const { data: existing } = await supabase
        .from("agent_tasks")
        .select("*")
        .eq("agent_key", input.agentKey)
        .eq("dedupe_key", input.dedupeKey)
        .in("status", ["open", "escalated", "assigned", "auto_resolving"])
        .limit(1)
        .maybeSingle();
      if (existing) {
        return { ok: true, task: existing as AgentTaskRow, tier: existing.tier, status: existing.status, slaDueAt: existing.sla_due_at };
      }
    }

    const { data, error } = await supabase
      .from("agent_tasks")
      .insert({
        agent_key: input.agentKey,
        category: input.category,
        tier,
        title: input.title,
        payload: input.payload ?? null,
        confidence: input.confidence,
        status,
        sla_due_at: due,
        dedupe_key: input.dedupeKey ?? null,
      })
      .select("*")
      .single();

    if (error) throw error;

    const task = data as AgentTaskRow;
    await writeAgentAudit(supabase, {
      agentKey: input.agentKey,
      actionType: "create_task",
      targetRef: `agent_tasks:${task.id}`,
      after: { tier, status, category: input.category, title: input.title, confidence: input.confidence },
    });

    return { ok: true, task, tier, status, slaDueAt: due };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[agentTasks] failed to create task for "${input.agentKey}":`, message);
    return { ok: false, tier, status, slaDueAt: due, error: message };
  }
}

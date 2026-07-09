/**
 * agent pr-review-agent (AOS-DEV-006) — records each automated PR review as a
 * budgeted/audited agent run. The deterministic review itself runs in CI
 * (scripts/pr-review.mjs) and posts its summary here.
 *
 * Consolidated into `agent-runner` (was `agent-pr-review/index.ts`).
 */
import { writeAgentAudit } from "../auditLog.ts";
import type { AgentRun } from "./types.ts";

const AGENT_KEY = "pr-review-agent";

export const run: AgentRun = async (ctx, { supabase, body }) => {
  const high = Number(body.high) || 0;
  const advisory = Number(body.advisory) || 0;
  const prNumber = body.prNumber ? String(body.prNumber).slice(0, 20) : null;
  const prUrl = body.prUrl ? String(body.prUrl).slice(0, 300) : null;

  ctx.processed(high + advisory);
  ctx.summary(`PR ${prNumber ?? "?"}: ${high} blocking, ${advisory} advisory`);
  await writeAgentAudit(supabase, {
    agentKey: AGENT_KEY,
    actionType: high > 0 ? "pr_review_block" : "pr_review_pass",
    targetRef: prUrl ?? `pr:${prNumber ?? "?"}`,
    after: { high, advisory, prNumber },
  });
  ctx.meta({ high, advisory, prNumber });
  return { high, advisory, blocked: high > 0 };
};

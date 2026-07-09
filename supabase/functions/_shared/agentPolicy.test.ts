/**
 * Unit-style tests for the guardrail policy layer (AOS-GOV-003).
 * Run with: `deno test supabase/functions/_shared/agentPolicy.test.ts`
 */
import {
  isActionAllowed,
  policyRequiresApproval,
  FINANCIAL_DESTRUCTIVE_ACTIONS,
} from "./agentPolicy.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

Deno.test("allowlisted action is allowed", () => {
  assert(isActionAllowed("nurture-agent", "publish_content"), "nurture may publish");
  assert(isActionAllowed("support-agent", "issue_credit"), "support may issue credit");
});

Deno.test("action outside an agent's allowlist is denied", () => {
  assert(!isActionAllowed("nurture-agent", "process_refund"), "nurture may NOT refund");
  assert(!isActionAllowed("prospect-agent", "delete_records"), "prospect may NOT delete");
});

Deno.test("unknown agent default-denies all action types", () => {
  assert(!isActionAllowed("unknown-agent", "publish_content"), "unknown agent denied");
  assert(!isActionAllowed("", "anything"), "empty agent denied");
});

Deno.test("financial/destructive actions require approval", () => {
  for (const a of ["process_refund", "delete_records", "send_bulk_email", "unpublish_content"]) {
    assert(policyRequiresApproval(a), `${a} requires approval`);
    assert(FINANCIAL_DESTRUCTIVE_ACTIONS.has(a), `${a} is financial/destructive`);
  }
});

Deno.test("a benign allowed action does not require approval", () => {
  assert(!policyRequiresApproval("comment"), "comment is not approval-gated");
  assert(!policyRequiresApproval("enrich_prospect"), "enrich is not approval-gated");
});

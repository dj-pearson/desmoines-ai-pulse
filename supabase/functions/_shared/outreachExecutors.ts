/**
 * outreachExecutors — approving the outreach step-1 template (AOS-PROSPECT-004).
 * Importing this module registers the `send_outreach` approval executor, so when
 * an admin approves the queued "approve outreach template" request in the console
 * (executeApprovedAction), the step-1 template is flipped to approved and the
 * sequence may begin. Nothing is sent by the executor itself.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { registerApprovalExecutor } from "./agentApprovals.ts";

registerApprovalExecutor("send_outreach", async (supabase: SupabaseClient, payload: Record<string, unknown>) => {
  const step = Number(payload.step) || 1;
  const approvalId = payload.approvalId ? String(payload.approvalId) : null;
  await supabase
    .from("outreach_templates")
    .update({ approved: true, approved_at: new Date().toISOString(), approval_id: approvalId })
    .eq("step", step);
  return { executed: true, approvedStep: step };
});

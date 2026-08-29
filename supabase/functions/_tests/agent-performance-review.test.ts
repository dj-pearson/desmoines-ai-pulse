/**
 * The weekly review must not turn an unwritten column into a finding
 * (AOS-MANAGE-007 AC3: sourced only from real ledger data).
 *
 * automation_job_runs carries items_escalated, tokens_used and cost_usd, and on
 * the 277 rows present when this was written all three are ZERO on every row.
 * That is indistinguishable from a column nothing writes, so "0 escalations" and
 * "$0.00 spent" would be findings invented out of an absence - the same defect
 * WEB-BE-032 fixed in agent-ops-digest and AOS-MANAGE-001 had to design around.
 *
 * The helpers are exported from index.ts, which calls Deno.serve at import time,
 * so these import it knowing a server starts; the assertions are pure.
 */
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { reviewLines, sourced, summarise } from "../agent-performance-review/index.ts";

const run = (over: Record<string, unknown> = {}) => ({
  job_name: "moderate-content",
  status: "success",
  items_processed: 0,
  items_failed: 0,
  items_escalated: 0,
  tokens_used: 0,
  cost_usd: 0,
  attempts: 1,
  error: null,
  started_at: "2026-08-29T10:00:00Z",
  finished_at: "2026-08-29T10:00:02Z",
  ...over,
});

Deno.test("summarise groups by job and counts successes", () => {
  const stats = summarise([
    run(),
    run({ status: "failed" }),
    run({ job_name: "backfill-images", items_processed: 4, items_failed: 1 }),
  ]);
  const moderate = stats.find((s) => s.job === "moderate-content")!;
  assertEquals(moderate.runs, 2);
  assertEquals(moderate.succeeded, 1);
  const backfill = stats.find((s) => s.job === "backfill-images")!;
  assertEquals(backfill.processed, 4);
  assertEquals(backfill.failed, 1);
  assertEquals(backfill.avgSeconds, 2);
});

Deno.test("an all-zero column is reported as UNSOURCED, not as a zero", () => {
  const lines = reviewLines([run(), run(), run()], 7);
  const body = lines.join("\n");
  assertStringIncludes(body, "UNAVAILABLE");
  assertStringIncludes(body, "items_escalated");
  assertStringIncludes(body, "tokens_used");
  assertStringIncludes(body, "cost_usd");
  assert(
    !/0 escalations|\$0\.00/.test(body),
    "an unwritten column must never be rendered as a zero finding",
  );
});

Deno.test("NEGATIVE CONTROL - a column with real data is not called unsourced", () => {
  // Without this the check above would pass for code that always says
  // UNAVAILABLE, which would be just as useless in the other direction.
  assertEquals(sourced([run(), run({ tokens_used: 1200 })], "tokens_used"), true);
  assertEquals(sourced([run(), run()], "tokens_used"), false);
  const lines = reviewLines([run({ items_escalated: 3, tokens_used: 10, cost_usd: 0.4 })], 7).join("\n");
  assertStringIncludes(lines, "every ledger column carries data");
});

Deno.test("a job that THREW is separated from a job whose ITEMS failed", () => {
  // The first version of this report bucketed both as "never succeeded", which
  // reads as one problem and is two with different owners. jobRunner reports
  // ok=TRUE for partial, so the degraded case is invisible to anything watching
  // run status - it is the one nothing else is looking at.
  const lines = reviewLines(
    [
      run({ job_name: "ai-article-pipeline", status: "failed", error: "suggest-article-topics failed: 500" }),
      run({ job_name: "validate-source-urls", status: "partial", items_failed: 3, items_processed: 0 }),
      run({ job_name: "cleanup-old-events", status: "success", items_processed: 944 }),
    ],
    7,
  ).join("\n");

  // Scoped to the FAILING section, not everything before DEGRADED: the RUNS
  // listing above it names every job, healthy ones included.
  const failingBlock = lines.split("-- FAILING")[1].split("-- DEGRADED")[0];
  assertStringIncludes(failingBlock, "ai-article-pipeline: 1 of 1 runs failed");
  assertStringIncludes(failingBlock, "suggest-article-topics failed: 500");
  assert(
    !failingBlock.includes("validate-source-urls"),
    "a partial run must not be reported as the job throwing",
  );

  const degradedBlock = lines.split("-- DEGRADED")[1].split("-- SUCCEEDING")[0];
  assertStringIncludes(degradedBlock, "validate-source-urls");
  assertStringIncludes(degradedBlock, "3 item(s) failed");

  // A healthy job appears in neither bucket.
  assert(!/cleanup-old-events: \d+ of/.test(lines));
});

Deno.test("a job that always succeeds while processing nothing is called out", () => {
  // 247 green runs that processed 0 items is indistinguishable from 247 runs
  // with nothing to do - the empty-scan trap, and the reason this section exists.
  const lines = reviewLines(
    [run({ job_name: "moderate-content", status: "success", items_processed: 0 }),
     run({ job_name: "moderate-content", status: "success", items_processed: 0 })],
    7,
  ).join("\n");
  const block = lines.split("-- SUCCEEDING WITHOUT DOING ANYTHING --")[1];
  assertStringIncludes(block, "moderate-content: 2 run(s), all succeeded, 0 items processed");
});

Deno.test("NEGATIVE CONTROL - a job that processes work is not called a no-op", () => {
  const lines = reviewLines([run({ job_name: "cleanup-old-events", items_processed: 944 })], 7).join("\n");
  const block = lines.split("-- SUCCEEDING WITHOUT DOING ANYTHING --")[1];
  assertStringIncludes(block, "none");
});
Deno.test("an empty window says so rather than reporting a clean sheet", () => {
  const lines = reviewLines([], 7).join("\n");
  assertStringIncludes(lines, "UNAVAILABLE");
  assert(
    !/none[\s\S]*every ledger column carries data/.test(lines),
    "no runs must not read as a healthy week",
  );
});
